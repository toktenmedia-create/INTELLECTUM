/**
 * MENSAJES SALIENTES DE WHATSAPP — los que empieza el negocio, no el cliente.
 *
 * Cuando el cliente escribe primero, se le puede responder texto libre durante
 * 24 horas (eso vive en api/whatsapp.js). Pero para ESCRIBIRLE PRIMERO —un
 * recordatorio de cita, por ejemplo— Meta exige usar una PLANTILLA aprobada.
 * No es burocracia decorativa: es el mecanismo anti-spam de WhatsApp, y
 * respetarlo es lo que mantiene el número con buena reputación.
 *
 * La plantilla "recordatorio_cita_hoy" (idioma es, categoría UTILITY) se creó
 * por API en la WABA y dice:
 *
 *   Hola {{1}}, te recordamos tu cita de hoy con Intellectum AI Solutions:
 *   {{2}}. Si necesitas reagendar o cancelar, responde a este mensaje
 *   indicando la referencia {{3}} y te ayudamos.
 *
 * LECCIÓN (ago 2026): las versiones anteriores ("recordatorio_de_cita" y
 * "recordatorio_cita") decían "Tu código de cita es {{3}}" y Meta las rechazó
 * al instante con INCORRECT_CATEGORY incluso con el negocio ya verificado: la
 * palabra "código" junto a una variable se lee como mensaje de autenticación
 * (códigos de un solo uso), que es otra categoría. Sin esa palabra, la misma
 * plantilla entró en revisión normal. Si hay que reescribirla, no usar
 * "código", "clave" ni "PIN" cerca de una variable.
 *
 * Si algún día cambia el texto, se crea una VERSIÓN NUEVA en Meta y se espera
 * su aprobación; el nombre y el orden de las variables deben seguir cuadrando
 * con lo que se manda aquí.
 */

import { GRAPH } from "./multimedia.js";

const PLANTILLA_RECORDATORIO = "recordatorio_cita_hoy";
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
// Seguimiento a quien pidió precio y no volvió:
//   Hola {{1}}, te escribimos de Intellectum AI Solutions. Quedo pendiente la
//   cotizacion de {{2}} que pediste por este chat. Si quieres revisarla o
//   resolver cualquier duda, responde a este mensaje y te ayudamos. Si
//   prefieres no recibir mas mensajes nuestros, responde SALIR.
// OJO: Meta la clasificó MARKETING, no UTILITY, así que CADA envío se cobra a
// tarifa de marketing. Quién la recibe y cuándo se decide en lib/seguimiento.js.
const PLANTILLA_SEGUIMIENTO = "seguimiento_cotizacion";

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
export async function enviarRecordatorioWhatsApp({ para, nombre, cuando, codigo, bitacora }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false };

  const r = await mandar(
    {
      to: numero,
      ...plantilla(PLANTILLA_RECORDATORIO, [
        (nombre || "").trim() || "buen día",
        cuando,
        codigo || "—",
      ]),
    },
    "recordatorio (plantilla)",
    bitacora,
    { sesion: numero, tipo: "plantilla", plantilla: PLANTILLA_RECORDATORIO, destino: "cliente", motivo: "recordatorio" },
  );
  return { entregado: r.ok };
}

/**
 * ANOTA CADA MENSAJE QUE SALE. Desde el 1 de octubre de 2026 Meta cobra por
 * mensaje ENTREGADO, no por conversación, así que "cuántos mensajes manda el
 * agente en una charla" dejó de ser curiosidad y pasó a ser el número del que
 * depende el margen de cada plan.
 *
 * Se anota el HECHO (cuántos, de qué tipo, por qué), nunca el precio: las
 * tarifas de Meta cambian y una cifra guardada aquí envejecería mal. El precio
 * se multiplica después, donde vive la tarifa del momento.
 *
 * Solo WhatsApp: el chat de la web no le cuesta nada a nadie.
 *
 * Nunca lanza ni bloquea. Un contador que tumbe una respuesta al cliente
 * estaría midiendo el negocio a costa de arruinarlo.
 */
async function anotarEntrega(bitacora, detalle) {
  if (!bitacora?.almacen) return;
  try {
    await bitacora.almacen.registrarEvento({
      tipo: "mensaje_entregado",
      actor: "sistema",
      cliente: bitacora.cliente ?? "intellectum",
      detalle: { canal: "whatsapp", ...detalle },
    });
  } catch (err) {
    console.error("[CONSUMO] no se pudo anotar la entrega:", err?.message ?? err);
  }
}

/** POST crudo al Graph. Devuelve { ok, detalle } y nunca lanza. */
async function mandar(cuerpo, etiqueta, bitacora = null, anotacion = null) {
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
    // Solo lo entregado se cuenta: lo que Meta rechazó no se cobra.
    if (anotacion) await anotarEntrega(bitacora, anotacion);
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
export async function enviarTextoWhatsApp({ para, texto, bitacora, motivo = "respuesta" }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false, detalle: "sin_configurar" };
  const r = await mandar(
    { to: numero, type: "text", text: { body: texto } },
    "texto libre",
    bitacora,
    { sesion: numero, tipo: "servicio", plantilla: null, destino: "cliente", motivo },
  );
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
export async function enviarCancelacionWhatsApp({ para, nombre, cuando, bitacora }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false };

  const texto = [
    `Hola${nombre ? ` ${nombre}` : ""}, lamentamos avisarte que tu cita con Intellectum del ${cuando} tuvo que cancelarse por un imprevisto de agenda. Te pedimos disculpas.`,
    ``,
    `¿La reponemos? Aquí puedes ver las fechas disponibles y elegir tu nueva hora en un minuto: https://www.intellectum.ec/chat?intencion=reagendar`,
    ``,
    `O respóndeme por aquí y la coordinamos al momento.`,
  ].join("\n");

  const comun = { sesion: numero, destino: "cliente", motivo: "cancelacion" };

  const libre = await mandar(
    { to: numero, type: "text", text: { body: texto } },
    "cancelación (texto)",
    bitacora,
    { ...comun, tipo: "servicio", plantilla: null },
  );
  if (libre.ok) return { entregado: true, via: "texto" };

  const porPlantilla = await mandar(
    { to: numero, ...plantilla(PLANTILLA_CANCELACION, [(nombre || "").trim() || "buen día", cuando]) },
    "cancelación (plantilla)",
    bitacora,
    { ...comun, tipo: "plantilla", plantilla: PLANTILLA_CANCELACION },
  );
  return { entregado: porPlantilla.ok, via: porPlantilla.ok ? "plantilla" : null };
}

/**
 * Aviso interno al WhatsApp del dueño (cancelaciones, cambios).
 * Misma cascada; nunca lanza y nunca es requisito: el correo ya salió por
 * su lado y este canal es refuerzo.
 */
export async function avisarEquipoWhatsApp({ texto, bitacora }) {
  if (!whatsappSalidaConfigurada()) return { entregado: false };

  // destino "equipo": estos mensajes cuestan, pero no son atención al cliente.
  // Mezclarlos en el promedio inflaría lo que parece costar cada conversación.
  const comun = { sesion: "equipo", destino: "equipo", motivo: "aviso_interno" };

  const libre = await mandar(
    { to: EQUIPO(), type: "text", text: { body: `Aviso de IntelliA: ${texto}` } },
    "aviso interno (texto)",
    bitacora,
    { ...comun, tipo: "servicio", plantilla: null },
  );
  if (libre.ok) return { entregado: true };

  const porPlantilla = await mandar(
    { to: EQUIPO(), ...plantilla(PLANTILLA_AVISO, [texto]) },
    "aviso interno (plantilla)",
    bitacora,
    { ...comun, tipo: "plantilla", plantilla: PLANTILLA_AVISO },
  );
  return { entregado: porPlantilla.ok };
}

/**
 * El seguimiento a quien cotizó y no volvió.
 *
 * Sin cascada a texto libre a propósito: el sentido de este mensaje es
 * escribirle a alguien que lleva días callado, o sea FUERA de la ventana de 24
 * horas. Si la persona hubiera escrito hace poco, no tocaría mandárselo — de
 * eso se encarga lib/seguimiento.js antes de llamar aquí.
 */
export async function enviarSeguimientoWhatsApp({ para, nombre, concepto, bitacora }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false };

  const r = await mandar(
    { to: numero, ...plantilla(PLANTILLA_SEGUIMIENTO, [nombre, concepto]) },
    "seguimiento (plantilla)",
    bitacora,
    {
      sesion: numero,
      tipo: "plantilla",
      plantilla: PLANTILLA_SEGUIMIENTO,
      destino: "cliente",
      motivo: "seguimiento",
    },
  );
  return { entregado: r.ok, detalle: r.detalle };
}

/**
 * Manda un documento por WhatsApp. Meta NO recibe el archivo: recibe una
 * dirección y va ella a buscarlo, así que el enlace tiene que ser público
 * (por eso los de lib/documento.js van firmados en vez de ser secretos).
 *
 * El pie de foto es lo único que la persona lee antes de decidir si lo abre,
 * de modo que ahí va lo que es, no "documento adjunto".
 */
export async function enviarDocumentoWhatsApp({ para, enlace, nombreArchivo, pie, bitacora, motivo = "documento" }) {
  const numero = normalizarTelefono(para);
  if (!numero || !whatsappSalidaConfigurada()) return { entregado: false, detalle: "sin_configurar" };

  const r = await mandar(
    {
      to: numero,
      type: "document",
      document: { link: enlace, filename: nombreArchivo, caption: pie ?? "" },
    },
    "documento",
    bitacora,
    { sesion: numero, tipo: "servicio", plantilla: null, destino: "cliente", motivo },
  );
  return { entregado: r.ok, detalle: r.detalle };
}
