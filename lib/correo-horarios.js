/**
 * EL CALENDARIO DENTRO DEL CORREO.
 *
 * Un correo NO puede llevar un calendario vivo: Gmail, Outlook y Apple Mail
 * borran todo el código por seguridad, así que nada dentro del mensaje puede
 * consultar la agenda ni reaccionar a un clic. Lo que sí llega intacto son
 * enlaces con estilo, y de ahí sale la solución honesta: el correo muestra
 * horas REALES —consultadas al momento de enviarlo— y cada una es un enlace a
 * /agenda con esa hora ya elegida. Un clic desde el correo y solo queda
 * confirmar.
 *
 * Si para cuando abren el correo esa hora ya se ocupó, la página lo dice y
 * ofrece las libres. Preferimos eso a no ofrecer horas: un botón que a veces
 * llega tarde convierte mucho más que un "escríbenos para coordinar".
 *
 * Por qué está escrito con tablas y estilos pegados a cada etiqueta, que en una
 * web sería inaceptable: los clientes de correo no soportan flexbox de forma
 * fiable y varios descartan el bloque <style> entero. Es la única forma de que
 * se vea igual en Gmail, en Outlook y en el iPhone.
 */

import { NEGOCIO } from "./cliente.js";
import { REGLAS_AGENDA } from "./calendario.js";

const SITIO = () => NEGOCIO.sitio;
const DURA = () => `Son ${REGLAS_AGENDA.duracionMinutos} minutos, sin costo y sin compromiso.`;

/* La paleta del sitio, en literales: en un correo no hay variables de CSS. */
const C = {
  fondo: "#08090b",
  tarjeta: "#0d0f12",
  borde: "#1e2328",
  texto: "#f7f8f8",
  dim: "#a6adb0",
  tenue: "#737d81",
  cian: "#22d3ee",
  cianClaro: "#67e8f9",
  cianTinte: "#0e2a31",
};

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Un botón-hora. Va como tabla para que Outlook le respete el relleno. */
function boton(horario) {
  const url = `${SITIO()}/agenda?h=${encodeURIComponent(horario.codigo)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 6px 8px 0;">
<tr><td style="background:${C.cianTinte};border:1px solid #164e5b;border-radius:10px;">
<a href="${url}" style="display:block;padding:11px 18px;font-family:${SANS};font-size:15px;color:${C.cianClaro};text-decoration:none;white-space:nowrap;">${esc(horario.hora)}</a>
</td></tr></table>`;
}

/** El bloque de días con sus horas, para insertar en cualquier correo. */
export function bloqueDeHorarios(horarios = []) {
  if (!horarios.length) return "";

  const porDia = [];
  for (const h of horarios) {
    let g = porDia.find((x) => x.dia === h.dia);
    if (!g) porDia.push((g = { dia: h.dia, horas: [] }));
    g.horas.push(h);
  }

  return porDia
    .map(
      (g) => `<tr><td style="padding:18px 0 0;">
<div style="font-family:${SANS};font-size:11px;letter-spacing:0.11em;text-transform:uppercase;color:${C.tenue};padding-bottom:9px;">${esc(g.dia)}</div>
${g.horas.map(boton).join("")}
</td></tr>`,
    )
    .join("");
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

/**
 * El correo entero: "elige tu hora", con el mismo aire que la página.
 * @param {object[]} horarios  lo que devuelve /api/agenda: {codigo, dia, hora}
 */
export function correoDeHorarios({ nombre = "", horarios = [], intro = "", motivo = "" }) {
  const saludo = nombre ? `Hola ${esc(nombre)},` : "Hola,";
  const texto =
    intro ||
    `Te dejamos las horas libres para tu ${NEGOCIO.cita}. Toca la que te sirva y queda agendada al instante.`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" />
<title>Elige tu hora</title></head>
<body style="margin:0;padding:0;background:${C.fondo};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo};padding:28px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

<tr><td style="padding-bottom:22px;">
<span style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.tenue};">${esc(NEGOCIO.nombre)}</span>
</td></tr>

<tr><td style="background:${C.tarjeta};border:1px solid ${C.borde};border-radius:16px;padding:28px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

<tr><td style="font-family:${SERIF};font-size:29px;line-height:1.15;color:${C.texto};padding-bottom:12px;">Elige tu hora</td></tr>
<tr><td style="font-family:${SANS};font-size:15.5px;line-height:1.55;color:${C.dim};">${saludo}<br />${esc(texto)}</td></tr>
${motivo ? `<tr><td style="font-family:${SANS};font-size:14px;line-height:1.5;color:${C.tenue};padding-top:10px;">${esc(motivo)}</td></tr>` : ""}

${bloqueDeHorarios(horarios)}

<tr><td style="padding-top:24px;">
<a href="${SITIO()}/agenda" style="font-family:${SANS};font-size:14px;color:${C.dim};text-decoration:underline;">Ver todas las horas disponibles</a>
</td></tr>

</table>
</td></tr>

<tr><td style="padding-top:22px;font-family:${SANS};font-size:12.5px;line-height:1.7;color:${C.tenue};">
${esc(DURA())}<br />
${enlacesDelPie()}
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * La versión en texto plano. No es un trámite: hay quien lee el correo en
 * modo texto, y algunos filtros de spam castigan los correos que solo traen
 * HTML. Los enlaces van completos para que se puedan copiar.
 */
export function textoDeHorarios({ nombre = "", horarios = [], intro = "" }) {
  const lineas = [
    nombre ? `Hola ${nombre},` : "Hola,",
    ``,
    intro || `Estas son las horas libres para tu ${NEGOCIO.cita}:`,
    ``,
  ];
  for (const h of horarios) {
    lineas.push(`  ${h.etiqueta || `${h.dia} ${h.hora}`}`);
    lineas.push(`    ${SITIO()}/agenda?h=${encodeURIComponent(h.codigo)}`);
  }
  lineas.push(``, `Todas las horas: ${SITIO()}/agenda`, ``);
  lineas.push(DURA());
  lineas.push([NEGOCIO.nombre, NEGOCIO.correo, NEGOCIO.whatsappBot].filter(Boolean).join(" · "));
  return lineas.join("\n");
}
