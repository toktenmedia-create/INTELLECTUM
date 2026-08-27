/* ¿Se anota cuando el correo no sale? Y ¿no se anota cuando sí sale? */
process.env.VERCEL = "1";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
process.env.DAPTA_WEBHOOK_TOKEN = "t";
process.env.META_TOKEN = "x"; process.env.META_PHONE_NUMBER_ID = "1";
process.env.RESEND_API_KEY = "re_falsa"; process.env.LEADS_EMAIL = "paul@ejemplo.com";

import fs from "node:fs/promises";
import { Readable } from "node:stream";
await fs.rm("/tmp/intellectum", { recursive: true, force: true });

let resendResponde = 200;
globalThis.fetch = async (url) => {
  if (String(url).includes("resend.com")) {
    return new Response(resendResponde === 200 ? "{}" : "rate limited", { status: resendResponde });
  }
  return new Response(JSON.stringify({ messages: [{ id: "x" }] }), { status: 200 });
};

const { default: handler } = await import("../api/voz.js");
const { abrirAlmacen } = await import("../lib/almacen.js");

async function llamar(desde) {
  const req = Readable.from([Buffer.from(JSON.stringify({
    direction: "inbound", from_number: desde, total_duration_seconds: 60,
    name: "Ana", company: "Óptica", summary: "quiere automatizar", outcome: "solo_informacion",
  }))]);
  req.method = "POST"; req.url = "/api/voz"; req.headers = { authorization: "Bearer t" };
  await handler(req, { statusCode: 0, setHeader() {}, end() {} });
}

async function fallidos() {
  const ev = await abrirAlmacen().eventosRecientes?.({ limite: 200 }).catch(() => null);
  if (ev) return ev.filter((e) => e.tipo === "aviso_fallido").length;
  const txt = await fs.readFile("/tmp/intellectum/eventos.jsonl", "utf8").catch(() => "");
  return txt.split("\n").filter((l) => l.includes("aviso_fallido")).length;
}

let fallos = 0;
const ok = (b, q) => { if (b) console.log("  ok   " + q); else { fallos++; console.log("  FALLA " + q); } };

console.log("\nEL CORREO QUE NO SALE");
resendResponde = 429;                 // Resend rechaza
await llamar("0991111111");
ok((await fallidos()) === 1, "Resend falla → queda anotado en la bitácora");

resendResponde = 200;                 // Resend acepta
await llamar("0992222222");
ok((await fallidos()) === 1, "Resend acepta → NO se anota nada (sigue en 1)");

resendResponde = 500;
await llamar("0993333333");
ok((await fallidos()) === 2, "otro fallo → se vuelve a anotar");

await fs.rm("/tmp/intellectum", { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLOS\n` : "\nTodo en verde.\n");
process.exit(fallos ? 1 : 0);
