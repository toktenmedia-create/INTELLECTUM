/**
 * PRUEBA OFFLINE — el contador de conversaciones (lo que se vende).
 *
 * Regla del 2 de septiembre de 2026: una conversación son todos los mensajes
 * de una misma persona dentro de 24 horas desde el primero que el agente
 * respondió; solo cuenta si el agente respondió. Aquí se comprueba con el
 * backend de archivo, sin red.
 *
 *   node scripts/probar-conversaciones.mjs
 */
import fs from "node:fs/promises";

process.env.VERCEL = "1";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
await fs.rm("/tmp/intellectum", { recursive: true, force: true });

const { abrirAlmacen, inicioDelMesEnEcuador } = await import("../lib/almacen.js");
const almacen = abrirAlmacen();

let fallos = 0;
function prueba(nombre, condicion) {
  console.log(`  ${condicion ? "ok  " : "FALLO"} ${nombre}`);
  if (!condicion) fallos++;
}
const total = async () => (await almacen.consumoDeConversaciones()).total;

console.log("\nEl contador de conversaciones:");

// 1. Pregunta + respuesta del agente por la web → una conversación.
await almacen.anexarMensajes({
  canal: "web", sesion: "s_web_A", base: [],
  nuevos: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola! ¿En qué te ayudo?" }],
});
prueba("una pregunta respondida es una conversación", (await total()) === 1);

// 2. La misma persona sigue escribiendo dentro de la ventana → sigue siendo una.
for (let i = 0; i < 5; i++) {
  await almacen.anexarMensajes({
    canal: "web", sesion: "s_web_A", base: [],
    nuevos: [{ role: "user", content: `pregunta ${i}` }, { role: "assistant", content: `respuesta ${i}` }],
  });
}
prueba("cinco idas y vueltas más de la misma persona siguen siendo UNA", (await total()) === 1);

// 3. Otra persona por WhatsApp → dos.
await almacen.anexarMensajes({
  canal: "whatsapp", sesion: "593999000111", nombrePerfil: "Rosa", base: [],
  nuevos: [{ role: "user", content: "precio?" }, { role: "assistant", content: "Depende del modelo…" }],
});
const c = await almacen.consumoDeConversaciones();
prueba("otra persona por WhatsApp es la segunda", c.total === 2);
prueba("se desglosa por canal", c.por_canal.web === 1 && c.por_canal.whatsapp === 1);

// 4. Un mensaje sin respuesta del agente NO cuenta (manos humanas, spam, hola suelto).
await almacen.anexarMensajes({
  canal: "whatsapp", sesion: "593999000222", base: [],
  nuevos: [{ role: "user", content: "hola" }],
});
prueba("un mensaje que el agente no respondió no consume el plan", (await total()) === 2);

// 5. Lo que escribe una persona desde el panel tampoco cuenta como respuesta del agente.
await almacen.anexarMensajes({
  canal: "whatsapp", sesion: "593999000333", base: [],
  nuevos: [{ role: "assistant", content: "Le escribo yo, Paul", via: "panel" }],
});
prueba("la respuesta de una persona desde el panel no cuenta", (await total()) === 2);

// 6. El chat web llama al contador directo (no guarda historial en el servidor).
const r1 = await almacen.contarConversacion({ canal: "web", sesion: "s_web_B" });
const r2 = await almacen.contarConversacion({ canal: "web", sesion: "s_web_B" });
prueba("el contador directo abre la ventana una sola vez", r1.contada === true && r2.contada === false && (await total()) === 3);

// 7. Pasada la ventana, la misma persona es una conversación nueva.
// La ventana se vence con `horas` NEGATIVO, que empuja el borde al futuro:
// nada de lo ya escrito cae dentro, sin importar en qué milisegundo se
// escribió. Con `horas: 0` el borde caía en el instante actual y, si el evento
// de la prueba 6 se registraba en el MISMO milisegundo, el filtro
// `creado_en >= desde` lo daba por dentro y esta prueba fallaba sola.
const r3 = await almacen.contarConversacion({ canal: "web", sesion: "s_web_B", horas: -1 });
prueba("después de la ventana, la misma persona cuenta de nuevo", r3.contada === true && (await total()) === 4);

// 8. Sin sesión no se cuenta nada (y no se rompe).
const r4 = await almacen.contarConversacion({ canal: "web", sesion: "" });
prueba("sin sesión no cuenta ni falla", r4.contada === false);

// 9. El mes de facturación es el de Ecuador.
const inicio = inicioDelMesEnEcuador(Date.UTC(2026, 8, 1, 3, 0, 0)); // 1 sep 03:00 UTC = 31 ago 22:00 en Ecuador
prueba("a las 22:00 del 31 de agosto en Ecuador, el mes sigue siendo agosto", inicio === "2026-08-01T05:00:00.000Z");
prueba("el consumo del mes empieza a las 00:00 de Ecuador", c.desde.endsWith("T05:00:00.000Z"));

console.log("");
if (fallos) {
  console.error(`${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("Todo en verde.");
