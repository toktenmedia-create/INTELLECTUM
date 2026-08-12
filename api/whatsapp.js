/**
 * Webhook de WhatsApp Business (Meta Cloud API).
 *
 * ESTADO: listo, pero DORMIDO. Mientras no existan las variables de entorno de
 * Meta, esta función responde 503 y no hace nada. El día que tengas el número y
 * el token permanente, defines las variables y WhatsApp queda hablando con el
 * MISMO cerebro que el chat de la web (lib/brain.js): misma ficha, mismas
 * reglas, misma captura de leads. No hay dos bots que mantener.
 *
 * Variables necesarias para encenderlo:
 *   META_VERIFY_TOKEN     — lo inventas tú; lo pegas igual en Meta.
 *   META_APP_SECRET       — Meta → tu app → Configuración básica.
 *   META_TOKEN            — token permanente de la cuenta de WhatsApp.
 *   META_PHONE_NUMBER_ID  — id del número emisor (lo da Meta, no es el número).
 *
 * URL del webhook a registrar en Meta:  https://www.intellectum.ec/api/whatsapp
 */

import crypto from "node:crypto";
import { responder } from "../lib/brain.js";

export const config = { maxDuration: 60 };

const MAX_MENSAJES_MEMORIA = 16;
const MEMORIA_TTL_MS = 60 * 60 * 1000; // una hora sin escribir y se olvida

/**
 * Memoria de conversación por número.
 *
 * OJO: vive en la memoria de la función, así que se pierde cuando Vercel apaga
 * la instancia (minutos de inactividad). Para una conversación seguida funciona;
 * para producción seria conviene mover esto a Upstash Redis o Vercel KV — es un
 * cambio de ~20 líneas, todo aislado en estas dos funciones.
 */
const memoria = new Map();

export default async function handler(request) {
  const url = new URL(request.url);

  // 1. Verificación del webhook: Meta llama una sola vez con un reto.
  if (request.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const reto = url.searchParams.get("hub.challenge");

    if (modo === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
      return new Response(reto, { status: 200 });
    }
    return new Response("Token incorrecto", { status: 403 });
  }

  if (request.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  if (!configurado()) {
    console.warn("[WHATSAPP] llegó un mensaje pero el canal no está configurado.");
    return new Response("Canal de WhatsApp no configurado", { status: 503 });
  }

  // 2. Comprobar que el mensaje viene de Meta y no de un tercero.
  const crudo = await request.text();
  if (!firmaValida(crudo, request.headers.get("x-hub-signature-256"))) {
    console.warn("[WHATSAPP] firma inválida, mensaje descartado.");
    return new Response("Firma inválida", { status: 401 });
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return new Response("OK", { status: 200 }); // a Meta siempre se le responde 200
  }

  const valor = datos?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = valor?.messages?.[0];

  // Confirmaciones de entrega, stickers, audios... no son conversación.
  if (!mensaje || mensaje.type !== "text") {
    return new Response("OK", { status: 200 });
  }

  const numero = mensaje.from;
  const texto = mensaje.text?.body?.trim();
  if (!numero || !texto) return new Response("OK", { status: 200 });

  const nombrePerfil = valor?.contacts?.[0]?.profile?.name;

  try {
    const historial = recordar(numero);
    historial.push({ role: "user", content: texto.slice(0, 2000) });

    const { texto: respuesta } = await responder({
      historial,
      canal: "whatsapp",
      meta: { origen: `whatsapp:${nombrePerfil || numero}`, sesion: numero },
    });

    if (respuesta) {
      historial.push({ role: "assistant", content: respuesta });
      guardar(numero, historial);
      await enviarWhatsApp(numero, respuesta);
    }
  } catch (err) {
    console.error("[WHATSAPP] error procesando el mensaje:", err?.message ?? err);
  }

  // Meta reintenta si no recibe 200, y eso duplicaría respuestas.
  return new Response("OK", { status: 200 });
}

function configurado() {
  return Boolean(
    process.env.META_VERIFY_TOKEN &&
      process.env.META_APP_SECRET &&
      process.env.META_TOKEN &&
      process.env.META_PHONE_NUMBER_ID &&
      process.env.ANTHROPIC_API_KEY,
  );
}

function firmaValida(cuerpoCrudo, cabecera) {
  if (!cabecera?.startsWith("sha256=")) return false;

  const esperado = crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(cuerpoCrudo, "utf8")
    .digest("hex");

  const recibido = cabecera.slice("sha256=".length);
  if (recibido.length !== esperado.length) return false;

  return crypto.timingSafeEqual(Buffer.from(recibido, "hex"), Buffer.from(esperado, "hex"));
}

function recordar(numero) {
  const entrada = memoria.get(numero);
  if (!entrada || Date.now() - entrada.actualizado > MEMORIA_TTL_MS) return [];
  return [...entrada.mensajes];
}

function guardar(numero, mensajes) {
  memoria.set(numero, {
    mensajes: mensajes.slice(-MAX_MENSAJES_MEMORIA),
    actualizado: Date.now(),
  });
  if (memoria.size > 1000) memoria.clear();
}

async function enviarWhatsApp(numero, texto) {
  const respuesta = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: texto.slice(0, 4000) },
      }),
    },
  );

  if (!respuesta.ok) {
    throw new Error(`Meta respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}
