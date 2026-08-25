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
import { enviarRecordatorioCita, enviarAviso, enviarRespaldo } from "../lib/leads.js";
import { enviarRecordatorioWhatsApp, whatsappSalidaConfigurada } from "../lib/mensajeria.js";
import { abrirAlmacen } from "../lib/almacen.js";

export default async function handler(req, res) {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    console.warn("[RECORDATORIOS] sin CRON_SECRET: la tarea está dormida.");
    return res.status(503).json({ error: "No configurado" });
  }

  if (!claveCorrecta(req, esperado)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const almacen = abrirAlmacen();

  // 0. El reloj de retención: borra de la base lo que ya venció su plazo.
  // Corre aunque la agenda no esté conectada — cumplir el aviso de privacidad
  // no puede depender de que Google Calendar esté de buenas. Y si falla, se
  // anota y se sigue: mañana vuelve a intentar, que para eso es diario.
  try {
    const barrido = await almacen.limpiarVencidos();
    const borrados = (barrido ?? []).filter((f) => f.borrados > 0);
    if (borrados.length > 0) console.log("[RETENCION]", JSON.stringify(borrados));
  } catch (err) {
    console.error("[RETENCION] no se pudo limpiar:", err?.message ?? err);
  }

  // 0.5. El respaldo semanal: cada domingo, una foto completa de la base
  // llega por correo con el JSON adjunto. Ecuador es UTC-5 todo el año, así
  // que restar cinco horas da el día correcto sin librerías de zona horaria.
  // Con ?respaldo=ahora (y la misma clave del cron) sale uno al instante,
  // para probar el circuito o para tener copia fresca antes de un cambio.
  const hoyEnEcuador = new Date(Date.now() - 5 * 3_600_000);
  const respaldoForzado =
    new URL(req.url ?? "/", "http://interno").searchParams.get("respaldo") === "ahora";
  if (hoyEnEcuador.getUTCDay() === 0 || respaldoForzado) {
    try {
      const foto = await almacen.respaldo();
      const { entregado } = await enviarRespaldo({
        fecha: hoyEnEcuador.toISOString().slice(0, 10),
        contenido: foto,
      });
      console.log(`[RESPALDO] ${entregado ? "enviado" : "NO se pudo enviar"}.`);
    } catch (err) {
      console.error("[RESPALDO] falló:", err?.message ?? err);
    }
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
    let porWhatsAppTotal = 0;
    let porCorreoTotal = 0;

    for (const cita of citas) {
      if (cita.recordada || (!cita.contacto && !cita.telefono)) continue;

      // WhatsApp primero: es donde la gente sí lee. Va con plantilla aprobada
      // porque es el negocio escribiendo primero (ver lib/mensajeria.js).
      // Sirve el número guardado al agendar o, si no hay, lo que la persona
      // haya dejado como contacto (si resulta ser un teléfono).
      let porWhatsApp = false;
      if (whatsappSalidaConfigurada()) {
        ({ entregado: porWhatsApp } = await enviarRecordatorioWhatsApp({
          para: cita.telefono || cita.contacto,
          nombre: cita.nombre,
          cuando: cita.etiqueta,
          codigo: cita.codigo,
          bitacora: { almacen, cliente: "intellectum" },
        }));
      }

      // El correo refuerza (o cubre a quien no dejó teléfono).
      let porCorreo = false;
      if (cita.contacto?.includes("@")) {
        try {
          ({ entregado: porCorreo } = await enviarRecordatorioCita({
            para: cita.contacto,
            nombre: cita.nombre,
            cuando: cita.etiqueta,
            codigo: cita.codigo,
          }));
        } catch (err) {
          console.error(`[RECORDATORIOS] falló el correo a ${cita.contacto}:`, err?.message ?? err);
        }
      }

      // Solo se marca si ALGO salió: si todo falló, queda registro de que a
      // esta persona no se le avisó.
      if (porWhatsApp || porCorreo) {
        await marcarRecordada(cita.id);
        recordadas++;
        if (porWhatsApp) porWhatsAppTotal++;
        if (porCorreo) porCorreoTotal++;
      }
    }

    await enviarAviso({
      asunto: `Hoy tienes ${citas.length} ${citas.length === 1 ? "cita" : "citas"}`,
      cuerpo: [
        ...citas.map((c) => `${c.etiqueta} — ${c.nombre || "sin nombre"} (${c.contacto || "sin correo"})`),
        "",
        `A ${recordadas} de ${citas.length} se les recordó (${porWhatsAppTotal} por WhatsApp, ${porCorreoTotal} por correo).`,
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
