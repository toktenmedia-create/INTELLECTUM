/**
 * GET /api/salud  →  ¿está vivo todo lo que hace falta para atender?
 *
 * Una sola pregunta, cinco respuestas: la base contesta, el número de
 * WhatsApp está conectado y con buena calidad, la clave de Claude sirve, la
 * agenda está conectada (o dormida a propósito) y la tarea diaria corrió hace
 * poco. Devuelve 200 si todo está bien y 503 si algo no, para que un vigilante
 * externo (UptimeRobot, Cronitor, una Action de GitHub) sepa distinguir sin
 * leer el JSON.
 *
 * Con ?alertar=si, además, le avisa al operador por lib/alertas.js cuando
 * algo falla: así la Action diaria que ya llama a las tareas puede llamar a
 * esto y convertir una revisión en un aviso.
 *
 * Protegido con SALUD_TOKEN (o, si no existe, con CRON_SECRET) en la cabecera
 * Authorization: no expone datos personales, pero sí dice qué está caído, y
 * eso no es para cualquiera.
 *
 * Precedente que lo justifica: el WhatsApp de un cliente estuvo restringido
 * cuatro meses sin que nadie lo notara. Con esto, se nota el mismo día.
 */

import { abrirAlmacen, esPersistente, dondeSeGuarda } from "../lib/almacen.js";
import { agendaConfigurada } from "../lib/calendario.js";
import { GRAPH } from "../lib/multimedia.js";
import { claveCorrecta } from "../lib/acceso.js";
import { CLIENTE } from "../lib/cliente.js";
import { alertarAlOperador } from "../lib/alertas.js";

export const config = { maxDuration: 30 };

/** Cuánto puede pasar sin latido de la tarea diaria antes de considerarla caída. */
const HORAS_SIN_LATIDO = 36;

export default async function handler(req, res) {
  const esperado = (process.env.SALUD_TOKEN || process.env.CRON_SECRET || "").trim();
  if (!esperado) {
    return responder(res, 503, { ok: false, error: "Falta SALUD_TOKEN (o CRON_SECRET): la revisión está apagada." });
  }
  if (!claveCorrecta(req, esperado)) {
    return responder(res, 401, { ok: false, error: "No autorizado" });
  }

  const url = new URL(req.url ?? "/", "http://interno");
  const almacen = abrirAlmacen();

  const [base, whatsapp, cerebro, tarea_diaria] = await Promise.all([
    revisarBase(almacen),
    revisarWhatsApp(),
    revisarCerebro(),
    revisarLatido(almacen),
  ]);
  const agenda = agendaConfigurada()
    ? { ok: true, estado: "conectada" }
    : { ok: true, estado: "dormida", nota: "sin credenciales de Google: el agente no ofrece agendar" };

  const revisiones = { base, whatsapp, cerebro, agenda, tarea_diaria };
  const ok = Object.values(revisiones).every((r) => r.ok);
  const salida = { ok, copia: CLIENTE, revisado_en: new Date().toISOString(), revisiones };

  if (!ok && url.searchParams.get("alertar") === "si") {
    const fallas = Object.entries(revisiones)
      .filter(([, r]) => !r.ok)
      .map(([nombre, r]) => `${nombre}: ${r.estado}${r.nota ? ` (${r.nota})` : ""}`);
    await alertarAlOperador({
      asunto: "La revisión de salud encontró fallas",
      cuerpo: fallas.join("\n"),
      clave: "salud",
      almacen,
      detalle: { fallas: Object.keys(revisiones).filter((k) => !revisiones[k].ok) },
    }).catch(() => {});
  }

  return responder(res, ok ? 200 : 503, salida);
}

/** ¿La base contesta, y esta copia existe en ella? */
async function revisarBase(almacen) {
  if (!esPersistente()) return { ok: false, estado: "sin base real", nota: dondeSeGuarda() };
  const inicio = Date.now();
  try {
    const ficha = await almacen.fichaDeCliente({ cliente: CLIENTE });
    if (ficha?.ilegible) throw new Error("no respondió a tiempo");
    return {
      ok: true,
      estado: "responde",
      ms: Date.now() - inicio,
      cliente_registrado: Boolean(ficha),
      plan: ficha?.plan ?? null,
    };
  } catch (err) {
    return { ok: false, estado: "no responde", nota: String(err?.message ?? err).slice(0, 200) };
  }
}

/**
 * Le pregunta a Meta por el número: si sigue conectado, con qué calidad y en
 * qué escalón de límite de mensajes. Un token vencido sale aquí como 401; un
 * número restringido, como status distinto de CONNECTED o calidad RED.
 */
async function revisarWhatsApp() {
  const id = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_TOKEN;
  if (!id || !token) return { ok: true, estado: "dormido", nota: "sin META_TOKEN/META_PHONE_NUMBER_ID" };
  try {
    const campos = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status";
    const r = await fetch(`${GRAPH}/${id}?fields=${campos}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      const cuerpo = (await r.text()).slice(0, 200);
      return {
        ok: false,
        estado: r.status === 401 || r.status === 403 ? "token rechazado" : `Meta respondió ${r.status}`,
        nota: cuerpo,
      };
    }
    const d = await r.json();
    const calidad = String(d.quality_rating ?? "").toUpperCase();
    const estado = String(d.status ?? "").toUpperCase();
    const conectado = !estado || estado === "CONNECTED";
    const sano = conectado && calidad !== "RED";
    return {
      ok: sano,
      estado: sano ? "conectado" : conectado ? "calidad baja" : estado.toLowerCase(),
      numero: d.display_phone_number ?? null,
      nombre: d.verified_name ?? null,
      calidad: calidad || null,
      limite: d.messaging_limit_tier ?? null,
      nota: calidad === "YELLOW" ? "calidad en amarillo: revisar antes de que baje" : undefined,
    };
  } catch (err) {
    return { ok: false, estado: "sin respuesta de Meta", nota: String(err?.message ?? err).slice(0, 200) };
  }
}

/** ¿La clave de Claude sirve? Se pregunta por la lista de modelos: no cuesta tokens. */
async function revisarCerebro() {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) return { ok: false, estado: "sin ANTHROPIC_API_KEY" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(8_000),
    });
    if (r.status === 401) return { ok: false, estado: "clave rechazada" };
    if (!r.ok) return { ok: false, estado: `Anthropic respondió ${r.status}` };
    return { ok: true, estado: "responde", modelo: process.env.ANTHROPIC_MODEL || "claude-sonnet-5" };
  } catch (err) {
    return { ok: false, estado: "sin respuesta de Anthropic", nota: String(err?.message ?? err).slice(0, 200) };
  }
}

/** ¿La tarea diaria dejó latido hace menos de HORAS_SIN_LATIDO? */
async function revisarLatido(almacen) {
  try {
    const eventos = await almacen.listarEventos({ limite: 200 });
    const ultimo = (eventos ?? []).find((e) => e?.tipo === "tarea_diaria");
    if (!ultimo) {
      return {
        ok: false,
        estado: "sin latido registrado",
        nota: "ninguna tarea diaria dejó rastro en los últimos 200 eventos: o no corre, o se publicó hace menos de un día",
      };
    }
    const cuando = new Date(ultimo.creado_en ?? ultimo.en ?? 0).getTime();
    const horas = (Date.now() - cuando) / 3_600_000;
    const reciente = Number.isFinite(horas) && horas <= HORAS_SIN_LATIDO;
    return {
      ok: reciente,
      estado: reciente ? "corrió hace poco" : "lleva demasiado sin correr",
      ultimo: ultimo.creado_en ?? null,
      horas: Number.isFinite(horas) ? Math.round(horas) : null,
      tarea: ultimo.detalle?.tarea ?? null,
    };
  } catch (err) {
    return { ok: false, estado: "no se pudo leer la bitácora", nota: String(err?.message ?? err).slice(0, 200) };
  }
}

function responder(res, codigo, datos) {
  res.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(datos));
}
