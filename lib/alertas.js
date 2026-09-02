/**
 * LA ALARMA DEL OPERADOR — que alguien se entere cuando algo se cae.
 *
 * El precedente que justifica este archivo: el WhatsApp de un cliente estuvo
 * restringido cuatro meses sin que nadie lo notara, porque cada fallo quedaba
 * en console.error y los registros de Vercel duran horas. Un error que solo
 * vive en el registro es un error que nadie va a leer.
 *
 * Por aquí pasan los avisos que NO son para el cliente ni para el dueño del
 * negocio, sino para quien OPERA el sistema (Intellectum): un envío de Meta
 * que falló, un mensaje que no se pudo atender, un respaldo que no salió, un
 * número que entró por la copia equivocada. Salen por todos los canales que
 * haya configurados, con un freno de diez minutos por motivo para que una
 * caída de verdad produzca un aviso y no doscientos.
 *
 * Canales, en este orden y todos a la vez:
 *   OPERADOR_WEBHOOK_URL  un POST con JSON (n8n, Make, Slack, un canal de Discord...)
 *   OPERADOR_EMAIL        un correo aparte del de los leads (si no está, va a LEADS_EMAIL)
 *   EQUIPO_WHATSAPP       el WhatsApp del equipo, por texto libre o plantilla
 *
 * Y SIEMPRE, aunque esté frenada, queda un evento alerta_operador en la
 * bitácora: es lo que /api/salud y el panel pueden leer después.
 *
 * Nunca lanza. Un sistema de alarmas que tumba lo que vigila no es un sistema
 * de alarmas.
 */

import { enviarAviso, enviarCorreoInterno } from "./leads.js";
import { avisarEquipoWhatsApp } from "./mensajeria.js";
import { CLIENTE, NEGOCIO } from "./cliente.js";

/** Freno por motivo: la misma alarma no se repite antes de diez minutos. */
const ESPERA_MS = 10 * 60 * 1000;
const ultimoAviso = new Map(); // clave → cuándo se avisó (por instancia)

/**
 * @param {object} aviso
 * @param {string} aviso.asunto     una línea: qué pasó
 * @param {string} aviso.cuerpo     el detalle, ya legible para una persona
 * @param {string} [aviso.clave]    agrupa avisos iguales para el freno
 * @param {object} [aviso.almacen]  para dejar el evento en la bitácora
 * @param {object} [aviso.detalle]  datos sueltos que van al evento y al webhook
 * @returns {Promise<{entregado: boolean, frenada?: boolean, vias?: string[]}>}
 */
export async function alertarAlOperador({ asunto, cuerpo, clave = asunto, almacen = null, detalle = {} }) {
  const ahora = Date.now();
  const frenada = ahora - (ultimoAviso.get(clave) ?? 0) < ESPERA_MS;
  if (!frenada) ultimoAviso.set(clave, ahora);
  if (ultimoAviso.size > 200) ultimoAviso.clear();

  console.error(`[ALERTA_${CLIENTE.toUpperCase()}] ${asunto}: ${cuerpo}`);

  if (almacen?.registrarEvento) {
    await almacen
      .registrarEvento({
        tipo: "alerta_operador",
        actor: "sistema",
        cliente: CLIENTE,
        detalle: { asunto, clave, frenada, ...detalle },
      })
      .catch(() => {});
  }
  if (frenada) return { entregado: false, frenada: true };

  const cuando = new Date().toISOString();
  const texto = `${cuerpo}\n\nCopia: ${CLIENTE} · ${NEGOCIO.dominio || "sin dominio"} · ${cuando}`;
  const intentos = [];

  const webhook = (process.env.OPERADOR_WEBHOOK_URL ?? "").trim();
  if (webhook) {
    intentos.push(
      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "alerta", copia: CLIENTE, asunto, cuerpo, detalle, en: cuando }),
        signal: AbortSignal.timeout(5_000),
      }).then((r) => {
        if (!r.ok) throw new Error(`webhook respondió ${r.status}`);
        return "webhook";
      }),
    );
  }

  const correoOperador = (process.env.OPERADOR_EMAIL ?? "").trim();
  if (correoOperador) {
    intentos.push(
      enviarCorreoInterno({ asunto: `[${CLIENTE}] ${asunto}`, texto, para: correoOperador }).then(() => "correo_operador"),
    );
  } else {
    intentos.push(
      enviarAviso({ asunto: `⚠ ${asunto}`, cuerpo: texto }).then((r) => {
        if (!r?.entregado) throw new Error("sin canal de correo");
        return "correo";
      }),
    );
  }

  intentos.push(
    avisarEquipoWhatsApp({
      texto: `⚠ ${asunto}. ${cuerpo}`.slice(0, 900),
      bitacora: almacen ? { almacen, cliente: CLIENTE } : null,
    }).then((r) => {
      if (!r?.entregado) throw new Error("WhatsApp no salió");
      return "whatsapp";
    }),
  );

  const resultados = await Promise.allSettled(intentos);
  const vias = resultados.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (vias.length === 0) {
    console.error(
      "[ALERTA] ningún canal pudo avisar al operador. Configura OPERADOR_WEBHOOK_URL, " +
        "OPERADOR_EMAIL (o LEADS_EMAIL con RESEND_API_KEY) o EQUIPO_WHATSAPP.",
    );
  }
  return { entregado: vias.length > 0, vias };
}

/**
 * EL LATIDO DE UNA TAREA PROGRAMADA.
 *
 * Un cron que no corre es indistinguible de uno que sí, salvo que deje rastro.
 * Cada tarea diaria llama a esto al empezar: queda un evento tarea_diaria en
 * la bitácora (que /api/salud lee para saber si la última corrida es reciente)
 * y, si hay HEARTBEAT_URL, un GET a un servicio de latidos (Cronitor,
 * Healthchecks, UptimeRobot) que avisa solo cuando el latido DEJA de llegar.
 */
export async function latidoDeTarea({ tarea, almacen = null, resumen = {} }) {
  if (almacen?.registrarEvento) {
    await almacen
      .registrarEvento({ tipo: "tarea_diaria", actor: "sistema", cliente: CLIENTE, detalle: { tarea, ...resumen } })
      .catch((err) => console.error("[LATIDO] no se pudo anotar:", err?.message ?? err));
  }
  const url = (process.env.HEARTBEAT_URL ?? "").trim();
  if (!url) return;
  try {
    const destino = new URL(url);
    destino.searchParams.set("tarea", tarea);
    await fetch(destino, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    console.error("[LATIDO] no llegó al servicio de latidos:", err?.message ?? err);
  }
}
