/* La demo de la portada: ¿el HTML y las fichas del servidor dicen lo mismo, y
   el agente de un negocio inventado no se le escapa a hablar de Intellectum? */
import fs from "node:fs/promises";

const { DEMOS, demoPorSlug } = await import("../lib/demos.js");
const { construirSystem } = await import("../lib/prompt.js");
const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
const htmlEn = await fs.readFile(new URL("../en.html", import.meta.url), "utf8");

let fallos = 0;
const ok = (cond, texto) => {
  console.log(`${cond ? "  ok  " : "FALLA "} ${texto}`);
  if (!cond) fallos++;
};

// Lo que cada portada dice de cada negocio, sacado de sus data-*.
function saludosDe(pagina) {
  const mapa = new Map();
  for (const m of pagina.matchAll(/<button[^>]*class="demo-neg"[\s\S]*?data-demo="([^"]+)"[\s\S]*?data-arranque="([^"]*)"/g)) {
    mapa.set(m[1], desescapar(m[2]));
  }
  return mapa;
}
const enPortada = saludosDe(html);
const enPortadaEn = saludosDe(htmlEn);

function desescapar(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

ok(enPortada.size === DEMOS.length, `la portada muestra los ${DEMOS.length} negocios (encontrados: ${enPortada.size})`);
ok(enPortadaEn.size === DEMOS.length, `en.html muestra los ${DEMOS.length} negocios (encontrados: ${enPortadaEn.size})`);

for (const d of DEMOS) {
  const enHtml = enPortada.get(d.slug);
  ok(enHtml !== undefined, `"${d.slug}" está en la portada`);
  // El saludo se escribe dos veces —en la ficha del servidor y en el HTML, para
  // que la página se vea entera sin JavaScript— y esta es la costura que impide
  // que se separen.
  ok(enHtml === d.arranque, `el saludo de "${d.slug}" es el mismo aquí y en lib/demos.js`);
  ok(d.ficha.includes(d.arranque), `la ficha de "${d.slug}" lleva su saludo`);
  // La página en inglés dice lo mismo en inglés: si alguien cambia uno de los
  // dos saludos y se olvida del otro, aquí se cae.
  ok(enPortadaEn.get(d.slug) === d.arranqueEn, `el saludo en inglés de "${d.slug}" es el mismo en en.html y en lib/demos.js`);
  ok(d.ficha.startsWith("── 0. DEMOSTRACIÓN"), `la ficha de "${d.slug}" abre avisando que es una demostración`);
}

// El saludo visible al cargar (sin JavaScript) es el del primer negocio.
const primeraBurbuja = html.match(/<div class="demo-burbuja ia">([^<]*)<\/div>/);
ok(
  primeraBurbuja && desescapar(primeraBurbuja[1].trim()) === DEMOS[0].arranque,
  "la burbuja escrita en el HTML es el saludo del primer negocio",
);
const primeraBurbujaEn = htmlEn.match(/<div class="demo-burbuja ia">([^<]*)<\/div>/);
ok(
  primeraBurbujaEn && desescapar(primeraBurbujaEn[1].trim()) === DEMOS[0].arranqueEn,
  "la burbuja escrita en en.html es el saludo en inglés del primer negocio",
);
// Y el viejo chat de mentira del hero no puede seguir en ninguna de las dos.
ok(!html.includes("demo-chat") && !htmlEn.includes("demo-chat"), "el chat de ejemplo del hero ya no existe");

// Un slug inventado no puede degradar a la conversación de casa.
ok(demoPorSlug("loquesea") === null, "un negocio que no existe devuelve null");
ok(demoPorSlug("") === null, "un slug vacío devuelve null");
ok(demoPorSlug("DENTAL")?.slug === "dental", "el slug no distingue mayúsculas");

// Lo más importante: el agente de la clínica no puede hablar como Intellectum.
const PROHIBIDO = ["Intellectum", "IntelliA", "consultoría gratuita", "593 96 751", "593 98 312", "info@intellectum"];
for (const d of DEMOS) {
  const system = construirSystem({ canal: "web", ficha: d.ficha, negocio: d.negocio, casa: false, cotiza: false });
  const reglas = system[0].text.split("</configuracion_cliente>")[1] ?? "";
  const fugas = PROHIBIDO.filter((x) => reglas.includes(x));
  ok(fugas.length === 0, `las reglas de "${d.slug}" no nombran a Intellectum${fugas.length ? ` (se coló: ${fugas.join(", ")})` : ""}`);
  ok(
    system[0].text.includes(`Eres ${d.negocio.agente}, el asistente virtual de ${d.nombre}`),
    `"${d.slug}" se presenta como ${d.negocio.agente} de ${d.nombre}`,
  );
}

// Y la copia de casa tiene que seguir siendo la de casa.
const casa = construirSystem({ canal: "web" });
ok(casa[0].text.includes("Eres IntelliA, el asistente virtual de Intellectum AI Solutions"), "sin demo, el agente sigue siendo IntelliA");
ok(casa[0].text.includes("FICHA DE CONFIGURACIÓN — Intellectum AI Solutions"), "sin demo, se lee la ficha de casa");

console.log(fallos ? `\n${fallos} FALLOS\n` : "\nTodo en verde.\n");
process.exit(fallos ? 1 : 0);
