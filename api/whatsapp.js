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
import { abrirAlmacen, esPersistente } from "../lib/almacen.js";

// bodyParser desactivado: la firma de Meta se calcula sobre el cuerpo EXACTO
// tal como llegó, así que hay que leerlo crudo, sin que nadie lo reinterprete.
export const config = { maxDuration: 60, api: { bodyParser: false } };

/**
 * La memoria de cada conversación vive en la base (lib/almacen.js), no en esta
 * función. Es la diferencia entre que IntelliA recuerde a quién le habla y que
 * le pregunte el nombre tres veces: en el chat de la web el navegador manda el
 * historial completo en cada mensaje, pero en WhatsApp cada mensaje llega solo
 * y el que tiene que acordarse es el servidor. Vercel apaga y enciende
 * instancias sin avisar, así que guardar esto en memoria del proceso es
 * guardarlo en algo que se borra sin horario.
 *
 * PENDIENTE CONOCIDO: WhatsApp entrega en paralelo dos mensajes seguidos de la
 * misma persona, y ahí gana el último que escribe. Se resuelve al mudar a
 * Cloudflare con Durable Objects, que serializan por número. Mientras tanto,
 * el caso raro es perder una línea del historial, no responder mal.
 */

export default async function handler(req, res) {
  // 1. Verificación del webhook: Meta llama una sola vez con un reto.
  if (req.method === "GET") {
    const url = new URL(req.url, "https://placeholder.local");
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const reto = url.searchParams.get("hub.challenge");

    if (modo === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(reto ?? "");
      return;
    }

    res.writeHead(403).end("Token incorrecto");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end("Método no permitido");
    return;
  }

  if (!configurado()) {
    console.warn("[WHATSAPP] llegó un mensaje pero el canal no está configurado.");
    res.writeHead(503).end("Canal de WhatsApp no configurado");
    return;
  }

  // 2. Comprobar que el mensaje viene de Meta y no de un tercero.
  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers["x-hub-signature-256"])) {
    console.warn("[WHATSAPP] firma inválida, mensaje descartado.");
    res.writeHead(401).end("Firma inválida");
    return;
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch {
    res.writeHead(200).end("OK"); // a Meta siempre se le responde 200
    return;
  }

  const valor = datos?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = valor?.messages?.[0];

  // Confirmaciones de entrega, stickers, audios... no son conversación.
  if (!mensaje || mensaje.type !== "text") {
    res.writeHead(200).end("OK");
    return;
  }

  const numero = mensaje.from;
  const texto = mensaje.text?.body?.trim();
  if (!numero || !texto) {
    res.writeHead(200).end("OK");
    return;
  }

  const nombrePerfil = valor?.contacts?.[0]?.profile?.name;

  avisarSiLaMemoriaEsFragil();

  const almacen = abrirAlmacen();
  let historial = [];

  // Si la base no contesta, se responde sin memoria. Contestar sin recordar es
  // peor que recordar, pero muchísimo mejor que dejar a alguien sin respuesta.
  try {
    historial = await almacen.recordarConversacion({ canal: "whatsapp", sesion: numero });
  } catch (err) {
    console.error("[WHATSAPP] no se pudo leer la memoria:", err?.message ?? err);
  }

  try {
    historial.push({ role: "user", content: texto.slice(0, 2000) });

    const { texto: respuesta } = await responder({
      historial,
      canal: "whatsapp",
      meta: { origen: `whatsapp:${nombrePerfil || numero}`, sesion: numero },
    });

    if (respuesta) {
      // Primero se envía y después se guarda: si fallara el orden inverso,
      // quedaría escrita una respuesta que la persona nunca recibió.
      await enviarWhatsApp(numero, respuesta);
      historial.push({ role: "assistant", content: respuesta });

      try {
        await almacen.guardarConversacion({
          canal: "whatsapp",
          sesion: numero,
          nombrePerfil,
          mensajes: historial,
        });
      } catch (err) {
        console.error(
          "[WHATSAPP] la respuesta salió pero no se pudo guardar la memoria:",
          err?.message ?? err,
        );
      }
    }
  } catch (err) {
    console.error("[WHATSAPP] error procesando el mensaje:", err?.message ?? err);
  }

  // Meta reintenta si no recibe 200, y eso duplicaría respuestas.
  res.writeHead(200).end("OK");
}

let yaAvisado = false;

/**
 * Sin Supabase, la memoria cae en un archivo temporal que Vercel borra sin
 * horario. El canal sigue funcionando, pero conviene que quede escrito en el
 * registro: un bot que olvida a medias es más difícil de diagnosticar que uno
 * que no responde.
 */
function avisarSiLaMemoriaEsFragil() {
  if (yaAvisado || esPersistente()) return;
  yaAvisado = true;
  console.warn(
    "[WHATSAPP] sin SUPABASE_URL/SUPABASE_SERVICE_KEY: la memoria de las " +
      "conversaciones no sobrevive a los reinicios.",
  );
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

/** El cuerpo tal cual llegó. Si algo ya lo interpretó, se rearma como respaldo. */
async function leerCrudo(req) {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  if (trozos.length > 0) return Buffer.concat(trozos).toString("utf8");

  if (typeof req.body === "string") return req.body;
  if (req.body) return JSON.stringify(req.body);
  return "";
}

function firmaValida(cuerpoCrudo, cabecera) {
  const firma = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  if (!firma?.startsWith("sha256=")) return false;

  const esperado = crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(cuerpoCrudo, "utf8")
    .digest("hex");

  const recibido = firma.slice("sha256=".length);
  if (recibido.length !== esperado.length) return false;

  return crypto.timingSafeEqual(Buffer.from(recibido, "hex"), Buffer.from(esperado, "hex"));
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
