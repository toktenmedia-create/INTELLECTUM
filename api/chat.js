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

import { waitUntil } from "@vercel/functions";
import { responder } from "../lib/brain.js";
import { abrirAlmacen, esPersistente } from "../lib/almacen.js";
import { enviarAviso } from "../lib/leads.js";
import { calificarConversacion } from "../lib/calificar.js";
import { CLIENTE, NEGOCIO } from "../lib/cliente.js";

export const config = { maxDuration: 60 };

// Límites: un chat de atención no necesita más que esto, y evitan que alguien
// use el endpoint como si fuera una API gratis.
const MAX_MENSAJES = 40;
const MAX_CARACTERES = 2000;
const LIMITE_POR_IP = 30; // peticiones
const VENTANA_MS = 10 * 60 * 1000; // por cada 10 minutos

// El freno DURABLE, contado en la base y no en la memoria de una instancia:
// Vercel levanta instancias a demanda y cada una nace con el contador en
// cero, así que el Map de abajo solo frena al atacante perezoso. Estos dos
// topes son la defensa del bolsillo — cada mensaje cuesta dinero en Anthropic.
// Ajustables por variable de entorno, sin tocar código (regla del modelo madre).
const LIMITE_IP_HORA = Math.max(1, Number(process.env.CHAT_LIMITE_IP_HORA) || 60);
const TOPE_DIARIO = Math.max(1, Number(process.env.CHAT_TOPE_DIARIO) || 400);

// Función y no constante: si la copia no declaró WhatsApp ni correo, no hay
// "ahí mismo" al que mandar a nadie, y la frase tiene que decir otra cosa.
function mensajeTopeDiario() {
  const vias = [];
  if (NEGOCIO.whatsappBot) vias.push(`al WhatsApp ${NEGOCIO.whatsappBot}`);
  if (NEGOCIO.correo) vias.push(`a ${NEGOCIO.correo}`);
  const base = "El asistente alcanzó su tope de conversaciones por hoy.";
  return vias.length
    ? `${base} Escríbenos ${vias.join(" o ")} y te atendemos ahí mismo.`
    : `${base} Vuelve a escribir mañana y con gusto te atendemos.`;
}

// De dónde se acepta el chat. Cada copia pone su propio ALLOWED_ORIGINS; el
// respaldo son los dominios de Intellectum, que es de quien es la copia que
// hoy está publicada. Una copia de otro negocio que olvide la variable no
// atiende a nadie —falla hacia el lado seguro—, pero lo dice en el registro
// para que el silencio no parezca un misterio.
const ORIGENES_PERMITIDOS = (
  process.env.ALLOWED_ORIGINS ||
  "https://www.intellectum.ec,https://intellectum.ec,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (!process.env.ALLOWED_ORIGINS && CLIENTE !== "intellectum") {
  console.warn(
    `[CHAT] esta copia atiende a "${CLIENTE}" pero no tiene ALLOWED_ORIGINS: ` +
      "solo aceptará el chat desde los dominios de Intellectum.",
  );
}

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

  // El freno durable, ya con la petición validada (los tanteos malformados no
  // gastan cupo). Si la base no contesta, se deja pasar: el Map por instancia
  // sigue cubriendo, y castigar a un cliente real por un tropiezo nuestro
  // sería pagar el ahorro con ventas.
  const almacen = abrirAlmacen();
  const sesionId = typeof cuerpo?.sessionId === "string" ? cuerpo.sessionId.slice(0, 64) : null;
  try {
    const freno = await frenoDurable(almacen, ip);
    if (freno === "ip") {
      responderJson(res, cors, 429, {
        error: "Demasiados mensajes. Intenta de nuevo en unos minutos.",
      });
      return;
    }
    if (freno === "dia") {
      topeVisto = Date.now(); // las próximas peticiones ya no pagan las consultas
      responderJson(res, cors, 429, { error: mensajeTopeDiario() });
      return;
    }
    // Se espera de verdad: si el evento no se puede escribir, el contador
    // durable queda vacío y hay que ENTERARSE, no degradar en silencio.
    await almacen.registrarEvento({
      tipo: "chat_web",
      actor: "visitante",
      detalle: { ip, sesion: sesionId },
    });
  } catch (err) {
    console.error("[CHAT] el freno durable no pudo contar (sigue el de instancia):", err?.message ?? err);
  }

  res.writeHead(200, {
    ...cors,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });

  const enviar = (dato) => res.write(`data: ${JSON.stringify(dato)}\n\n`);

  try {
    let textoCompleto = "";
    const { lead, leadTocado } = await responder({
      historial,
      canal: "web",
      onTexto: (fragmento) => {
        textoCompleto += fragmento;
        enviar({ t: "delta", v: fragmento });
      },
      meta: {
        origen: req.headers.referer || "sitio web",
        sesion: sesionId,
      },
    });

    if (lead) enviar({ t: "lead" });
    enviar({ t: "done" });

    // LO QUE SE VENDE. El chat web no guarda historial en el servidor, así
    // que el contador de conversaciones se llama aquí, cuando el agente ya
    // respondió: misma sesión dentro de 24 h = misma conversación.
    if (textoCompleto && sesionId) {
      enSegundoPlano(
        almacen
          .contarConversacion({ canal: "web", sesion: sesionId })
          .catch((err) => console.error("[CONTADOR] chat web sin contar:", err?.message ?? err)),
      );
    }

    // La ficha que se escribe sola: si esta vuelta ESCRIBIÓ ficha de verdad
    // (la señal viene de las herramientas, no del nombre de la herramienta:
    // un rebote no cuenta), un modelo barato la califica en segundo plano.
    if (leadTocado) {
      enSegundoPlano(
        calificarConversacion({
          almacen,
          canal: "web",
          sesion: sesionId,
          historial: [...historial, { role: "assistant", content: textoCompleto }],
        }),
      );
    }
  } catch (err) {
    console.error("[CHAT] error hablando con Claude:", err?.status, err?.message ?? err);
    enviar({
      t: "error",
      v:
        "Se me cortó la conexión. ¿Me repites lo último?" +
        (NEGOCIO.whatsappBot ? ` Si prefieres, escríbenos al WhatsApp ${NEGOCIO.whatsappBot}.` : ""),
    });
  } finally {
    res.end();
  }
}

/** En Vercel, waitUntil deja terminar la tarea aunque la respuesta ya salió. */
function enSegundoPlano(promesa) {
  try {
    waitUntil(promesa);
  } catch {
    promesa.catch((err) => console.error("[CHAT] tarea de fondo:", err?.message ?? err));
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
    return esDespliegueDeEstaCopia(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Los dominios que Vercel le da a ESTA copia: el de producción, el de la rama
 * y el de cada previsualización. Antes valía cualquier *.vercel.app, o sea
 * cualquier proyecto de cualquier persona en Vercel: bastaba publicar una
 * página ahí para gastar los mensajes de Claude de esta copia.
 */
function esDespliegueDeEstaCopia(host) {
  const propios = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
  return propios.includes(String(host ?? "").toLowerCase());
}

/**
 * Dos preguntas a la base: ¿esta IP se pasó en la última hora? ¿el sitio
 * entero se pasó en el día? La segunda es el techo de gasto: aunque roten mil
 * IPs, el día tiene un máximo de mensajes que estamos dispuestos a pagar.
 * Cuando el techo se alcanza, el equipo se entera UNA vez (con candado en la
 * bitácora, no en la memoria de la instancia).
 */
let topeVisto = 0; // cuándo esta instancia vio el tope por última vez
const REPOSO_TRAS_TOPE_MS = 5 * 60 * 1000;
let avisadaDegradacion = false;

async function frenoDurable(almacen, ip) {
  // Con el tope ya visto, no se paga una consulta por cada golpe del abuso:
  // esta instancia responde 429 de memoria durante unos minutos y recién
  // después vuelve a preguntar (por si el día rotó o subieron el tope).
  if (topeVisto && Date.now() - topeVisto < REPOSO_TRAS_TOPE_MS) return "dia";
  topeVisto = 0;

  if (!esPersistente() && !avisadaDegradacion) {
    avisadaDegradacion = true;
    console.warn(
      "[CHAT] sin Supabase el freno durable cuenta en /tmp por instancia: " +
        "el único freno real es el de memoria.",
    );
  }

  const [porIp, delDia] = await Promise.all([
    almacen.contarEventos({
      tipo: "chat_web",
      desde: new Date(Date.now() - 3_600_000).toISOString(),
      ip,
      tope: LIMITE_IP_HORA + 1,
    }),
    almacen.contarEventos({
      tipo: "chat_web",
      desde: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      tope: TOPE_DIARIO + 1,
    }),
  ]);

  if (delDia >= TOPE_DIARIO) {
    topeVisto = Date.now();
    enSegundoPlano(
      avisarDelTope(almacen, delDia).catch((err) =>
        console.error("[CHAT] aviso del tope:", err?.message ?? err),
      ),
    );
    return "dia";
  }
  return porIp >= LIMITE_IP_HORA ? "ip" : null;
}

async function avisarDelTope(almacen, cuantos) {
  const marcador = `tope-chat-${new Date().toISOString().slice(0, 10)}`;
  if (await almacen.yaProcesado({ marcador })) return;

  // Primero el correo y DESPUÉS el candado: al revés, un fallo de Resend
  // dejaba el candado puesto y el aviso perdido para todo el día. Si dos
  // instancias corren a la vez puede salir el aviso doble — dos correos
  // molestan menos que un chat apagado del que nadie se enteró.
  const { entregado } = await enviarAviso({
    asunto: "El chat web llegó a su tope diario",
    cuerpo:
      `El chat del sitio alcanzó ${cuantos} mensajes en 24 horas y dejó de responder ` +
      `hasta que baje la marea (los visitantes reciben el WhatsApp y el correo como salida).\n\n` +
      `Si es tráfico real, sube CHAT_TOPE_DIARIO en Vercel. Si no lo es, era un abuso y el ` +
      `freno hizo su trabajo.`,
  });
  if (!entregado) throw new Error("el aviso del tope no salió; se reintentará en el próximo golpe");

  await almacen.registrarEvento({
    tipo: "mensaje_procesado",
    actor: "sistema",
    detalle: { marcador, motivo: "tope_diario_chat" },
  });
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
  let permitido = false;
  if (origen) {
    try {
      const host = new URL(origen).hostname;
      permitido =
        ORIGENES_PERMITIDOS.includes(origen) ||
        esDespliegueDeEstaCopia(host) ||
        host === "localhost" ||
        host === "127.0.0.1";
    } catch {
      permitido = false;
    }
  }

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
