/**
 * EL AVISO DE LA MAÑANA.
 *
 * Corre una vez al día y hace dos cosas.
 *
 * Lo dispara Vercel con el "cron" declarado en vercel.json: 0 12 * * *, que son
 * las 07:00 en Ecuador. Vercel solo garantiza la hora dentro de esa hora, lo
 * cual sobra para un aviso de la mañana. En el plan Hobby no se puede correr
 * más seguido que una vez al día, así que un recordatorio "una hora antes"
 * tendría que esperar al planificador de Cloudflare.
 *
 *   1. Le recuerda su cita a cada persona que tiene una hoy.
 *   2. Te manda a ti la lista del día.
 *
 * Lo segundo es el primer agente que te informa sin que se lo pidas. Los
 * demás vendrán después; este empieza por lo que más cuesta si falla, que es
 * llegar a una reunión sin saber que la tenías.
 *
 * DORMIDO SIN CRON_SECRET: sin esa variable devuelve 503 y no manda nada. La
 * misma regla que el agente privado — una puerta que dispara correos no puede
 * quedar abierta a que cualquiera la toque.
 */

import {
  agendaConfigurada,
  citasDeHoySinRecordar,
  marcarRecordada,
} from "../lib/calendario.js";
import { enviarRecordatorioCita, enviarAviso } from "../lib/leads.js";

export default async function handler(req, res) {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    console.warn("[RECORDATORIOS] sin CRON_SECRET: la tarea está dormida.");
    return res.status(503).json({ error: "No configurado" });
  }

  if (!claveCorrecta(req, esperado)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  if (!agendaConfigurada()) {
    return res.status(503).json({ error: "La agenda no está conectada" });
  }

  try {
    const citas = await citasDeHoySinRecordar();

    if (citas.length === 0) {
      console.log("[RECORDATORIOS] hoy no hay citas pendientes.");
      return res.status(200).json({ citas: 0, recordadas: 0 });
    }

    let recordadas = 0;

    for (const cita of citas) {
      if (cita.recordada || !cita.contacto) continue;
      try {
        const { entregado } = await enviarRecordatorioCita({
          para: cita.contacto,
          nombre: cita.nombre,
          cuando: cita.etiqueta,
          codigo: cita.codigo,
        });
        // Solo se marca si el correo salió: si falló, mañana no sirve de nada,
        // pero al menos queda registro de que esta persona no fue avisada.
        if (entregado) {
          await marcarRecordada(cita.id);
          recordadas++;
        }
      } catch (err) {
        console.error(`[RECORDATORIOS] falló el aviso a ${cita.contacto}:`, err?.message ?? err);
      }
    }

    await enviarAviso({
      asunto: `Hoy tienes ${citas.length} ${citas.length === 1 ? "cita" : "citas"}`,
      cuerpo: [
        ...citas.map((c) => `${c.etiqueta} — ${c.nombre || "sin nombre"} (${c.contacto || "sin correo"})`),
        "",
        `A ${recordadas} de ${citas.length} se les recordó por correo.`,
      ].join("\n"),
    }).catch((err) => console.error("[RECORDATORIOS] no se pudo avisar al equipo:", err?.message));

    console.log(`[RECORDATORIOS] ${citas.length} citas, ${recordadas} recordadas.`);
    return res.status(200).json({ citas: citas.length, recordadas });
  } catch (err) {
    console.error("[RECORDATORIOS] error:", err?.message ?? err);
    return res.status(500).json({ error: "Falló la tarea" });
  }
}

/** Comparación en tiempo constante, igual que en el agente privado. */
function claveCorrecta(req, esperado) {
  const cabecera = req.headers.authorization || "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
