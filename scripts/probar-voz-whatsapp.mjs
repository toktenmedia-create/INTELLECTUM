/**
 * Banco de pruebas del WhatsApp que sigue a una llamada.
 * Nada sale a internet: fetch está interceptado.
 */
process.env.VERCEL = "1";                       // almacén en /tmp, no en datos/
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
process.env.DAPTA_WEBHOOK_TOKEN = "secreto-de-prueba";
process.env.META_TOKEN = "token-falso";
process.env.META_PHONE_NUMBER_ID = "111";
process.env.DAPTA_NUMERO_SALIDA = "593967518060";

import fs from "node:fs/promises";
import { Readable } from "node:stream";

await fs.rm("/tmp/intellectum", { recursive: true, force: true });

const enviados = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (u.includes("/messages")) {
    enviados.push(JSON.parse(opciones.body));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
  }
  return new Response("{}", { status: 200 }); // Resend y demás
};

const { default: handler } = await import("../api/voz.js");

function pedir(cuerpo) {
  const req = Readable.from([Buffer.from(JSON.stringify(cuerpo))]);
  req.method = "POST";
  req.url = "/api/voz";
  req.headers = { authorization: "Bearer secreto-de-prueba" };
  const res = { statusCode: 0, setHeader() {}, end() {} };
  return handler(req, res).then(() => res.statusCode);
}

let fallos = 0;
async function caso(nombre, cuerpo, comprobar) {
  enviados.length = 0;
  const codigo = await pedir(cuerpo);
  try {
    comprobar(enviados, codigo);
    console.log(`  ok   ${nombre}`);
  } catch (err) {
    fallos++;
    console.log(`  FALLA ${nombre}: ${err.message}`);
  }
}
const igual = (a, b, q) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${q}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const params = (e) => e.template.components[0].parameters.map((p) => p.text);

const base = (extra) => ({
  direction: "inbound", from_number: "0991112233", to_number: "0967518060",
  total_duration_seconds: 95, name: "María", company: "Ferretería Castillo",
  summary: "ferretería, quiere atender WhatsApp sola", ...extra,
});

console.log("\nQUIÉN RECIBE MENSAJE Y QUIÉN NO");
await caso("aceptó el diagnóstico → plantilla con botón", base({ outcome: "agendo_diagnostico" }), (e) => {
  igual(e.length, 1, "mensajes"); igual(e[0].template.name, "seguimiento_llamada_agenda", "plantilla");
  igual(e[0].to, "593991112233", "destino"); igual(params(e[0]), ["María"], "parámetros");
});
await caso("mismo número otra vez → NO se repite", base({ outcome: "agendo_diagnostico" }), (e) => igual(e.length, 0, "mensajes"));
await caso("pidió WhatsApp → plantilla sin botón", base({ outcome: "pidio_whatsapp", from_number: "0992223344" }), (e) => {
  igual(e.length, 1, "mensajes"); igual(e[0].template.name, "seguimiento_llamada_info", "plantilla");
  igual(params(e[0]), ["María", "automatizar la atención de Ferretería Castillo"], "parámetros");
});
await caso("no le interesa → nada", base({ outcome: "no_interesado", from_number: "0993334455" }), (e) => igual(e.length, 0, "mensajes"));
await caso("solo información → nada", base({ outcome: "solo_informacion", from_number: "0993334456" }), (e) => igual(e.length, 0, "mensajes"));
await caso("pidió llamada humana → nada", base({ outcome: "pidio_llamada_humana", from_number: "0993334457" }), (e) => igual(e.length, 0, "mensajes"));
await caso("no es prospecto → nada", base({ outcome: "no_es_prospecto", from_number: "0993334458" }), (e) => igual(e.length, 0, "mensajes"));
await caso("sin etiqueta de cierre → nada", base({ from_number: "0993334459" }), (e) => igual(e.length, 0, "mensajes"));

console.log("\nLA TRAMPA DEL PARECIDO");
await caso('"no_agendo_diagnostico" NO dispara el mensaje contrario', base({ outcome: "no_agendo_diagnostico", from_number: "0994445566" }), (e) => igual(e.length, 0, "mensajes"));
await caso('"agendo_diagnostico_pendiente" tampoco', base({ outcome: "agendo_diagnostico_pendiente", from_number: "0994445567" }), (e) => igual(e.length, 0, "mensajes"));
await caso('"Agendó diagnóstico." (tildes, mayúscula, punto) SÍ dispara', base({ outcome: "Agendó diagnóstico.", from_number: "0994445568" }), (e) => {
  igual(e.length, 1, "mensajes"); igual(e[0].template.name, "seguimiento_llamada_agenda", "plantilla");
});
await caso('"PIDIO_WHATSAPP" en mayúsculas SÍ dispara', base({ outcome: "PIDIO_WHATSAPP", from_number: "0994445569" }), (e) => igual(e.length, 1, "mensajes"));

console.log("\nA QUÉ NÚMERO");
await caso("el WhatsApp confirmado gana al identificador de llamada", base({ outcome: "agendo_diagnostico", from_number: "0995556677", whatsapp: "0987654321" }), (e) => {
  igual(e.length, 1, "mensajes"); igual(e[0].to, "593987654321", "destino");
});
await caso("sin ningún número → no se escribe", { outcome: "agendo_diagnostico", name: "Sin Número", summary: "algo" }, (e) => igual(e.length, 0, "mensajes"));
await caso("nunca se escribe a nuestro propio número", { direction: "outbound", to_number: "0967518060", from_number: "0967518060", outcome: "agendo_diagnostico", name: "Eco" }, (e) => igual(e.length, 0, "mensajes"));

console.log("\nLO QUE VA DENTRO DE LA PLANTILLA");
await caso('"Paul | Castillo" saluda como "Paul"', base({ outcome: "agendo_diagnostico", from_number: "0996667788", name: { first: "Paul", last: "Castillo" } }), (e) => igual(params(e[0]), ["Paul"], "parámetros"));
await caso("sin nombre → 'buen día'", base({ outcome: "agendo_diagnostico", from_number: "0996667789", name: null }), (e) => igual(params(e[0]), ["buen día"], "parámetros"));
await caso("sin empresa → 'tu negocio'", base({ outcome: "pidio_whatsapp", from_number: "0996667790", company: null }), (e) => igual(params(e[0])[1], "automatizar la atención de tu negocio", "asunto"));
await caso("saltos de línea en la empresa → una sola línea", base({ outcome: "pidio_whatsapp", from_number: "0996667791", company: "Ferretería\n\n   Castillo" }), (e) => {
  const a = params(e[0])[1];
  if (/[\n\t]/.test(a) || a.includes("   ")) throw new Error(`Meta rechazaría: ${JSON.stringify(a)}`);
  igual(a, "automatizar la atención de Ferretería Castillo", "asunto");
});

console.log("\nBUZÓN Y BAJA");
await caso("cayó en el buzón → no se escribe", base({ outcome: "agendo_diagnostico", from_number: "0997778899", voicemail_detected: true }), (e) => igual(e.length, 0, "mensajes"));

const { abrirAlmacen } = await import("../lib/almacen.js");
await abrirAlmacen().registrarBaja({ canal: "whatsapp", sesion: "593998889900" });
await caso("pidió SALIR antes → no se escribe nunca", base({ outcome: "agendo_diagnostico", from_number: "0998889900" }), (e) => igual(e.length, 0, "mensajes"));

console.log("\nQUE NO SE PIERDA LA LLAMADA");
await caso("si Meta rechaza, la llamada igual se guarda (200)", base({ outcome: "agendo_diagnostico", from_number: "0999990011" }), (e, codigo) => igual(codigo, 200, "código"));

console.log("\nEL INTERRUPTOR");
process.env.WHATSAPP_TRAS_LLAMADA = "no";
await caso("apagado desde Vercel → no se escribe", base({ outcome: "agendo_diagnostico", from_number: "0991010101" }), (e) => igual(e.length, 0, "mensajes"));
delete process.env.WHATSAPP_TRAS_LLAMADA;
await caso("sin la variable → sigue escribiendo (encendido por defecto)", base({ outcome: "agendo_diagnostico", from_number: "0991010102" }), (e) => igual(e.length, 1, "mensajes"));

globalThis.fetch = fetchReal;
await fs.rm("/tmp/intellectum", { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLOS\n` : "\nTodo en verde.\n");
process.exit(fallos ? 1 : 0);
