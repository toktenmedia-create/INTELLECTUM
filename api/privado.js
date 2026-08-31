/**
 * POST /api/privado  →  el agente privado, solo para el dueño.
 *
 * Este endpoint NO es público. Exige una clave secreta en la cabecera:
 *
 *   Authorization: Bearer <AGENTE_PRIVADO_TOKEN>
 *
 * Mientras esa variable no exista, la función responde 503 y no hace nada. Es
 * el mismo criterio que api/whatsapp.js: lo que no está configurado, duerme.
 *
 * Esto es autenticación de la más simple: una clave compartida. Alcanza mientras
 * el único usuario seas tú. Cuando el panel tenga varios usuarios (fase 2), se
 * reemplaza por el inicio de sesión de Supabase y esta clave desaparece.
 */

import { responder } from "../lib/brain.js";
import { esPersistente, dondeSeGuarda } from "../lib/almacen.js";
import { claveCorrecta } from "../lib/acceso.js";
import { CLIENTE } from "../lib/cliente.js";

export const config = { maxDuration: 60 };

const MAX_MENSAJES = 60;
const MAX_CARACTERES = 4000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    responderJson(res, 405, { error: "Método no permitido" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[PRIVADO] falta ANTHROPIC_API_KEY");
    responderJson(res, 503, { error: "El agente no está configurado todavía." });
    return;
  }

  const esperado = process.env.AGENTE_PRIVADO_TOKEN;
  if (!esperado) {
    responderJson(res, 503, {
      error:
        "El agente privado está apagado. Define AGENTE_PRIVADO_TOKEN para encenderlo.",
    });
    return;
  }

  if (!claveCorrecta(req, esperado)) {
    // Sin pistas sobre qué falló: es un endpoint privado.
    responderJson(res, 401, { error: "No autorizado" });
    return;
  }

  const cuerpo = await leerJson(req);
  const historial = validarHistorial(cuerpo?.messages);
  if (!historial) {
    responderJson(res, 400, { error: "Historial inválido" });
    return;
  }

  const canal = cuerpo?.canal === "whatsapp" ? "whatsapp" : "panel";

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  const enviar = (dato) => res.write(`data: ${JSON.stringify(dato)}\n\n`);

  // Se avisa desde el primer momento si los datos todavía no son confiables,
  // para que el panel lo pueda mostrar sin depender de que el modelo lo diga.
  if (!esPersistente()) {
    enviar({ t: "aviso", v: `Sin base de datos real todavía: ${dondeSeGuarda()}.` });
  }

  try {
    const { acciones } = await responder({
      historial,
      canal,
      ambito: "privado",
      cliente: typeof cuerpo?.cliente === "string" ? cuerpo.cliente.slice(0, 64) : CLIENTE,
      duenoNombre: typeof cuerpo?.dueno === "string" ? cuerpo.dueno.slice(0, 80) : "Paul",
      onTexto: (fragmento) => enviar({ t: "delta", v: fragmento }),
      meta: { origen: "panel" },
    });

    // El panel usa esto para mostrar qué hizo el agente en esta respuesta.
    if (acciones.length > 0) enviar({ t: "acciones", v: acciones });
    enviar({ t: "done" });
  } catch (err) {
    console.error("[PRIVADO] error:", err?.status, err?.message ?? err);
    enviar({ t: "error", v: "Se cortó la conexión con el modelo. Vuelve a intentarlo." });
  } finally {
    res.end();
  }
}

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
  if (limpio[0].role !== "user") return null;
  return limpio;
}

function responderJson(res, estado, datos) {
  res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}
