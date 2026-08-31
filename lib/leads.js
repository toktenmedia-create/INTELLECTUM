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

import { CLIENTE, NEGOCIO, esIntellectum } from "./cliente.js";
import { nombreDeArchivo } from "./documento.js";

/** "El Tornillo" → "el-tornillo": un nombre de archivo que abre en cualquier sistema. */
function nombreArchivo(t) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "negocio";
}

/**
 * El remitente. Sin LEADS_FROM se usa el buzón de pruebas de Resend, que solo
 * entrega al dueño de la cuenta: sirve para Intellectum mientras se prueba,
 * pero en la copia de un cliente significa que sus correos no salen. Se avisa
 * una vez al arrancar en vez de descubrirlo cuando falte un correo.
 */
function remitente() {
  const propio = (process.env.LEADS_FROM ?? "").trim();
  if (propio) return propio;
  if (!esIntellectum() && !avisadoDelRemitente) {
    avisadoDelRemitente = true;
    console.warn(
      `[LEADS] la copia de "${CLIENTE}" no tiene LEADS_FROM: ` +
        "los correos saldrían desde el buzón de pruebas de Resend y no llegarían.",
    );
  }
  return `${NEGOCIO.agente} <onboarding@resend.dev>`;
}
let avisadoDelRemitente = false;

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
  console.log(`[LEAD_${CLIENTE.toUpperCase()}]`, JSON.stringify(registro));

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
  console.log(`[AVISO_${CLIENTE.toUpperCase()}]`, JSON.stringify({ asunto, cuerpo }));

  const intentos = [];

  // OJO CON EL .catch DE AQUÍ ABAJO: tiene que RELANZAR.
  //
  // Antes solo escribía en el registro y devolvía normal, con lo cual
  // allSettled veía la promesa como "fulfilled" y entregado salía true aunque
  // Resend hubiera rechazado el correo. La función SIEMPRE decía que entregó.
  //
  // Descubierto el 27 ago 2026 leyendo un informe DMARC: diez llamadas del
  // agente de voz, cuatro correos vistos por Google. Los seis perdidos no
  // dejaron rastro en ninguna parte porque el sistema se creía a sí mismo.
  // Quien llama a esto decide qué hacer con un fallo; mentirle no es opción.
  if (process.env.RESEND_API_KEY && process.env.LEADS_EMAIL) {
    intentos.push(
      enviarEmailCrudo(asunto, cuerpo).catch((err) => {
        console.error("[AVISO] fallo enviando email:", err?.message ?? err);
        throw err;
      }),
    );
  }

  if (process.env.LEADS_WEBHOOK_URL) {
    intentos.push(
      enviarWebhook({ tipo: "aviso", asunto, cuerpo, recibido_en: new Date().toISOString() }).catch(
        (err) => {
          console.error("[AVISO] fallo enviando webhook:", err?.message ?? err);
          throw err;
        },
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
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
      to: destinatarios(),
      subject: `Respaldo semanal de ${NEGOCIO.agente} — ${fecha}`,
      text: [
        `Adjunta va la copia completa de la base de datos de ${NEGOCIO.agente} al ${fecha}.`,
        ``,
        resumen,
        ``,
        `Guarda este correo: si algún día pasa algo con la base, esta foto permite reconstruirla.`,
      ].join("\n"),
      attachments: [{ filename: `respaldo-${nombreArchivo(NEGOCIO.agente)}-${fecha}.json`, content: aBase64(json) }],
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

  // El diseño vive en lib/correo-cita.js. Se carga solo cuando hace falta,
  // igual que el correo de horarios: quien manda un lead no necesita cargar
  // plantillas de correo que no va a usar.
  const { correoDeCita, textoDeCita } = await import("./correo-cita.js");
  const html = correoDeCita({ nombre, cuando, codigo, cambio: cambio || "nueva" });
  const texto = textoDeCita({ nombre, cuando, codigo, cambio: cambio || "nueva" });

  const cita = NEGOCIO.evento;
  const asunto = {
    nueva: `Tu ${cita} con ${NEGOCIO.nombreCorto}: ${cuando}`,
    movida: `Cambio de hora: tu ${cita} es el ${cuando}`,
    cancelada: `Cancelada: tu ${cita} del ${cuando}`,
    reagendar: `¿Reagendamos? Tuvimos que cancelar tu ${cita} del ${cuando}`,
  }[cambio || "nueva"];

  const respuesta = await fetch("https://api.resend.com/emails", {
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
      to: [para],
      subject: asunto,
      html,
      // El texto plano va SIEMPRE junto al HTML: hay quien lee así, y varios
      // filtros de spam castigan los correos que solo traen HTML.
      text: texto,
      attachments: [{ filename: `${nombreArchivo(NEGOCIO.evento)}-${nombreArchivo(NEGOCIO.nombreCorto)}.ics`, content: aBase64(ics) }],
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
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
      to: [para],
      subject: `Hoy: tu ${NEGOCIO.evento} con ${NEGOCIO.nombreCorto} (${cuando})`,
      text: [
        `Hola${nombre ? ` ${nombre}` : ""},`,
        ``,
        `Te recordamos que hoy tienes tu ${NEGOCIO.cita}: ${cuando} (hora de Ecuador).`,
        ...(NEGOCIO.promesaCita ? [NEGOCIO.promesaCita] : []),
        ``,
        ...(NEGOCIO.dominio
          ? [
              `Si algo se te cruzó, puedes moverla escribiéndole a ${NEGOCIO.agente} en`,
              `${NEGOCIO.dominio} con tu código: ${codigo}`,
              ``,
            ]
          : [`Si algo se te cruzó, respóndenos este correo con tu código: ${codigo}`, ``]),
        NEGOCIO.nombre,
        [NEGOCIO.correo, NEGOCIO.whatsappBot ? `WhatsApp ${NEGOCIO.whatsappBot}` : ""]
          .filter(Boolean)
          .join(" · "),
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
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
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
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
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
    signal: AbortSignal.timeout(5_000),
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
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
      to: [para],
      subject: `Tu cotización de ${NEGOCIO.nombreCorto}${referencia ? ` (${referencia})` : ""}`,
      text: [
        `Hola${nombre ? ` ${nombre}` : ""},`,
        ``,
        `Adjunta va la cotización de ${concepto || "lo que conversamos"}: ${resumen || "el detalle está en el PDF"}.`,
        ``,
        `Los valores son referenciales y no incluyen IVA. El número exacto sale de`,
        ...(NEGOCIO.sitio
          ? [`la ${NEGOCIO.cita}, que puedes agendar aquí:`, ``, `    ${NEGOCIO.sitio}/chat`]
          : [`la ${NEGOCIO.cita}. Responde este correo y la coordinamos.`]),
        ``,
        `Cualquier duda, responde a este correo y te contestamos.`,
        ``,
        NEGOCIO.nombre,
        [NEGOCIO.correo, NEGOCIO.whatsappBot, NEGOCIO.dominio].filter(Boolean).join("  ·  "),
      ].join("\n"),
      attachments: [
        { filename: nombreDeArchivo(referencia), content: aBase64(pdf) },
      ],
    }),
  });

  if (!respuesta.ok) {
    console.error("[COTIZACION] Resend rechazó el envío:", (await respuesta.text()).slice(0, 300));
    return { entregado: false };
  }
  return { entregado: true };
}

/**
 * "Elige tu hora" por correo, con horas reales que son botones.
 *
 * Va en HTML y en texto plano a la vez: hay quien lee el correo en modo texto,
 * y varios filtros de spam castigan los mensajes que solo traen HTML.
 */
export async function enviarHorariosPorCorreo({ para, nombre, horarios, intro, motivo, asunto }) {
  if (!process.env.RESEND_API_KEY || !para) return { entregado: false };
  if (!horarios?.length) return { entregado: false, detalle: "sin_horarios" };
  // Este correo entero son enlaces a /agenda. Sin dominio propio no hay correo
  // que mandar: los enlaces saldrían rotos o, peor, apuntando a otra empresa.
  if (!NEGOCIO.sitio) {
    console.warn(`[HORARIOS] la copia de "${CLIENTE}" no tiene SITIO_URL: no se manda el correo de horarios.`);
    return { entregado: false, detalle: "sin_sitio" };
  }

  const { correoDeHorarios, textoDeHorarios } = await import("./correo-horarios.js");

  const respuesta = await fetch("https://api.resend.com/emails", {
    signal: AbortSignal.timeout(5_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente(),
      to: [para],
      subject: asunto || `Elige la hora de tu ${NEGOCIO.evento} con ${NEGOCIO.nombreCorto}`,
      html: correoDeHorarios({ nombre, horarios, intro, motivo }),
      text: textoDeHorarios({ nombre, horarios, intro }),
    }),
  });

  if (!respuesta.ok) {
    console.error("[HORARIOS] Resend rechazó el envío:", (await respuesta.text()).slice(0, 300));
    return { entregado: false };
  }
  return { entregado: true };
}
