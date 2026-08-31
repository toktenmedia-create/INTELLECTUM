/**
 * LA COTIZACIÓN EN PAPEL.
 *
 * Genera el PDF de una sola página que IntelliA le manda a quien pidió precio.
 * No es un adorno: es el documento que la persona reenvía a su socio o le
 * imprime a su jefe, así que tiene que aguantar salir del chat y seguir
 * significando algo por su cuenta.
 *
 * Tres decisiones de diseño y su porqué:
 *
 *   · Banda oscura arriba, cuerpo claro. La marca es oscura y el logo es
 *     plateado —sobre blanco no se vería—, pero una hoja entera en negro se
 *     lee mal impresa y se come el tóner de quien la imprima. La banda le da
 *     la cara de Intellectum; el cuerpo lo hace un documento de trabajo.
 *   · El cian de la web (#22d3ee) está pensado para fondo negro; sobre blanco
 *     tiene poco contraste. Para las cifras se usa el cian profundo de la
 *     misma paleta (#0891b2), que ya existe en el sitio.
 *   · Una sola cosa manda en la página: el precio. Todo lo demás está para
 *     sostenerlo. Por eso hay tanto aire: una cotización apretada de letra
 *     chica parece una trampa.
 *
 * Las cifras NO se recalculan aquí. Llegan del evento cotizacion_entregada,
 * que guardó lo que se le dijo a la persona en el chat. Si se recalcularan, un
 * cambio de tarifas haría que el papel dijera algo distinto de lo prometido.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import { NEGOCIO, esIntellectum } from "./cliente.js";
import fontkit from "@pdf-lib/fontkit";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// La paleta del sitio, con la salvedad del cian: sobre blanco va el profundo.
const TINTA = {
  fondoOscuro: hex("#08090b"),
  cian: hex("#22d3ee"),
  cianProfundo: hex("#0891b2"),
  texto: hex("#111417"),
  textoSuave: hex("#5b6467"),
  textoTenue: hex("#8b9497"),
  claroSobreOscuro: hex("#f7f8f8"),
  tenueSobreOscuro: hex("#8b9497"),
  linea: hex("#e4e7e9"),
  tinteCian: hex("#eefbfd"),
};

function hex(codigo) {
  const n = parseInt(codigo.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const HOJA = { ancho: 612, alto: 792 };
const MARGEN = 52;
const ANCHO_UTIL = HOJA.ancho - MARGEN * 2;

/**
 * Los datos de la empresa que emite ESTE papel. Salen de la copia, no de una
 * constante: una cotización con el RUC de otra empresa no es un desliz de
 * marca, es un documento equivocado, y quien lo recibe lo guarda.
 */
const EMPRESA = () => ({
  nombre: NEGOCIO.razonSocial,
  ruc: NEGOCIO.ruc,
  ciudad: NEGOCIO.ciudad,
  correo: NEGOCIO.correo,
  whatsapp: NEGOCIO.whatsappBot,
  web: NEGOCIO.dominio,
});

/**
 * @param {object} cotizacion  lo guardado en el evento cotizacion_entregada
 * @param {object} persona     { nombre, empresa, necesidad }
 * @param {Date}   fecha
 * @param {string} referencia  código corto para que el equipo la ubique
 * @returns {Promise<Uint8Array>}
 */
export async function construirCotizacionPDF({ cotizacion, persona = {}, fecha = new Date(), referencia = "" }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [display, cuerpo, fuerte] = await Promise.all([
    doc.embedFont(leerFuente("Fraunces-SemiBold.ttf"), { subset: true }),
    doc.embedFont(leerFuente("Geist-Regular.ttf"), { subset: true }),
    doc.embedFont(leerFuente("Geist-SemiBold.ttf"), { subset: true }),
  ]);
  const empresa = EMPRESA();
  const logo = await cargarLogo(doc);

  doc.setTitle(`Cotización ${NEGOCIO.nombreCorto}${referencia ? ` ${referencia}` : ""}`);
  doc.setAuthor(empresa.nombre);
  if (empresa.web) doc.setCreator(empresa.web);
  doc.setSubject(cotizacion?.concepto ?? "Cotización referencial");

  const hoja = doc.addPage([HOJA.ancho, HOJA.alto]);
  const escribir = (texto, x, y, { fuente = cuerpo, tam = 10, color = TINTA.texto, espaciado = 0 } = {}) =>
    hoja.drawText(String(texto ?? ""), { x, y, size: tam, font: fuente, color, characterSpacing: espaciado });

  // ── Banda superior: la cara de la marca ───────────────────────────────────
  const BANDA = 126;
  hoja.drawRectangle({ x: 0, y: HOJA.alto - BANDA, width: HOJA.ancho, height: BANDA, color: TINTA.fondoOscuro });
  // Un filo de cian abajo de la banda: el mismo gesto del sitio.
  hoja.drawRectangle({ x: 0, y: HOJA.alto - BANDA, width: HOJA.ancho, height: 2, color: TINTA.cian });

  const altoLogo = 66;
  if (logo) {
    hoja.drawImage(logo, {
      x: MARGEN,
      y: HOJA.alto - BANDA + (BANDA - altoLogo) / 2,
      height: altoLogo,
      width: (altoLogo * logo.width) / logo.height,
    });
  } else {
    // Sin logo propio se escribe el nombre. Poner el de Intellectum en la
    // cotización de otro negocio sería peor que no poner ninguno.
    escribir(empresa.nombre, MARGEN, HOJA.alto - BANDA + BANDA / 2 - 6, {
      fuente: display, tam: 20, color: TINTA.claroSobreOscuro,
    });
  }

  const rotulo = "COTIZACIÓN REFERENCIAL";
  const anchoRotulo = fuerte.widthOfTextAtSize(rotulo, 9) + rotulo.length * 1.4;
  escribir(rotulo, HOJA.ancho - MARGEN - anchoRotulo, HOJA.alto - 62, {
    fuente: fuerte, tam: 9, color: TINTA.cian, espaciado: 1.4,
  });
  const fechaTexto = fechaLarga(fecha);
  escribir(fechaTexto, HOJA.ancho - MARGEN - cuerpo.widthOfTextAtSize(fechaTexto, 9), HOJA.alto - 80, {
    tam: 9, color: TINTA.tenueSobreOscuro,
  });
  if (referencia) {
    const ref = `Referencia ${referencia}`;
    escribir(ref, HOJA.ancho - MARGEN - cuerpo.widthOfTextAtSize(ref, 9), HOJA.alto - 95, {
      tam: 9, color: TINTA.tenueSobreOscuro,
    });
  }

  // ── El cierre y las condiciones ───────────────────────────────────────────
  // Esta mitad se ancla DESDE ABAJO: el pie, encima el recuadro de cierre y
  // encima las condiciones creciendo hacia arriba. Maquetar hacia abajo hacía
  // que un texto largo escribiera las condiciones DETRÁS del recuadro, y una
  // condición que no se lee es una condición que no existe.
  const ALTO_CTA = 56;
  const Y_CTA = 100;
  hoja.drawRectangle({
    x: MARGEN, y: Y_CTA, width: ANCHO_UTIL, height: ALTO_CTA,
    color: TINTA.tinteCian, borderColor: TINTA.cianProfundo, borderWidth: 0.8,
  });
  escribir(`El número exacto sale de la ${NEGOCIO.cita}.`, MARGEN + 20, Y_CTA + ALTO_CTA - 23, {
    fuente: fuerte, tam: 10.5, color: TINTA.texto,
  });
  const comoAgendar = empresa.web
    ? `Agenda el tuyo en ${empresa.web}/chat o responde este mensaje.`
    : "Responde este mensaje y lo agendamos.";
  escribir(comoAgendar, MARGEN + 20, Y_CTA + 17, {
    tam: 10, color: TINTA.textoSuave,
  });

  const lineasCondiciones = condicionesDe(cotizacion).flatMap((linea) => partir(linea, cuerpo, 9, ANCHO_UTIL));
  const techoCondiciones = Y_CTA + ALTO_CTA + 18 + (lineasCondiciones.length - 1) * 13;
  let yCond = techoCondiciones;
  for (const trozo of lineasCondiciones) {
    escribir(trozo, MARGEN, yCond, { tam: 9, color: TINTA.textoSuave });
    yCond -= 13;
  }
  hoja.drawRectangle({ x: MARGEN, y: techoCondiciones + 22, width: ANCHO_UTIL, height: 1, color: TINTA.linea });

  // El suelo del contenido que fluye: por debajo de aquí empiezan las
  // condiciones, y nada puede invadirlas.
  const PISO = techoCondiciones + 22;

  let y = HOJA.alto - BANDA - 40;

  // ── Para quién ────────────────────────────────────────────────────────────
  escribir("PREPARADA PARA", MARGEN, y, { fuente: fuerte, tam: 8, color: TINTA.textoTenue, espaciado: 1.2 });
  y -= 22;
  escribir(persona.nombre || "Quien consultó por el chat", MARGEN, y, { fuente: display, tam: 19 });
  if (persona.empresa) {
    y -= 16;
    escribir(persona.empresa, MARGEN, y, { tam: 10.5, color: TINTA.textoSuave });
  }

  y -= 26;
  hoja.drawRectangle({ x: MARGEN, y, width: ANCHO_UTIL, height: 1, color: TINTA.linea });
  y -= 30;

  // ── Qué se cotizó ─────────────────────────────────────────────────────────
  escribir("SOLUCIÓN", MARGEN, y, { fuente: fuerte, tam: 8, color: TINTA.textoTenue, espaciado: 1.2 });
  y -= 26;
  for (const linea of partir(cotizacion.concepto ?? "Solución a medida", display, 21, ANCHO_UTIL)) {
    escribir(linea, MARGEN, y, { fuente: display, tam: 21 });
    y -= 26;
  }

  if (persona.necesidad) {
    y -= 4;
    // Dos líneas como techo: es el contexto, no el contenido de la hoja.
    for (const linea of partir(persona.necesidad, cuerpo, 10.5, ANCHO_UTIL).slice(0, 2)) {
      escribir(linea, MARGEN, y, { tam: 10.5, color: TINTA.textoSuave });
      y -= 15;
    }
  }

  // ── El precio: lo único que de verdad manda en la hoja ────────────────────
  y -= 20;
  const hayMensualidad = Number(cotizacion.mensualidad) > 0;
  const anchoCaja = hayMensualidad ? (ANCHO_UTIL - 16) / 2 : ANCHO_UTIL;
  const ALTO_CAJA = 82;
  y -= ALTO_CAJA;

  caja(hoja, MARGEN, y, anchoCaja, ALTO_CAJA);
  escribir("IMPLEMENTACIÓN", MARGEN + 20, y + ALTO_CAJA - 26, {
    fuente: fuerte, tam: 8, color: TINTA.textoTenue, espaciado: 1.2,
  });
  escribir(rangoCorto(cotizacion.implementacion), MARGEN + 20, y + ALTO_CAJA - 56, {
    fuente: display, tam: 23, color: TINTA.cianProfundo,
  });
  escribir("pago único", MARGEN + 20, y + 17, { tam: 9, color: TINTA.textoSuave });

  if (hayMensualidad) {
    const x2 = MARGEN + anchoCaja + 16;
    caja(hoja, x2, y, anchoCaja, ALTO_CAJA);
    escribir("SERVICIO MENSUAL", x2 + 20, y + ALTO_CAJA - 26, {
      fuente: fuerte, tam: 8, color: TINTA.textoTenue, espaciado: 1.2,
    });
    escribir(`$${miles(cotizacion.mensualidad)}`, x2 + 20, y + ALTO_CAJA - 56, {
      fuente: display, tam: 23, color: TINTA.cianProfundo,
    });
    escribir("cada mes", x2 + 20, y + 17, { tam: 9, color: TINTA.textoSuave });
  }

  // ── Qué incluye ───────────────────────────────────────────────────────────
  y -= 26;
  escribir("INCLUYE", MARGEN, y, { fuente: fuerte, tam: 8, color: TINTA.textoTenue, espaciado: 1.2 });
  y -= 20;
  for (const punto of puntosDeIncluye(cotizacion)) {
    // Si el caso trae tantas líneas que ya no caben, se cortan las viñetas y
    // no las condiciones: lo que incluye se puede preguntar, lo que se cobra no.
    if (y < PISO) break;
    hoja.drawCircle({ x: MARGEN + 3, y: y + 3.5, size: 2, color: TINTA.cianProfundo });
    escribir(punto, MARGEN + 14, y, { tam: 10.5, color: TINTA.texto });
    y -= 16;
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  const PIE = 64;
  hoja.drawRectangle({ x: 0, y: 0, width: HOJA.ancho, height: PIE, color: TINTA.fondoOscuro });
  const contacto = [empresa.correo, empresa.whatsapp, empresa.web].filter(Boolean).join("   ·   ");
  escribir(contacto, MARGEN, PIE - 26, { fuente: fuerte, tam: 9.5, color: TINTA.claroSobreOscuro });
  escribir([empresa.nombre, empresa.ruc, empresa.ciudad].filter(Boolean).join("   ·   "), MARGEN, PIE - 44, {
    tam: 8.5, color: TINTA.tenueSobreOscuro,
  });

  return await doc.save();
}

/** Las condiciones que aplican a ESTA cotización, no todas las que existen. */
function condicionesDe(cotizacion) {
  const hayMensualidad = Number(cotizacion.mensualidad) > 0;
  return [
    "Los valores son referenciales y NO incluyen IVA; al facturar se suma el 15% vigente en Ecuador.",
    hayMensualidad
      ? "La implementación se paga 60% al inicio y 40% al terminar. El servicio mensual se factura mes a mes."
      : "El proyecto se paga 60% al inicio y 40% al entregar.",
    "Esta cotización no compromete a ninguna de las dos partes: el alcance definitivo se acuerda por escrito.",
  ];
}

/**
 * Las líneas del "incluye", armadas solo con lo que ESTA cotización tiene.
 *
 * Una hoja que promete lo que no aplica —"4 horas mensuales" en un proyecto de
 * pago único, por ejemplo— es peor que una hoja corta: crea una expectativa
 * que alguien va a reclamar después con razón.
 *
 * Sin mensualidad = proyecto web suelto: es la única rama de calcularCotizacion
 * que devuelve mensualidad 0, y esas webs nacen con el agente adentro.
 */
function puntosDeIncluye(c) {
  const hayMensualidad = Number(c.mensualidad) > 0;
  const puntos = [];

  if (Number(c.conversaciones_incluidas) > 0) {
    puntos.push(`Hasta ${miles(c.conversaciones_incluidas)} conversaciones al mes`);
    if (Number(c.excedente_por_100) > 0) {
      puntos.push(`Conversaciones adicionales: $${miles(c.excedente_por_100)} por cada 100`);
    }
  }
  if (Number(c.minutos_incluidos) > 0) {
    puntos.push(`${miles(c.minutos_incluidos)} minutos de voz al mes`);
  }
  if (Number(c.integraciones) > 0) {
    puntos.push(
      c.integraciones === 1
        ? "Conexión con 1 sistema externo"
        : `Conexión con ${c.integraciones} sistemas externos`,
    );
  }
  if (!hayMensualidad) {
    puntos.push("El Asistente de Recepción integrado, con su primer mes de servicio");
  }
  puntos.push("Puesta en marcha, pruebas y acompañamiento del equipo en Quito");
  if (hayMensualidad) {
    puntos.push("4 horas mensuales de ajustes y cambios");
  }
  return puntos;
}

function caja(hoja, x, y, ancho, alto) {
  hoja.drawRectangle({ x, y, width: ancho, height: alto, color: hex("#fbfcfc"), borderColor: TINTA.linea, borderWidth: 1 });
  hoja.drawRectangle({ x, y, width: 3, height: alto, color: TINTA.cianProfundo });
}

function leerFuente(nombre) {
  return fs.readFileSync(path.join(RAIZ, "lib", "fuentes", nombre));
}

/** "$1.400 – $2.200", o una sola cifra si el rango no lo es. */
function rangoCorto(rango) {
  if (!Array.isArray(rango) || rango.length !== 2) return "A convenir";
  const [desde, hasta] = rango;
  return desde === hasta ? `$${miles(desde)}` : `$${miles(desde)} – $${miles(hasta)}`;
}

function miles(n) {
  return Math.round(Number(n) || 0).toLocaleString("es-EC");
}

function fechaLarga(fecha) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Guayaquil",
  }).format(fecha);
}

/** Parte un texto en líneas que quepan en el ancho dado. */
function partir(texto, fuente, tam, ancho) {
  const palabras = String(texto ?? "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

/**
 * El logo que va en la banda.
 *
 * El archivo logo.png del repositorio es el de Intellectum, así que solo se usa
 * en la copia de Intellectum. Otra copia pone el suyo con NEGOCIO_LOGO_URL —un
 * PNG accesible por HTTPS— y si no lo tiene, la banda lleva su nombre escrito.
 * Cualquier tropiezo bajando ese PNG termina también en el nombre: una
 * cotización sin logo se entrega, una cotización que no se genera no.
 */
async function cargarLogo(doc) {
  const url = (process.env.NEGOCIO_LOGO_URL ?? "").trim();
  try {
    if (url) {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!respuesta.ok) throw new Error(`respondió ${respuesta.status}`);
      return await doc.embedPng(new Uint8Array(await respuesta.arrayBuffer()));
    }
    if (esIntellectum()) {
      return await doc.embedPng(fs.readFileSync(path.join(RAIZ, "logo.png")));
    }
  } catch (err) {
    console.warn("[COTIZACION] no se pudo poner el logo:", err?.message ?? err);
  }
  return null;
}
