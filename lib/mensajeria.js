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
