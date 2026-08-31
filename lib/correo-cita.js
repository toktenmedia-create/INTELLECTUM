/**
 * EL CORREO DE LA CITA — el único que tu cliente guarda.
 *
 * Es el mensaje que recibe alguien que acaba de reservar media hora contigo.
 * Lo va a abrir dos veces: al recibirlo, para comprobar que quedó, y el día
 * de la cita, para ver a qué hora era. Todo lo demás sobra.
 *
 * DE AHÍ SALEN LAS TRES DECISIONES DE DISEÑO:
 *
 * 1. LA FECHA ES EL HÉROE. Es el único dato que va a buscar con prisa, así
 *    que va en grande, en la tipografía de la marca, dentro de su propio
 *    recuadro. Nada compite con ella.
 *
 * 2. EL CÓDIGO SE ESCONDE DETRÁS DE UN BOTÓN. Antes el correo enseñaba un
 *    "4X8723" suelto y pedía que se lo dictaran a IntelliA. Nadie sabe qué es
 *    eso: parece un error del sistema. Ahora hay un botón que abre el chat con
 *    la referencia ya puesta, y el código queda debajo, en pequeño, solo por
 *    si alguien prefiere escribirlo o el botón no le funciona.
 *
 * 3. NADA DE COMPROMISO EN EL PIE. Quien acaba de agendar no necesita que le
 *    vendan otra vez.
 *
 * Por qué va escrito con tablas y con los estilos pegados a cada etiqueta, que
 * en una web sería inaceptable: los clientes de correo no soportan flexbox de
 * forma fiable y varios descartan el bloque <style> entero. Es la única forma
 * de que se vea igual en Gmail, en Outlook y en el iPhone. Mismo criterio y
 * misma paleta que lib/correo-horarios.js.
 */

import { NEGOCIO } from "./cliente.js";
import { REGLAS_AGENDA } from "./calendario.js";

const SITIO = () => NEGOCIO.sitio;

/* La paleta del sitio, en literales: en un correo no hay variables de CSS. */
const C = {
  fondo: "#08090b",
  tarjeta: "#0d0f12",
  borde: "#1e2328",
  hueco: "#06141a",
  texto: "#f7f8f8",
  dim: "#a6adb0",
  tenue: "#737d81",
  cian: "#22d3ee",
  cianClaro: "#67e8f9",
  cianTinte: "#0e2a31",
  cianBorde: "#164e5b",
};

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** El código va dentro de una URL: solo letras y números, nada más. */
function codigoLimpio(codigo) {
  return String(codigo ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
}

/**
 * Parte "jueves 27 de agosto 16:00" en fecha y hora para poder darle a la hora
 * el tamaño que merece. Si el formato cambiara algún día y no cuadrara, se
 * enseña la cadena entera: peor sería quedarse sin fecha por un adorno.
 */
function partirCuando(cuando) {
  const t = String(cuando ?? "").trim();
  const m = t.match(/^(.*?)[\s,]+(\d{1,2}:\d{2})$/);
  return m ? { fecha: m[1].trim(), hora: m[2] } : { fecha: t, hora: "" };
}

/** Los enlaces del pie, sin los separadores de lo que no está configurado. */
function enlacesDelPie() {
  const enlace = (url, etiqueta) =>
    `<a href="${url}" style="color:${C.dim};text-decoration:none;">${esc(etiqueta)}</a>`;
  const partes = [];
  if (NEGOCIO.correo) partes.push(enlace(`mailto:${NEGOCIO.correo}`, NEGOCIO.correo));
  if (NEGOCIO.enlaceWhatsapp) partes.push(enlace(NEGOCIO.enlaceWhatsapp, NEGOCIO.whatsappBot));
  if (NEGOCIO.sitio) partes.push(enlace(NEGOCIO.sitio, NEGOCIO.dominio));
  return partes.join(" &nbsp;·&nbsp;\n");
}

/** Un botón de verdad, en tabla, para que Outlook le respete el relleno. */
function boton(url, etiqueta, principal = true) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
<tr><td style="background:${principal ? C.cianTinte : C.tarjeta};border:1px solid ${principal ? C.cianBorde : C.borde};border-radius:10px;">
<a href="${url}" style="display:block;padding:12px 20px;font-family:${SANS};font-size:15px;color:${principal ? C.cianClaro : C.dim};text-decoration:none;white-space:nowrap;">${esc(etiqueta)}</a>
</td></tr></table>`;
}

/* ── Lo que cambia según el tipo de aviso ─────────────────────────────────── */

const TITULOS = () => ({
  nueva: `Tu ${NEGOCIO.evento} quedó agendada`,
  movida: `Tu ${NEGOCIO.evento} cambió de hora`,
  cancelada: `Tu ${NEGOCIO.evento} quedó cancelada`,
  reagendar: `Tuvimos que cancelar tu ${NEGOCIO.evento}`,
});

const ENTRADAS = {
  nueva: "Ya está reservada. Aquí tienes todo lo que necesitas.",
  movida: "Quedó movida a esta hora. La invitación adjunta reemplaza a la anterior.",
  cancelada: "El archivo adjunto la quita de tu calendario.",
  reagendar:
    "Fue un imprevisto de nuestra agenda y te pedimos disculpas: la hora era tuya y nos encantaría reponerla.",
};

/**
 * El correo entero.
 * @param {string} cambio  nueva | movida | cancelada | reagendar
 */
export function correoDeCita({ nombre = "", cuando = "", codigo = "", cambio = "nueva" } = {}) {
  const titulos = TITULOS();
  const tipo = titulos[cambio] ? cambio : "nueva";
  const cancelada = tipo === "cancelada" || tipo === "reagendar";
  const { fecha, hora } = partirCuando(cuando);
  const ref = codigoLimpio(codigo);
  const saludo = nombre ? `Hola ${esc(nombre)},` : "Hola,";

  /* El recuadro de la fecha. Cuando la cita ya no existe, va apagado y
     tachado: enseñar una hora cancelada con el mismo brillo que una viva es
     como para dudar de si sigue en pie. */
  const bloqueFecha = `<tr><td style="padding-top:22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.hueco};border:1px solid ${cancelada ? C.borde : C.cianBorde};border-radius:14px;">
<tr><td style="padding:20px 22px;">
<div style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.tenue};padding-bottom:8px;">${cancelada ? "Era el" : "Cuándo"}</div>
<div style="font-family:${SERIF};font-size:24px;line-height:1.2;color:${cancelada ? C.tenue : C.texto};${cancelada ? "text-decoration:line-through;" : ""}">${esc(fecha)}</div>
${hora ? `<div style="font-family:${SERIF};font-size:34px;line-height:1.1;color:${cancelada ? C.tenue : C.cian};padding-top:4px;${cancelada ? "text-decoration:line-through;" : ""}">${esc(hora)}</div>` : ""}
<div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${C.tenue};padding-top:10px;">Hora de Ecuador${cancelada ? "" : " · 30 minutos · sin costo y sin compromiso"}</div>
</td></tr></table>
</td></tr>`;

  /* Lo que se puede hacer desde aquí. */
  let acciones = "";

  if (tipo === "reagendar") {
    acciones = `<tr><td style="padding-top:24px;">
<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.dim};padding-bottom:14px;">¿La reponemos? Elige tu nueva hora en un minuto:</div>
${SITIO() ? boton(`${SITIO()}/chat?intencion=reagendar`, "Elegir otra hora") : ""}
</td></tr>`;
  } else if (tipo !== "cancelada") {
    // El enlace lleva la referencia dentro, así que la persona no tiene que
    // entender ni teclear nada: llega al chat y el agente ya sabe qué cita es.
    // Sin SITIO_URL no se arma ningún enlace: uno relativo dentro de un correo
    // no lleva a ninguna parte, y uno al sitio de otra empresa, peor.
    const url = !SITIO()
      ? ""
      : ref
        ? `${SITIO()}/chat?intencion=mover&cita=${encodeURIComponent(ref)}`
        : `${SITIO()}/chat`;
    acciones = `<tr><td style="padding-top:26px;border-top:1px solid ${C.borde};">
<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.dim};padding:20px 0 14px;">
Adjunto va el archivo para añadirla a tu calendario.<br />
${url ? `¿Necesitas moverla o cancelarla? ${esc(NEGOCIO.agente)} lo resuelve al momento.` : "¿Necesitas moverla o cancelarla? Responde a este correo y lo vemos."}
</div>
${url ? boton(url, "Mover o cancelar mi cita") : ""}
${ref ? `<div style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:${C.tenue};padding-top:14px;">Si prefieres escribirnos, dinos que es la cita <span style="font-family:${MONO};color:${C.dim};">${esc(ref)}</span> y la encontramos enseguida.</div>` : ""}
</td></tr>`;
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" />
<title>${esc(titulos[tipo])}</title></head>
<body style="margin:0;padding:0;background:${C.fondo};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo};padding:28px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

<tr><td style="padding-bottom:22px;">
<span style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.tenue};">${esc(NEGOCIO.nombre)}</span>
</td></tr>

<tr><td style="background:${C.tarjeta};border:1px solid ${C.borde};border-radius:16px;padding:28px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

<tr><td style="font-family:${SERIF};font-size:29px;line-height:1.15;color:${C.texto};padding-bottom:12px;">${esc(titulos[tipo])}</td></tr>
<tr><td style="font-family:${SANS};font-size:15.5px;line-height:1.55;color:${C.dim};">${saludo}<br />${esc(ENTRADAS[tipo])}</td></tr>

${bloqueFecha}
${acciones}

</table>
</td></tr>

<tr><td style="padding-top:22px;font-family:${SANS};font-size:12.5px;line-height:1.7;color:${C.tenue};">
También puedes responder a este correo.<br />
${enlacesDelPie()}
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * La versión en texto plano. No es un trámite: hay quien lee el correo en modo
 * texto, y varios filtros de spam castigan los mensajes que solo traen HTML.
 * Aquí el código SÍ va visible y explicado, porque sin botones es lo único que
 * tiene esa persona para identificar su cita.
 */
export function textoDeCita({ nombre = "", cuando = "", codigo = "", cambio = "nueva" } = {}) {
  const titulos = TITULOS();
  const tipo = titulos[cambio] ? cambio : "nueva";
  const ref = codigoLimpio(codigo);
  const l = [nombre ? `Hola ${nombre},` : "Hola,", ``, titulos[tipo].toUpperCase(), ``];

  if (tipo === "cancelada" || tipo === "reagendar") {
    l.push(`Era el ${cuando} (hora de Ecuador).`, ``, ENTRADAS[tipo]);
    if (tipo === "reagendar") {
      if (SITIO()) l.push(``, `Elige tu nueva hora aquí:`, `  ${SITIO()}/chat?intencion=reagendar`);
      else l.push(``, `Respóndenos este correo y coordinamos la nueva hora.`);
    }
  } else {
    l.push(
      `${cuando} (hora de Ecuador).`,
      `Dura ${REGLAS_AGENDA.duracionMinutos} minutos, sin costo y sin compromiso.`,
      ``,
      tipo === "movida"
        ? `La invitación adjunta reemplaza a la anterior.`
        : `Adjunto va el archivo para añadirla a tu calendario.`,
      ``,
      ...(SITIO()
        ? [
            `¿Necesitas moverla o cancelarla? Escríbele a ${NEGOCIO.agente} aquí y lo resuelve al momento:`,
            `  ${SITIO()}/chat${ref ? `?intencion=mover&cita=${encodeURIComponent(ref)}` : ""}`,
          ]
        : [`¿Necesitas moverla o cancelarla? Responde a este correo y lo vemos.`]),
    );
    if (ref) l.push(``, `Si prefieres escribirnos, dinos que es la cita ${ref}.`);
  }

  l.push(
    ``,
    NEGOCIO.whatsappBot
      ? `También puedes responder a este correo o escribirnos al WhatsApp ${NEGOCIO.whatsappBot}.`
      : `También puedes responder a este correo.`,
    ``,
    NEGOCIO.nombre,
    // El WhatsApp ya va en la línea de arriba: repetirlo aquí sobra.
    [NEGOCIO.correo, NEGOCIO.dominio].filter(Boolean).join(" · "),
  );
  return l.join("\n");
}
