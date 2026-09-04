/* ¿El estampado de identidad sigue sabiendo dónde escribir en chat.html?
 *
 * La razón de existir de esta prueba: scripts/estampar-identidad.mjs corre al
 * PUBLICAR, y si falla, falla la publicación. Que reviente aquí, en la
 * terminal, cuesta un minuto; que reviente en Vercel, cuesta un despliegue.
 *
 * Comprueba tres cosas distintas:
 *   1. que el script encuentre las cuatro etiquetas del head y las reemplace;
 *   2. que el texto que estampa sea el MISMO que el JS de chat.html pone
 *      después —si discreparan, la pestaña cambiaría de nombre sola al
 *      cargar—;
 *   3. que el archivo del repositorio siga siendo neutro, para que ninguna
 *      copia de cliente reparta un enlace con el nombre de Intellectum.
 */

import { readFileSync } from "node:fs";
import { estampar, textosDe } from "./estampar-identidad.mjs";
import { identidadPublica } from "../lib/cliente.js";

let fallos = 0;
const ok = (b, q) => { if (b) console.log("  ok   " + q); else { fallos++; console.log("  FALLA " + q); } };

const html = readFileSync(new URL("../chat.html", import.meta.url), "utf8");

console.log("\nEL HEAD DE chat.html SIGUE TENIENDO DÓNDE ESCRIBIR");

const textos = textosDe(identidadPublica());
let salida = null;
let error = null;
try { salida = estampar(html, textos); } catch (e) { error = e; }

ok(!error, "el script encuentra las cuatro etiquetas" + (error ? " → " + error.message : ""));

if (salida) {
  ok(salida.includes(`<title>${textos.titulo}</title>`), "el título queda con el nombre del negocio");
  ok(salida.includes(`content="${textos.descripcion}"`), "la descripción queda con el nombre del negocio");
  ok((salida.match(/id="og-titulo" content="([^"]*)"/) || [])[1] === textos.titulo,
     "og:title queda igual que el título (es lo que lee WhatsApp)");
  ok(estampar(salida, textos) === salida, "estampar dos veces da lo mismo que estamparlo una");
}

console.log("\nEL ESTAMPADO Y EL JS DICEN LO MISMO");

/* No se ejecuta el JS del archivo: se comprueba que los trozos de texto con
   los que arma el título sigan siendo los mismos que usa textosDe(). Si
   alguien cambia la redacción en uno de los dos lados, esto lo delata, que es
   justo lo que hace falta: dos textos distintos harían que la pestaña cambiara
   de nombre sola medio segundo después de cargar. */
const trozos = [
  ['"Habla con " + NEG.agente + " — "', "el título del JS empieza con «Habla con»"],
  ['"Habla con " + NEG.agente + ", el asistente de "', "la descripción del JS dice «el asistente de»"],
  ['"Te responde al instante, las 24 horas."', "la descripción del JS termina igual"],
];
for (const [trozo, que] of trozos) {
  ok(html.includes(trozo), que);
}

/* Y que esos mismos trozos sean los que salen de textosDe(). */
ok(textos.titulo === "Habla con IntelliA — Intellectum AI Solutions",
   `textosDe() arma el título esperado ("${textos.titulo}")`);
ok(textos.descripcion === "Habla con IntelliA, el asistente de Intellectum. Te responde al instante, las 24 horas.",
   "textosDe() arma la descripción esperada");

console.log("\nEL ARCHIVO DEL REPOSITORIO SIGUE SIENDO NEUTRO");

/* Si esto falla, alguien corrió "npm run build" y guardó el resultado. No es
   grave —la siguiente publicación lo vuelve a estampar con la identidad que
   toque— pero mientras tanto el repositorio dice "Intellectum" en un archivo
   que viaja a todos los clientes. */
const tituloEnDisco = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
ok(!/intellectum/i.test(tituloEnDisco),
   `el <title> guardado no nombra a ningún negocio ("${tituloEnDisco}")`);
const descEnDisco = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
ok(!/intellectum/i.test(descEnDisco), "la descripción guardada tampoco");

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
