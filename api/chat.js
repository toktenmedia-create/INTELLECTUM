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

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecerasCors(request) });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido" }, 405, request);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[CHAT] falta la variable de entorno ANTHROPIC_API_KEY");
    return json({ error: "El asistente no está configurado todavía." }, 503, request);
  }

  if (!origenPermitido(request)) {
    return json({ error: "Origen no permitido" }, 403, request);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  if (superaLimite(ip)) {
    return json({ error: "Demasiados mensajes. Intenta de nuevo en unos minutos." }, 429, request);
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400, request);
  }

  const historial = validarHistorial(cuerpo?.messages);
  if (!historial) {
    return json({ error: "Historial inválido" }, 400, request);
  }

  const codificador = new TextEncoder();
  const stream = new ReadableStream({
    async start(controlador) {
      const enviar = (dato) =>
        controlador.enqueue(codificador.encode(`data: ${JSON.stringify(dato)}\n\n`));

      try {
        const { lead } = await responder({
          historial,
          canal: "web",
          onTexto: (fragmento) => enviar({ t: "delta", v: fragmento }),
          meta: {
            origen: request.headers.get("referer") || "sitio web",
            sesion: typeof cuerpo?.sessionId === "string" ? cuerpo.sessionId.slice(0, 64) : null,
          },
        });

        if (lead) enviar({ t: "lead" });
        enviar({ t: "done" });
      } catch (err) {
        console.error("[CHAT] error hablando con Claude:", err?.status, err?.message ?? err);
        enviar({
          t: "error",
          v: "Se me cortó la conexión. ¿Me repites lo último? Si prefieres, escríbenos al WhatsApp +593 98 401 4129.",
        });
      } finally {
        controlador.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cabecerasCors(request),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
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

function origenPermitido(request) {
  const origen = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Si el navegador no manda ninguno de los dos, no se bloquea: hay navegadores
  // que los omiten en peticiones del mismo sitio. El límite por IP cubre ese caso.
  if (!origen && !referer) return true;

  const candidato = origen || referer;
  try {
    const url = new URL(candidato);
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

function cabecerasCors(request) {
  const origen = request.headers.get("origin");
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

function json(datos, estado, request) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cabecerasCors(request), "Content-Type": "application/json; charset=utf-8" },
  });
}
