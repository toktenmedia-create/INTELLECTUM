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

/**
 * Aviso suelto hacia el equipo (no es un lead): lo usa la herramienta
 * escalar_a_humano cuando una conversación necesita a una persona.
 *
 * Sale por los mismos canales ya configurados. Si no hay ninguno, queda en el
 * registro y se devuelve entregado:false para que el agente le dé al visitante
 * el correo y el WhatsApp en vez de prometer un contacto que no va a ocurrir.
 */
export async function enviarAviso({ asunto, cuerpo }) {
  console.log("[AVISO_INTELLECTUM]", JSON.stringify({ asunto, cuerpo }));

  const intentos = [];

  if (process.env.RESEND_API_KEY && process.env.LEADS_EMAIL) {
    intentos.push(
      enviarEmailCrudo(asunto, cuerpo).catch((err) =>
        console.error("[AVISO] fallo enviando email:", err?.message ?? err),
      ),
    );
  }

  if (process.env.LEADS_WEBHOOK_URL) {
    intentos.push(
      enviarWebhook({ tipo: "aviso", asunto, cuerpo, recibido_en: new Date().toISOString() }).catch(
        (err) => console.error("[AVISO] fallo enviando webhook:", err?.message ?? err),
      ),
    );
  }

  if (intentos.length === 0) return { entregado: false };

  const resultados = await Promise.allSettled(intentos);
  return { entregado: resultados.some((r) => r.status === "fulfilled") };
}

/**
 * Respaldo periódico de la base: un correo al equipo con el JSON adjunto.
 * No sustituye a una copia en la nube, pero garantiza que SIEMPRE exista una
 * foto reciente de los datos fuera de Supabase, en un lugar que el dueño ya
 * revisa todos los días: su correo.
 */
export async function enviarRespaldo({ fecha, contenido }) {
  if (!process.env.RESEND_API_KEY || !process.env.LEADS_EMAIL) return { entregado: false };

  const json = JSON.stringify(contenido, null, 1);
  const resumen = Object.entries(contenido)
    .map(([tabla, filas]) => `  ${tabla}: ${Array.isArray(filas) ? filas.length : 0} filas`)
    .join("\n");

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LEADS_FROM || "IntelliA <onboarding@resend.dev>",
      to: destinatarios(),
      subject: `Respaldo semanal de IntelliA — ${fecha}`,
      text: [
        `Adjunta va la copia completa de la base de datos de IntelliA al ${fecha}.`,
        ``,
        resumen,
        ``,
        `Guarda este correo: si algún día pasa algo con la base, esta foto permite reconstruirla.`,
      ].join("\n"),
      attachments: [{ filename: `respaldo-intellia-${fecha}.json`, content: aBase64(json) }],
    }),
  });

  if (!respuesta.ok) {
    console.error(`[RESPALDO] Resend respondió ${respuesta.status}:`, (await respuesta.text()).slice(0, 200));
    return { entregado: false };
  }
  return { entregado: true };
}

/**
 * Confirmación de cita para el prospecto, con el .ics adjunto para que la
 * agregue a su propio calendario de un clic.
 *
 * Va a la persona, no al equipo: es el único correo del sistema que sale hacia
 * afuera, así que se manda solo con una dirección que la persona ya entregó.
 */
export async function enviarConfirmacionCita({ para, nombre, cuando, ics, codigo, cambio }) {
  if (!process.env.RESEND_API_KEY || !para) return { entregado: false };

  const encabezado = {
    nueva: `Tu consultoría gratuita con Intellectum quedó agendada para el ${cuando} (hora de Ecuador).`,
    movida: `Tu consultoría quedó movida al ${cuando} (hora de Ecuador). La invitación adjunta reemplaza a la anterior.`,
    cancelada: `Tu consultoría del ${cuando} quedó cancelada. Si quieres retomarla, escríbenos cuando gustes.`,
    // "reagendar": la cancelamos NOSOTROS por una emergencia. El tono cambia:
    // disculpa primero, y la invitación explícita a elegir otra hora.
    reagendar: `Por un imprevisto de agenda tuvimos que cancelar tu consultoría del ${cuando} (hora de Ecuador). Te pedimos disculpas: la hora era tuya y nos encantaría reponerla.`,
  }[cambio || "nueva"];

  const esCancelacion = cambio === "cancelada" || cambio === "reagendar";

  const texto = [
    `Hola${nombre ? ` ${nombre}` : ""},`,
    ``,
    encabezado,
    ...(esCancelacion ? [] : [`Dura 30 minutos y no tiene ningún compromiso.`]),
    ``,
    ...(cambio === "cancelada"
      ? [`El adjunto la quita de tu calendario.`]
      : cambio === "reagendar"
        ? [
            `El adjunto la quita de tu calendario.`,
            ``,
            `¿La reagendamos? Aquí ves las fechas disponibles y eliges tu nueva`,
            `hora en un minuto:`,
            ``,
            `    https://www.intellectum.ec/chat?intencion=reagendar`,
            ``,
            `O respóndenos a este correo con la hora que mejor te venga.`,
          ]
        : [
            `Adjunto va la invitación para que la agregues a tu calendario.`,
            ``,
            `¿Necesitas moverla o cancelarla? Escríbele a IntelliA en www.intellectum.ec`,
            `con este código y ella lo resuelve al momento:`,
            ``,
            `    ${codigo}`,
          ]),
    ``,
    `También puedes responder a este correo o escribirnos al WhatsApp +593 96 751 8060.`,
    ``,
    `Intellectum AI Solutions`,
    `info@intellectum.ec · www.intellectum.ec`,
  ].join("\n");

  const asunto = {
    nueva: `Tu consultoría con Intellectum: ${cuando}`,
    movida: `Cambio de hora: tu consultoría es el ${cuando}`,
    cancelada: `Cancelada: tu consultoría del ${cuando}`,
    reagendar: `¿Reagendamos? Tuvimos que cancelar tu consultoría del ${cuando}`,
  }[cambio || "nueva"];

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LEADS_FROM || "IntelliA <onboarding@resend.dev>",
      to: [para],
      subject: asunto,
      text: texto,
      attachments: [{ filename: "consultoria-intellectum.ics", content: aBase64(ics) }],
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  return { entregado: true };
}

/** Recordatorio de la mañana para quien tiene cita hoy. */
export async function enviarRecordatorioCita({ para, nombre, cuando, codigo }) {
  if (!process.env.RESEND_API_KEY || !para) return { entregado: false };

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LEADS_FROM || "IntelliA <onboarding@resend.dev>",
      to: [para],
      subject: `Hoy: tu consultoría con Intellectum (${cuando})`,
      text: [
        `Hola${nombre ? ` ${nombre}` : ""},`,
        ``,
        `Te recordamos que hoy tienes tu consultoría gratuita: ${cuando} (hora de Ecuador).`,
        `Son 30 minutos y salimos de ahí con un mapa de qué automatizar primero.`,
        ``,
        `Si algo se te cruzó, puedes moverla escribiéndole a IntelliA en`,
        `www.intellectum.ec con tu código: ${codigo}`,
        ``,
        `Intellectum AI Solutions`,
        `info@intellectum.ec · WhatsApp +593 96 751 8060`,
      ].join("\n"),
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  return { entregado: true };
}

/**
 * A base64, tanto texto como bytes crudos.
 *
 * La distinción importa: un PDF es binario, y pasarlo por TextEncoder —que es
 * lo que hacía esta función cuando solo se adjuntaban respaldos en JSON— lo
 * convertiría en la cadena "[object Uint8Array]" o lo destrozaría re-codificando
 * cada byte como UTF-8. El archivo llegaría, pesaría parecido, y no abriría.
 */
function aBase64(contenido) {
  const bytes =
    typeof contenido === "string" ? new TextEncoder().encode(contenido) : new Uint8Array(contenido);
  return Buffer.from(bytes).toString("base64");
}

async function enviarEmailCrudo(asunto, texto) {
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
      text: texto,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
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

/**
 * La cotización por correo, con el PDF adjunto de verdad.
 *
 * Va adjunto y no como enlace porque un correo con un archivo se reenvía al
 * socio o al jefe tal cual, que es exactamente lo que uno quiere que pase con
 * una cotización. Un enlace se pierde y encima caduca.
 */
export async function enviarCotizacionPorCorreo({ para, nombre, pdf, referencia, concepto, resumen }) {
  if (!process.env.RESEND_API_KEY || !para) return { entregado: false };

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.LEADS_FROM || "IntelliA <onboarding@resend.dev>",
      to: [para],
      subject: `Tu cotización de Intellectum${referencia ? ` (${referencia})` : ""}`,
      text: [
        `Hola${nombre ? ` ${nombre}` : ""},`,
        ``,
        `Adjunta va la cotización de ${concepto || "lo que conversamos"}: ${resumen || "el detalle está en el PDF"}.`,
        ``,
        `Los valores son referenciales y no incluyen IVA. El número exacto sale del`,
        `diagnóstico gratuito de 30 minutos, que puedes agendar aquí:`,
        ``,
        `    https://www.intellectum.ec/chat`,
        ``,
        `Cualquier duda, responde a este correo y te contestamos.`,
        ``,
        `Intellectum AI Solutions`,
        `info@intellectum.ec  ·  +593 96 751 8060  ·  www.intellectum.ec`,
      ].join("\n"),
      attachments: [
        { filename: `Cotizacion-Intellectum${referencia ? `-${referencia}` : ""}.pdf`, content: aBase64(pdf) },
      ],
    }),
  });

  if (!respuesta.ok) {
    console.error("[COTIZACION] Resend rechazó el envío:", (await respuesta.text()).slice(0, 300));
    return { entregado: false };
  }
  return { entregado: true };
}
