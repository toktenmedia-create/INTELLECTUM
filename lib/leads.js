/**
 * Entrega de leads.
 *
 * Tres salidas, todas opcionales excepto la primera:
 *   1. Log      — siempre. Queda en los logs de Vercel (pestaña "Logs").
 *   2. Email    — si defines RESEND_API_KEY y LEADS_EMAIL.
 *   3. Webhook  — si defines LEADS_WEBHOOK_URL (n8n, Make, Google Sheets...).
 *
 * Ningún fallo aquí puede romper la conversación: si el correo falla, el bot
 * sigue hablando con el cliente igual y el lead queda en el log.
 */

/**
 * @param {object} lead   datos que entregó el modelo
 * @param {object} meta   contexto (canal, origen, id de sesión)
 * @returns {Promise<{log: boolean, email: boolean, webhook: boolean}>}
 */
export async function entregarLead(lead, meta = {}) {
  const registro = {
    ...lead,
    canal: meta.canal ?? "web",
    origen: meta.origen ?? null,
    sesion: meta.sesion ?? null,
    recibido_en: new Date().toISOString(),
  };

  // 1. Log — siempre, y con un prefijo fácil de buscar en Vercel.
  console.log("[LEAD_INTELLECTUM]", JSON.stringify(registro));

  const resultado = { log: true, email: false, webhook: false };

  const entregas = [];

  if (process.env.RESEND_API_KEY && process.env.LEADS_EMAIL) {
    entregas.push(
      enviarEmail(registro)
        .then(() => {
          resultado.email = true;
        })
        .catch((err) => console.error("[LEAD] fallo enviando email:", err?.message ?? err)),
    );
  }

  if (process.env.LEADS_WEBHOOK_URL) {
    entregas.push(
      enviarWebhook(registro)
        .then(() => {
          resultado.webhook = true;
        })
        .catch((err) => console.error("[LEAD] fallo enviando webhook:", err?.message ?? err)),
    );
  }

  await Promise.all(entregas);
  return resultado;
}

async function enviarEmail(lead) {
  const asunto = `Nuevo lead: ${lead.nombre || "sin nombre"}${lead.empresa ? ` — ${lead.empresa}` : ""}`;

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LEADS_FROM || "IntelliA <onboarding@resend.dev>",
      to: destinatarios(),
      subject: asunto,
      text: formatearTexto(lead),
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}

async function enviarWebhook(lead) {
  const respuesta = await fetch(process.env.LEADS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });

  if (!respuesta.ok) {
    throw new Error(`Webhook respondió ${respuesta.status}`);
  }
}

/**
 * A quién se le avisa. LEADS_EMAIL acepta varias direcciones separadas por
 * coma, por ejemplo: "info@intellectum.ec, toktenmedia@gmail.com".
 *
 * Sirve para no depender de una sola bandeja: si el correo del dominio se
 * satura o se deja de revisar, el aviso igual llega al personal.
 */
function destinatarios() {
  return String(process.env.LEADS_EMAIL || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

function formatearTexto(lead) {
  const campos = [
    ["Nombre", lead.nombre],
    ["Empresa", lead.empresa],
    ["Sector", lead.sector],
    ["Cargo", lead.cargo],
    ["Contacto", lead.contacto],
    ["Necesidad", lead.necesidad],
    ["Urgencia", lead.urgencia],
    ["Tamaño", lead.tamano_empresa],
    ["Canal", lead.canal],
    ["Recibido", lead.recibido_en],
  ];

  const lineas = campos
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`);

  if (lead.resumen) {
    lineas.push("", "Resumen de la conversación:", lead.resumen);
  }

  return lineas.join("\n");
}
