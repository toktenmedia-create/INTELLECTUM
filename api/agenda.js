/**
 * LA PUERTA PÚBLICA DE LA AGENDA — la usa la página /agenda.
 *
 *   GET  /api/agenda   →  las horas libres de verdad, salidas del calendario
 *   POST /api/agenda   →  reserva una de ellas
 *
 * Es pública porque tiene que serlo: quien recibe un enlace por WhatsApp o por
 * correo no tiene con qué identificarse. Eso obliga a cuidarla por otro lado:
 * mismo control de origen y mismo freno por IP que el chat, y sobre todo, la
 * hora NO se acepta como fecha suelta sino como el código corto que el propio
 * calendario emite. Un código que no corresponda a una hora realmente libre no
 * resuelve a nada, así que nadie puede reservar a las tres de la mañana ni
 * inventarse un hueco que no existe.
 *
 * El acto de agendar vive en lib/agendar.js, compartido con la herramienta del
 * chat: dos puertas, un solo camino.
 */

import { agendaConfigurada, horariosLibres, inicioDesdeCodigo } from "../lib/calendario.js";
import { agendarConsultoria } from "../lib/agendar.js";
import { abrirAlmacen } from "../lib/almacen.js";
import { normalizarTelefono } from "../lib/mensajeria.js";

const ORIGENES_PERMITIDOS = (
  process.env.ALLOWED_ORIGINS ||
  "https://www.intellectum.ec,https://intellectum.ec,http://localhost:3000,http://localhost:3100"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Reservas por IP y por hora. En memoria: cada instancia tiene el suyo. */
const TOPE_POR_HORA = 5;
const VENTANA_MS = 3_600_000;
const contador = new Map();

export default async function handler(req, res) {
  const cors = cabecerasCors(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }

  if (!agendaConfigurada()) {
    return responder(res, cors, 503, { error: "La agenda no está conectada." });
  }

  if (req.method === "GET") {
    try {
      // Cuatro días con opciones de verdad, no doce días con una hora suelta.
      const horarios = await horariosLibres({ maximo: 24, diasMaximos: 4 });
      return responder(res, cors, 200, {
        horarios: horarios.map(presentar),
        zona: "America/Guayaquil",
        duracionMinutos: 30,
      });
    } catch (err) {
      console.error("[AGENDA] no se pudieron leer los horarios:", err?.message ?? err);
      return responder(res, cors, 503, { error: "No se pudo consultar la agenda." });
    }
  }

  if (req.method !== "POST") {
    return responder(res, cors, 405, { error: "Método no permitido" });
  }

  // Reservar SÍ cambia el mundo: aquí sí se exige origen conocido.
  if (!origenPermitido(req)) {
    return responder(res, cors, 403, { error: "Origen no permitido" });
  }
  if (superaLimite(primeraIp(req))) {
    return responder(res, cors, 429, {
      error: "Demasiados intentos. Escríbenos por WhatsApp y lo coordinamos.",
    });
  }

  const cuerpo = await leerJson(req);
  const codigo = String(cuerpo?.codigo ?? "").trim().slice(0, 12);
  const nombre = limpiar(cuerpo?.nombre, 80);
  const contacto = limpiar(cuerpo?.contacto, 120);
  const empresa = limpiar(cuerpo?.empresa, 80);
  const motivo = limpiar(cuerpo?.motivo, 400);

  if (!nombre) return responder(res, cors, 400, { error: "Falta tu nombre." });
  if (!contacto.includes("@") && !normalizarTelefono(contacto)) {
    return responder(res, cors, 400, { error: "Déjanos un correo o un WhatsApp para confirmarte." });
  }
  // Se comprueba ANTES de tocar el calendario: un código inventado ni siquiera
  // llega a intentar reservar.
  if (!inicioDesdeCodigo(codigo)) {
    return responder(res, cors, 409, { error: "Esa hora ya no está disponible.", recargar: true });
  }

  let resultado;
  try {
    resultado = await agendarConsultoria({
      codigo,
      nombre,
      contacto,
      telefono: contacto.includes("@") ? "" : normalizarTelefono(contacto) || "",
      empresa,
      motivo,
      almacen: abrirAlmacen(),
      canal: "web",
      meta: { origen: "agenda:web", sesion: `agenda-${codigo}` },
      origen: "la persona misma, desde la página de agenda",
    });
  } catch (err) {
    console.error("[AGENDA] no se pudo agendar:", err?.message ?? err);
    return responder(res, cors, 500, { error: "No se pudo agendar. Inténtalo otra vez." });
  }

  if (!resultado.ok) {
    // "Se ocupó mientras decidías" es distinto de "esa hora no existe", y la
    // persona merece saber cuál de las dos le pasó.
    return responder(res, cors, 409, {
      error:
        resultado.motivo === "hora_ocupada"
          ? "Esa hora se ocupó hace un momento. Elige otra, por favor."
          : "Esa hora ya no está disponible.",
      recargar: true,
    });
  }

  return responder(res, cors, 200, {
    ok: true,
    cuando: resultado.cita.etiqueta,
    codigo: resultado.cita.codigo,
    correoLlego: resultado.correoLlego,
    contacto,
  });
}

/** Lo que la página necesita, sin exponer nada de la agenda interna. */
function presentar(slot) {
  const fecha = new Date(slot.inicio);
  const dia = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long",
  }).format(fecha);
  const hora = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(fecha);
  // El ISO va además de lo ya escrito: el correo no puede formatear fechas y
  // necesita las palabras hechas, pero la página sí puede, y así escribe el día
  // en el idioma de quien mira sin que la API tenga que saber de idiomas.
  return { codigo: slot.codigo, dia, hora, etiqueta: slot.etiqueta, inicio: slot.inicio };
}

function limpiar(valor, tope) {
  return String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, tope);
}

function origenPermitido(req) {
  const origen = req.headers.origin;
  if (!origen) return true; // peticiones sin navegador de por medio
  return ORIGENES_PERMITIDOS.includes(origen);
}

function cabecerasCors(req) {
  const origen = req.headers.origin;
  const permitido = origen && ORIGENES_PERMITIDOS.includes(origen);
  return {
    "Content-Type": "application/json; charset=utf-8",
    ...(permitido ? { "Access-Control-Allow-Origin": origen } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function primeraIp(req) {
  return String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "desconocida";
}

function superaLimite(ip) {
  const ahora = Date.now();
  const previos = (contador.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= TOPE_POR_HORA) return true;
  previos.push(ahora);
  contador.set(ip, previos);
  return false;
}

async function leerJson(req) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  try {
    return JSON.parse(Buffer.concat(trozos).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

function responder(res, cors, codigo, datos) {
  res.writeHead(codigo, cors);
  res.end(JSON.stringify(datos));
}
