/**
 * POST /api/chat  →  respuesta en streaming (SSE) para el widget del sitio.
 *
 * El navegador manda el historial completo de la conversación y recibe el texto
 * palabra por palabra, para que el visitante vea que el asistente "escribe".
 *
 * La API key de Anthropic vive SOLO aquí, en el servidor. Nunca llega al
 * navegador: por eso el chat necesita esta función y no se puede hacer todo
 * dentro del index.html.
 */

import { responder } from "../lib/brain.js";

export const config = { maxDuration: 60 };

// Límites: un chat de atención no necesita más que esto, y evitan que alguien
// use el endpoint como si fuera una API gratis.
const MAX_MENSAJES = 40;
const MAX_CARACTERES = 2000;
const LIMITE_POR_IP = 30; // peticiones
const VENTANA_MS = 10 * 60 * 1000; // por cada 10 minutos

const ORIGENES_PERMITIDOS = (
  process.env.ALLOWED_ORIGINS ||
  "https://www.intellectum.ec,https://intellectum.ec,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Contador en memoria. Es "mejor que nada": cada instancia tiene el suyo. */
const contador = new Map();

export default async function handler(req, res) {
  const cors = cabecerasCors(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    responderJson(res, cors, 405, { error: "Método no permitido" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[CHAT] falta la variable de entorno ANTHROPIC_API_KEY");
    responderJson(res, cors, 503, { error: "El asistente no está configurado todavía." });
    return;
  }

  if (!origenPermitido(req)) {
    responderJson(res, cors, 403, { error: "Origen no permitido" });
    return;
  }

  const ip = primeraIp(req);
  if (superaLimite(ip)) {
    responderJson(res, cors, 429, {
      error: "Demasiados mensajes. Intenta de nuevo en unos minutos.",
    });
    return;
  }

  const cuerpo = await leerJson(req);
  const historial = validarHistorial(cuerpo?.messages);
  if (!historial) {
    responderJson(res, cors, 400, { error: "Historial inválido" });
    return;
  }

  res.writeHead(200, {
    ...cors,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  const enviar = (dato) => res.write(`data: ${JSON.stringify(dato)}\n\n`);

  try {
    const { lead } = await responder({
      historial,
      canal: "web",
      onTexto: (fragmento) => enviar({ t: "delta", v: fragmento }),
      meta: {
        origen: req.headers.referer || "sitio web",
        sesion: typeof cuerpo?.sessionId === "string" ? cuerpo.sessionId.slice(0, 64) : null,
      },
    });

    if (lead) enviar({ t: "lead" });
    enviar({ t: "done" });
  } catch (err) {
    console.error("[CHAT] error hablando con Claude:", err?.status, err?.message ?? err);
    enviar({
      t: "error",
      v: "Se me cortó la conexión. ¿Me repites lo último? Si prefieres, escríbenos al WhatsApp +593 96 751 8060.",
    });
  } finally {
    res.end();
  }
}

/**
 * Vercel entrega el cuerpo ya interpretado en req.body cuando viene como JSON.
 * Si no lo hizo (o llega como texto), se lee del flujo.
 */
async function leerJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    }
    return req.body;
  }

  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  if (trozos.length === 0) return null;

  try {
    return JSON.parse(Buffer.concat(trozos).toString("utf8"));
  } catch {
    return null;
  }
}

function validarHistorial(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return null;
  if (mensajes.length > MAX_MENSAJES) mensajes = mensajes.slice(-MAX_MENSAJES);

  const limpio = [];
  for (const m of mensajes) {
    if (m?.role !== "user" && m?.role !== "assistant") return null;
    if (typeof m.content !== "string") return null;
    const texto = m.content.trim();
    if (!texto) continue;
    limpio.push({ role: m.role, content: texto.slice(0, MAX_CARACTERES) });
  }

  if (limpio.length === 0) return null;
  if (limpio[0].role !== "user") return null; // la conversación siempre empieza en el usuario
  return limpio;
}

function primeraIp(req) {
  const cabecera = req.headers["x-forwarded-for"];
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  return valor?.split(",")[0]?.trim() || req.socket?.remoteAddress || "desconocida";
}

function origenPermitido(req) {
  const origen = req.headers.origin;
  const referer = req.headers.referer;

  // Si el navegador no manda ninguno de los dos, no se bloquea: hay navegadores
  // que los omiten en peticiones del mismo sitio. El límite por IP cubre ese caso.
  if (!origen && !referer) return true;

  try {
    const url = new URL(origen || referer);
    if (ORIGENES_PERMITIDOS.includes(url.origin)) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true; // pruebas locales
    return url.origin.endsWith(".vercel.app"); // previsualizaciones de Vercel
  } catch {
    return false;
  }
}

function superaLimite(ip) {
  const ahora = Date.now();
  const registro = contador.get(ip);

  if (!registro || ahora - registro.desde > VENTANA_MS) {
    contador.set(ip, { desde: ahora, veces: 1 });
    if (contador.size > 5000) contador.clear(); // no dejar crecer la memoria
    return false;
  }

  registro.veces += 1;
  return registro.veces > LIMITE_POR_IP;
}

function cabecerasCors(req) {
  const origen = req.headers.origin;
  const permitido =
    origen &&
    (ORIGENES_PERMITIDOS.includes(origen) ||
      origen.endsWith(".vercel.app") ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen));

  return {
    "Access-Control-Allow-Origin": permitido ? origen : ORIGENES_PERMITIDOS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function responderJson(res, cors, estado, datos) {
  res.writeHead(estado, { ...cors, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}
