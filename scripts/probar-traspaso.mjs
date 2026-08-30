/**
 * EL BANCO DE PRUEBAS DEL TRASPASO BOT → HUMANO.
 *
 * Corre contra el almacén de archivo en /tmp (VERCEL=1), sin tocar datos/ ni
 * la base real ni mandar nada por la red:
 *
 *   node scripts/probar-traspaso.mjs
 *
 * Prueba el circuito completo del volante: el modo por defecto, tomar y
 * devolver la conversación (solo si existe), la marca en el listado, el
 * anexado que no pisa escrituras concurrentes, la vigencia del traspaso,
 * la baja que lo suelta, y que escalar_a_humano entregue el volante en
 * WhatsApp pero no en la web.
 */

import { rm, appendFile } from "node:fs/promises";

process.env.VERCEL = "1"; // el almacén de archivo se va a /tmp/intellectum
delete process.env.SUPABASE_URL_INTELLECTUM; // jamás contra la base real
delete process.env.RESEND_API_KEY; // jamás correos de verdad

const CARPETA = "/tmp/intellectum";
await rm(CARPETA, { recursive: true, force: true });

const { abrirAlmacen } = await import("../lib/almacen.js");
const { HERRAMIENTAS } = await import("../lib/herramientas.js");
const { elegirParaSeguimiento } = await import("../lib/seguimiento.js");

let fallos = 0;
function prueba(nombre, condicion) {
  console.log(`  ${condicion ? "ok  " : "FALLO"} ${nombre}`);
  if (!condicion) fallos += 1;
}

const almacen = abrirAlmacen();
const NUMERO = "593999000111";

// ── 1. El modo por defecto es bot, incluso sin conversación ──────────────────
prueba(
  "sin dato, el modo es bot",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "bot",
);

// ── 2. Sin conversación no hay nada que tomar (el candado del panel) ─────────
let rechazo = null;
try {
  await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "humano" });
} catch (err) {
  rechazo = err;
}
prueba(
  "tomar una conversación inexistente se niega",
  /ya no existe/i.test(String(rechazo?.message)),
);

// ── 3. Con la conversación creada, el volante va y viene ─────────────────────
await almacen.guardarConversacion({
  canal: "whatsapp",
  sesion: NUMERO,
  mensajes: [{ role: "user", content: "hola" }],
});
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "humano" });
prueba(
  "tras tomarla, el modo es humano",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "humano",
);

// Un modo inválido se normaliza a bot, nunca se guarda basura.
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "cualquiercosa" });
prueba(
  "un modo inválido cae a bot",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "bot",
);
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "humano" });

// ── 4. El listado expone el modo ─────────────────────────────────────────────
const lista = await almacen.listarConversaciones({});
const fila = lista.find((c) => c.sesion === NUMERO);
prueba("el listado trae la conversación", Boolean(fila));
prueba("el listado dice que está en manos humanas", fila?.modo === "humano");

// Guardar un mensaje nuevo NO pisa el traspaso.
await almacen.guardarConversacion({
  canal: "whatsapp",
  sesion: NUMERO,
  mensajes: [
    { role: "user", content: "hola" },
    { role: "user", content: "sigo aquí" },
  ],
});
prueba(
  "guardar un mensaje no borra el traspaso",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "humano",
);

// ── 5. El anexado no pisa lo que otro escribió mientras tanto ────────────────
// El webhook trabajaba con una copia de 2 mensajes; el panel guardó un tercero
// en el medio. Anexar con la copia vieja debe conservar el del panel.
const copiaVieja = await almacen.recordarConversacion({ canal: "whatsapp", sesion: NUMERO });
await almacen.guardarConversacion({
  canal: "whatsapp",
  sesion: NUMERO,
  mensajes: [...copiaVieja, { role: "assistant", content: "respuesta del panel", via: "panel" }],
});
await almacen.anexarMensajes({
  canal: "whatsapp",
  sesion: NUMERO,
  base: copiaVieja,
  nuevos: [{ role: "user", content: "mensaje del webhook" }],
});
const fusionado = await almacen.recordarConversacion({ canal: "whatsapp", sesion: NUMERO });
prueba(
  "el anexado conserva el mensaje que llegó en el medio",
  fusionado.some((m) => m.content === "respuesta del panel") &&
    fusionado.some((m) => m.content === "mensaje del webhook"),
);

// ── 6. Devolver al bot ───────────────────────────────────────────────────────
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "bot" });
prueba(
  "tras devolverla, el modo es bot",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "bot",
);

// ── 7. La baja suelta el volante y el borrado cierra el candado ──────────────
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "humano" });
// La secuencia de api/whatsapp.js ante SALIR: soltar el modo y luego olvidar.
await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "bot" });
await almacen.olvidarConversacion({ canal: "whatsapp", sesion: NUMERO });
prueba(
  "tras la baja, quien vuelve lo atiende el bot",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: NUMERO })) === "bot",
);
let rechazoOlvidada = null;
try {
  await almacen.cambiarModo({ canal: "whatsapp", sesion: NUMERO, modo: "humano" });
} catch (err) {
  rechazoOlvidada = err;
}
prueba(
  "una conversación olvidada no se puede tomar desde el panel",
  /ya no existe/i.test(String(rechazoOlvidada?.message)),
);

// ── 8. El traspaso vence con el hilo ─────────────────────────────────────────
const VIEJO = "593999000333";
const hace40dias = new Date(Date.now() - 40 * 86_400_000).toISOString();
await appendFile(
  `${CARPETA}/conversaciones.jsonl`,
  JSON.stringify({
    cliente: "intellectum",
    canal: "whatsapp",
    sesion: VIEJO,
    mensajes: [{ role: "user", content: "hola de hace 40 días" }],
    actualizado_en: hace40dias,
  }) + "\n",
);
await appendFile(
  `${CARPETA}/modos.jsonl`,
  JSON.stringify({
    cliente: "intellectum",
    canal: "whatsapp",
    sesion: VIEJO,
    modo: "humano",
    cuando: hace40dias,
  }) + "\n",
);
prueba(
  "un traspaso de hace 40 días ya no calla al bot",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: VIEJO })) === "bot",
);

// ── 9. escalar_a_humano entrega el volante en WhatsApp ───────────────────────
// Sin conversación previa: es el caso de quien pide humano en su PRIMER
// mensaje, y por eso escalar usa crear:true.
const OTRO = "593999000222";
const escalar = HERRAMIENTAS.escalar_a_humano;
const respuestaWa = await escalar.ejecutar(
  {
    motivo: "pide_hablar_con_persona",
    urgencia: "normal",
    contacto: "no lo dio",
    resumen: "Quiere hablar con una persona del equipo.",
  },
  { almacen, cliente: "intellectum", canal: "whatsapp", meta: { sesion: OTRO } },
);
// El hilo se guarda justo después en el flujo real; se simula aquí para que
// la vigencia tenga fecha de referencia.
await almacen.guardarConversacion({
  canal: "whatsapp",
  sesion: OTRO,
  mensajes: [{ role: "user", content: "quiero hablar con una persona" }],
});
prueba(
  "escalar por WhatsApp deja la conversación en manos humanas",
  (await almacen.modoConversacion({ canal: "whatsapp", sesion: OTRO })) === "humano",
);
prueba(
  "la instrucción al modelo anuncia el traspaso",
  /manos de una persona|manos humanas/i.test(respuestaWa),
);
const eventos = await almacen.listarEventos({ limite: 20 });
prueba(
  "quedó el evento traspaso_humano",
  eventos.some((e) => e.tipo === "traspaso_humano" && e.detalle?.sesion === OTRO),
);

// ── 10. El seguimiento automático respeta el traspaso ────────────────────────
const { elegidos, descartes } = elegirParaSeguimiento({
  leads: [
    {
      id: "x1",
      canal: "whatsapp",
      sesion: OTRO,
      valor_estimado: 900,
      estado: "nuevo",
      nombre: "Prueba",
      resumen: "Cotizó por chat: un chatbot",
      creado_en: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    },
  ],
  conversaciones: [
    {
      canal: "whatsapp",
      sesion: OTRO,
      modo: "humano",
      actualizado_en: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    },
  ],
  ahora: new Date("2026-08-26T15:00:00Z"), // miércoles
});
prueba(
  "el seguimiento no le escribe a una conversación en manos humanas",
  elegidos.length === 0 && descartes.en_manos_humanas === 1,
);

// ── 11. En la web, escalar avisa pero NO traspasa ────────────────────────────
const respuestaWeb = await escalar.ejecutar(
  {
    motivo: "reclamo",
    urgencia: "alta",
    contacto: "reclamo@ejemplo.com",
    resumen: "Reclamo formal por la web.",
  },
  { almacen, cliente: "intellectum", canal: "web", meta: { sesion: "web-abc" } },
);
prueba(
  "escalar por la web no cambia ningún modo",
  (await almacen.modoConversacion({ canal: "web", sesion: "web-abc" })) === "bot",
);
prueba(
  "la instrucción web no anuncia traspaso",
  !/este mismo chat/i.test(respuestaWeb),
);

await rm(CARPETA, { recursive: true, force: true });

console.log("");
if (fallos) {
  console.error(`${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("Todo en verde.");
