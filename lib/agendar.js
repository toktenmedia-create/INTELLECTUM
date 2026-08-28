/**
 * AGENDAR UNA CONSULTORÍA — un solo camino, dos puertas.
 *
 * Por aquí pasan tanto la herramienta agendar_cita (cuando la persona lo pide
 * conversando) como la página /agenda (cuando lo hace ella misma con el ratón).
 * Vive aparte porque son dos puertas al MISMO acto: si la lógica estuviera
 * copiada, un día la cita agendada por chat guardaría el lead y la agendada por
 * la web no, y nadie se enteraría hasta perder un cliente.
 *
 * El orden importa y es deliberado: primero el calendario, después todo lo
 * demás. Ni el lead, ni el aviso al equipo, ni el correo de confirmación pueden
 * tumbar una cita que ya está tomada — si algo de eso falla, la hora sigue
 * siendo de la persona y el fallo se grita en el registro.
 */

import { crearCita, invitacionICS, inicioDesdeCodigo } from "./calendario.js";
import { enviarAviso, enviarConfirmacionCita } from "./leads.js";

/**
 * @param {object} datos
 * @param {string} [datos.codigo]     el código corto de la hora ("1708-1430")
 * @param {string} [datos.inicioISO]  o la hora directamente
 * @param {object} [datos.almacen]    para guardar el lead; opcional
 * @returns {Promise<{ok: boolean, motivo?: string, cita?: object, correoLlego?: boolean}>}
 */
export async function agendarConsultoria({
  codigo,
  inicioISO,
  nombre,
  contacto,
  telefono = "",
  empresa = "",
  motivo = "",
  almacen = null,
  cliente = "intellectum",
  canal = "web",
  meta = {},
  origen = "chat",
}) {
  const inicio = inicioISO || inicioDesdeCodigo(codigo);
  if (!inicio) return { ok: false, motivo: "hora_invalida" };

  const cita = await crearCita({ inicioISO: inicio, nombre, contacto, telefono, empresa, motivo });
  if (!cita.ok) return { ok: false, motivo: "hora_ocupada", cita };

  // Una cita agendada es el mejor lead que hay, así que se guarda igual.
  let lead = null;
  if (almacen) {
    try {
      lead = await almacen.guardarLead(
        {
          nombre,
          contacto,
          empresa,
          necesidad: motivo,
          urgencia: "alta",
          // Quien agenda ya cruzó la línea de "nuevo": el panel lo recibe como
          // contactado. Ganado y perdido siguen siendo decisión del dueño.
          estado: "contactado",
          resumen: `Agendó consultoría para ${cita.etiqueta}.`,
        },
        { ...meta, cliente, canal },
      );
    } catch (err) {
      console.error("[CITA] no se pudo guardar el lead:", err?.message ?? err);
    }
  }

  const [aviso, confirmacion] = await Promise.allSettled([
    enviarAviso({
      asunto: `Cita agendada: ${nombre}${empresa ? ` — ${empresa}` : ""}`,
      cuerpo: [
        `${cita.etiqueta} (hora de Ecuador)`,
        ``,
        `Nombre: ${nombre}`,
        `Contacto: ${contacto}`,
        `Empresa: ${empresa || "no indicada"}`,
        ``,
        `Quiere resolver: ${motivo || "no lo indicó"}`,
        ``,
        `La agendó: ${origen}`,
        cita.enlace ? `En el calendario: ${cita.enlace}` : "",
      ]
        .filter((l) => l !== "")
        .join("\n"),
    }),
    enviarConfirmacionCita({
      para: contacto,
      nombre,
      cuando: cita.etiqueta,
      codigo: cita.codigo,
      cambio: "nueva",
      ics: invitacionICS({ inicioISO: cita.inicio, finISO: cita.fin, nombre, id: cita.id }),
    }),
  ]);

  if (confirmacion.status === "rejected") {
    console.error("[CITA] falló la confirmación:", confirmacion.reason?.message);
  }
  if (aviso.status === "rejected") {
    console.error("[CITA] falló el aviso al equipo:", aviso.reason?.message);
  }

  return {
    ok: true,
    cita,
    lead,
    correoLlego: confirmacion.status === "fulfilled" && Boolean(confirmacion.value?.entregado),
  };
}
