/**
 * ENLACES FIRMADOS PARA LOS DOCUMENTOS.
 *
 * El PDF de una cotización lleva el nombre de la persona, su empresa y lo que
 * va a pagar. Si la dirección fuera adivinable, cualquiera podría recorrer los
 * identificadores y leer las cotizaciones de todos.
 *
 * Por eso cada enlace va firmado: el identificador del lead y una fecha de
 * caducidad se firman con una clave que solo vive en el servidor. Cambiar un
 * carácter de la dirección invalida la firma, y la firma no se puede fabricar
 * sin la clave. Es el mismo principio de los enlaces de descarga de un banco.
 *
 * La comparación de la firma es en tiempo constante, por lo mismo que en
 * lib/acceso.js: comparar con === delata cuántos caracteres se acertaron.
 */

import crypto from "node:crypto";
import { CLIENTE, NEGOCIO } from "./cliente.js";

/** Cuánto vive un enlace. Un mes: lo que dura el interés por una cotización. */
const DIAS_DE_VIDA = 30;

/**
 * La clave de firma. Se reutiliza CRON_SECRET para no pedir una variable más;
 * DOCUMENTOS_SECRET la reemplaza si algún día conviene separarlas.
 */
function clave() {
  const secreto = process.env.DOCUMENTOS_SECRET || process.env.CRON_SECRET || "";
  if (!secreto) throw new Error("Sin CRON_SECRET no se pueden firmar documentos");
  return secreto;
}

function firmar(id, hasta) {
  return crypto.createHmac("sha256", clave()).update(`${id}.${hasta}`).digest("hex").slice(0, 32);
}

/** La ruta relativa, ya firmada. */
export function rutaDeCotizacion(leadId, ahora = Date.now()) {
  const hasta = Math.floor((ahora + DIAS_DE_VIDA * 86_400_000) / 1000);
  return `/api/documento?id=${encodeURIComponent(leadId)}&hasta=${hasta}&f=${firmar(leadId, hasta)}`;
}

/**
 * La dirección completa, que es lo que necesita Meta para ir a buscar el PDF.
 *
 * Cada copia apunta a su propio dominio con SITIO_URL. Si una copia de otro
 * negocio la olvida no hay dominio que adivinar, así que se devuelve cadena
 * vacía: quien llama tiene que darse cuenta y no mandar nada. Antes esto se
 * armaba contra el sitio de Intellectum, donde ese lead ni existe.
 */
export function enlaceDeCotizacion(leadId, ahora = Date.now()) {
  if (!NEGOCIO.sitio) {
    console.warn(
      `[DOCUMENTO] la copia de "${CLIENTE}" no tiene SITIO_URL: ` +
        "no hay enlace que darle a Meta para que recoja el PDF.",
    );
    return "";
  }
  return NEGOCIO.sitio + rutaDeCotizacion(leadId, ahora);
}

/**
 * ¿Este enlace es legítimo y sigue vivo?
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
export function verificarEnlace({ id, hasta, f }, ahora = Date.now()) {
  if (!id || !hasta || !f) return { ok: false, motivo: "incompleto" };

  const vence = Number(hasta);
  if (!Number.isFinite(vence)) return { ok: false, motivo: "fecha_invalida" };
  if (vence * 1000 < ahora) return { ok: false, motivo: "vencido" };

  const esperada = firmar(id, hasta);
  const recibida = String(f);
  if (recibida.length !== esperada.length) return { ok: false, motivo: "firma" };
  if (!crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada))) {
    return { ok: false, motivo: "firma" };
  }
  return { ok: true };
}

/** El código corto que ve la persona en el papel. Del id, sin inventar nada. */
export function referenciaDe(leadId) {
  return String(leadId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** El nombre del archivo que le llega a la persona, con el negocio que la emite. */
export function nombreDeArchivo(referencia) {
  const negocio = NEGOCIO.nombreCorto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 24);
  return `Cotizacion${negocio ? `-${negocio}` : ""}${referencia ? `-${referencia}` : ""}.pdf`;
}
