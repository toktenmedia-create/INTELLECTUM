/**
 * ESTAMPAR LA IDENTIDAD EN chat.html, AL PUBLICAR.
 *
 * EL PROBLEMA. chat.html es un archivo estático y el mismo archivo viaja a
 * todos los despliegues, así que no puede decir de quién es: si dijera
 * "Intellectum", la ferretería que publica su copia repartiría un enlace de
 * chat con nuestro nombre. Por eso el título y la descripción del archivo son
 * neutros, y el nombre real lo pone el JS con lo que responde /api/negocio.
 *
 * POR QUÉ NO ALCANZA CON EL JS. Google sí ejecuta JavaScript y lee el título
 * corregido. Pero WhatsApp, Facebook y LinkedIn NO lo ejecutan cuando alguien
 * pega el enlace, y los rastreadores de las IA tampoco. Todos ellos se quedan
 * con "Habla con nuestro asistente", sin marca. Es decir: el problema no era
 * de buscadores, era de vistas previas.
 *
 * LA SOLUCIÓN. Al publicar, este script escribe el nombre real en el HTML,
 * antes de que el archivo llegue al CDN. Cada despliegue estampa el suyo,
 * porque lee la misma identidad que sirve /api/negocio: la ferretería queda
 * con la ferretería y nosotros con nosotros, del mismo archivo.
 *
 * TRES DECISIONES QUE VALE LA PENA CONOCER:
 *
 * 1. LA IDENTIDAD SALE DE identidadPublica(), NO DE UNA COPIA. Es exactamente
 *    la misma función que responde /api/negocio, así que lo estampado y lo que
 *    pone el JS después no pueden discrepar. Si discreparan, la pestaña
 *    cambiaría de nombre sola medio segundo después de cargar.
 *
 * 2. SI NO ENCUENTRA QUÉ REEMPLAZAR, ROMPE LA PUBLICACIÓN. Un aviso en el
 *    registro de la compilación no lo lee nadie: el error viviría para
 *    siempre. Que falle aquí duele diez minutos; que falle en silencio, meses.
 *    Y para que eso no ocurra en la publicación sino antes, "npm test" corre
 *    esta misma comprobación.
 *
 * 3. SE PUEDE CORRER MIL VECES. Reemplaza el elemento entero, no un texto
 *    concreto, así que da igual lo que hubiera antes. Un chat.html estampado
 *    por error en el repositorio se vuelve a estampar solo en la siguiente
 *    publicación, con la identidad que toque.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { identidadPublica } from "../lib/cliente.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVO = join(RAIZ, "chat.html");

/** Para que el nombre de un negocio no pueda romper el HTML ni inyectar nada. */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * El título y la descripción, armados EXACTAMENTE igual que en identidad() de
 * chat.html. Si algún día cambia allá, cambia aquí: son el mismo texto visto
 * por dos caminos, y la prueba compara los dos.
 */
export function textosDe(ident) {
  const agente = ident.agente;
  const nombre = ident.nombre;
  const corto = ident.nombreCorto;
  return {
    titulo: (agente ? "Habla con " + agente + " — " : "") + nombre,
    descripcion:
      (agente ? "Habla con " + agente + ", el asistente de " + corto + ". " : "") +
      "Te responde al instante, las 24 horas.",
  };
}

/**
 * Deja el HTML estampado. Devuelve el texto nuevo, o lanza si el head no tiene
 * la forma que este script sabe tocar.
 */
export function estampar(html, { titulo, descripcion }) {
  const t = esc(titulo);
  const d = esc(descripcion);

  const cambios = [
    // <title>…</title>
    [/<title>[^<]*<\/title>/i, `<title>${t}</title>`, "<title>"],
    // <meta name="description" content="…">
    [
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${d}" />`,
      'meta name="description"',
    ],
    // <meta property="og:title" id="og-titulo" content="…">
    [
      /<meta\s+property="og:title"\s+id="og-titulo"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" id="og-titulo" content="${t}" />`,
      "og:title",
    ],
    // <meta property="og:description" id="og-descripcion" content="…">
    [
      /<meta\s+property="og:description"\s+id="og-descripcion"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" id="og-descripcion" content="${d}" />`,
      "og:description",
    ],
  ];

  let salida = html;
  for (const [busca, pone, nombre] of cambios) {
    if (!busca.test(salida)) {
      throw new Error(
        `chat.html ya no tiene ${nombre} con la forma que este script sabe reemplazar. ` +
          `Alguien editó el head: ajusta scripts/estampar-identidad.mjs o devuélvele la forma.`,
      );
    }
    salida = salida.replace(busca, pone);
  }
  return salida;
}

/** Corre de verdad solo cuando se invoca como programa, no al importarlo. */
function principal() {
  const ident = identidadPublica();
  if (!ident.nombre) {
    // Igual que el JS: sin nombre no se estampa nada y el archivo queda neutro.
    console.log("  sin NEGOCIO_NOMBRE: chat.html se queda con el título neutro.");
    return;
  }
  const textos = textosDe(ident);
  const antes = readFileSync(ARCHIVO, "utf8");
  const despues = estampar(antes, textos);
  if (antes !== despues) writeFileSync(ARCHIVO, despues);
  console.log(`  chat.html  →  "${textos.titulo}"`);
}

if (process.argv[1] && process.argv[1].endsWith("estampar-identidad.mjs")) {
  try {
    principal();
    console.log("\nIdentidad estampada.");
  } catch (e) {
    console.error("\n✗ " + e.message);
    process.exit(1);
  }
}
