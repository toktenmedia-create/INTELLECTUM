/**
 * MENSAJES SALIENTES DE WHATSAPP — los que empieza el negocio, no el cliente.
 *
 * Cuando el cliente escribe primero, se le puede responder texto libre durante
 * 24 horas (eso vive en api/whatsapp.js). Pero para ESCRIBIRLE PRIMERO —un
 * recordatorio de cita, por ejemplo— Meta exige usar una PLANTILLA aprobada.
 * No es burocracia decorativa: es el mecanismo anti-spam de WhatsApp, y
 * respetarlo es lo que mantiene el número con buena reputación.
 *
 * La plantilla "recordatorio_de_cita" (idioma es, categoría UTILITY) se creó
 * por API en la WABA y dice:
 *
 *   Hola {{1}}, te escribimos de Intellectum para recordarte tu cita de hoy:
 *   {{2}}. El código de tu cita es {{3}}. Si necesitas reagendar o cancelar,
 *   responde a este mensaje y te ayudamos.
 *
 * OJO (ago 2026): mientras la verificación del negocio de Meta esté "pending",
 * TODA plantilla nueva se rechaza sola con INCORRECT_CATEGORY — no es el texto.
 * Cuando la verificación pase, se EDITA la plantilla rechazada (un POST a su id
 * con los mismos components) y eso dispara la re-revisión. Hasta entonces, el
 * envío de abajo falla con gracia y el recordatorio sale solo por correo.
 *
 * Si algún día cambia el texto, se crea una VERSIÓN NUEVA en Meta y se espera
 * su aprobación; el nombre y el orden de las variables deben seguir cuadrando
 * con lo que se manda aquí.
 */

import { GRAPH } from "./multimedia.js";

const PLANTILLA_RECORDATORIO = "recordatorio_de_cita";
// Cancelación por emergencia (el negocio cancela y pide reagendar). Misma
// situación que el recordatorio: rechazada a propósito hasta que pase la
// verificación de Meta; el texto fija el enlace para no pelear con la revisión:
//   Hola {{1}}, tu cita con Intellectum AI Solutions del {{2}} tuvo que
//   cancelarse por un imprevisto de agenda. Te pedimos disculpas. Puedes elegir
//   una nueva hora con las fechas disponibles en www.intellectum.ec/chat o
//   responder a este mensaje y la coordinamos.
const PLANTILLA_CANCELACION = "cancelacion_de_cita";
// Avisos internos al dueño (cancelaciones, escalamientos):
//   Aviso de IntelliA: {{1}}
const PLANTILLA_AVISO = "aviso_interno";

/** El WhatsApp del equipo (el número humano del negocio, no el de la API). */
const EQUIPO = () => process.env.EQUIPO_WHATSAPP || "593983120003";

/** ¿Hay credenciales para mandar WhatsApp? (las mismas del webhook) */
export function whatsappSalidaConfigurada() {
  return Boolean(process.env.META_TOKEN && process.env.META_PHONE_NUMBER_ID);
}

/**
 * Convierte lo que la persona haya escrito como teléfono en un número E.164
 * sin el "+", que es como lo quiere Meta. Devuelve null si eso no es un
 * teléfono (un correo, un texto suelto), y quien llama decide qué hacer.
 *
 *   "099 751 8060"   → "593997518060"
 *   "0983120003"     → "593983120003"
 *   "+593 98 312 0003" → "593983120003"
 *   "ana@empresa.com"  → null
 */
export function normalizarTelefono(crudo) {
  const texto = String(crudo ?? "").trim();
  if (!texto || texto.includes("@")) return null;

  let digitos = texto.replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (/^09\d{8}$/.test(digitos)) digitos = `593${digitos.slice(1)}`; // celular local
  if (/^5930\d+$/.test(digitos)) digitos = `593${digitos.slice(4)}`; // "+593 09..." mal escrito

  // Cualquier internacional razonable pasa; lo demás no es un teléfono.
  return /^[1-9]\d{7,14}$/.test(digitos) ? digitos : null;
}

/**
 * Manda el recordatorio de cita por WhatsApp usando la plantilla aprobada.
 * Devuelve { entregado } y NUNCA lanza: el que recuerda es un cron que tiene
 * que seguir con la siguiente cita aunque esta falle.
 */
export async function enviarRecordatorioWhatsApp({ para, nombre, cuando, codigo }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false };

  try {
    const respuesta = await fetch(`${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: PLANTILLA_RECORDATORIO,
          language: { code: "es" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: (nombre || "").trim() || "buen día" },
                { type: "text", text: cuando },
                { type: "text", text: codigo || "—" },
              ],
            },
          ],
        },
      }),
    });

    if (!respuesta.ok) {
      console.error(`[WHATSAPP] plantilla a ${numero} falló (${respuesta.status}):`, (await respuesta.text()).slice(0, 300));
      return { entregado: false };
    }

    return { entregado: true };
  } catch (err) {
    console.error("[WHATSAPP] no se pudo mandar la plantilla:", err?.message ?? err);
    return { entregado: false };
  }
}

/** POST crudo al Graph. Devuelve { ok, detalle } y nunca lanza. */
async function mandar(cuerpo, etiqueta) {
  try {
    const respuesta = await fetch(`${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    });
    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 300);
      console.error(`[WHATSAPP] ${etiqueta} falló (${respuesta.status}):`, detalle);
      return { ok: false, detalle };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[WHATSAPP] ${etiqueta} no salió:`, err?.message ?? err);
    return { ok: false, detalle: String(err?.message ?? err) };
  }
}

function plantilla(nombre, parametros) {
  return {
    type: "template",
    template: {
      name: nombre,
      language: { code: "es" },
      components: [
        { type: "body", parameters: parametros.map((t) => ({ type: "text", text: t })) },
      ],
    },
  };
}

/**
 * Texto libre. Solo entra si la persona escribió en las últimas 24 horas
 * (la "ventana de servicio" de Meta); fuera de ella Meta lo rechaza y
 * devolvemos entregado:false para que quien llama pruebe con plantilla.
 */
export async function enviarTextoWhatsApp({ para, texto }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false, detalle: "sin_configurar" };
  const r = await mandar({ to: numero, type: "text", text: { body: texto } }, "texto libre");
  return { entregado: r.ok, detalle: r.detalle };
}

/**
 * Aviso de cancelación al cliente, con el camino para reagendar.
 *
 * Cascada: primero texto libre (si la persona habló hace poco, entra y es
 * gratis), y si no, la plantilla cancelacion_de_cita. Mientras la verificación
 * de Meta siga pendiente la plantilla está rechazada, así que fuera de la
 * ventana de 24h esto devuelve entregado:false y el correo queda como canal.
 */
export async function enviarCancelacionWhatsApp({ para, nombre, cuando }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false };

  const texto = [
    `Hola${nombre ? ` ${nombre}` : ""}, lamentamos avisarte que tu cita con Intellectum del ${cuando} tuvo que cancelarse por un imprevisto de agenda. Te pedimos disculpas.`,
    ``,
    `¿La reponemos? Aquí puedes ver las fechas disponibles y elegir tu nueva hora en un minuto: https://www.intellectum.ec/chat?intencion=reagendar`,
    ``,
    `O respóndeme por aquí y la coordinamos al momento.`,
  ].join("\n");

  const libre = await mandar({ to: numero, type: "text", text: { body: texto } }, "cancelación (texto)");
  if (libre.ok) return { entregado: true, via: "texto" };

  const porPlantilla = await mandar(
    { to: numero, ...plantilla(PLANTILLA_CANCELACION, [(nombre || "").trim() || "buen día", cuando]) },
    "cancelación (plantilla)",
  );
  return { entregado: porPlantilla.ok, via: porPlantilla.ok ? "plantilla" : null };
}

/**
 * Aviso interno al WhatsApp del dueño (cancelaciones, cambios).
 * Misma cascada; nunca lanza y nunca es requisito: el correo ya salió por
 * su lado y este canal es refuerzo.
 */
export async function avisarEquipoWhatsApp({ texto }) {
  if (!whatsappSalidaConfigurada()) return { entregado: false };

  const libre = await mandar({ to: EQUIPO(), type: "text", text: { body: `Aviso de IntelliA: ${texto}` } }, "aviso interno (texto)");
  if (libre.ok) return { entregado: true };

  const porPlantilla = await mandar(
    { to: EQUIPO(), ...plantilla(PLANTILLA_AVISO, [texto]) },
    "aviso interno (plantilla)",
  );
  return { entregado: porPlantilla.ok };
}
