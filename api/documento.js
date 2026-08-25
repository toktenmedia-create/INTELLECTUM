/**
 * GET /api/documento?id=…&hasta=…&f=…  →  el PDF de una cotización.
 *
 * Sirve el papel que IntelliA le manda a quien pidió precio. La dirección va
 * firmada (ver lib/documento.js): sin la firma correcta esto responde 404, no
 * 403 — a quien anda probando direcciones no se le confirma que exista algo.
 *
 * El PDF se arma en el momento a partir de lo que quedó guardado cuando se
 * cotizó. No se guarda ningún archivo en ninguna parte: no hay nada que se
 * pueda filtrar por estar tirado en un disco, y el reloj de retención que
 * borra la bitácora se lleva también la posibilidad de regenerarlo.
 *
 * Quien lo pide de verdad es Meta: cuando IntelliA manda el documento por
 * WhatsApp, le pasa esta dirección y son los servidores de Meta los que vienen
 * a buscarla. Por eso tiene que ser pública y por eso tiene que ir firmada.
 */

import { abrirAlmacen } from "../lib/almacen.js";
import { construirCotizacionPDF } from "../lib/cotizacion-pdf.js";
import { verificarEnlace, referenciaDe, nombreDeArchivo } from "../lib/documento.js";

export default async function handler(req, res) {
  const url = new URL(req.url ?? "/", "http://interno");
  const id = url.searchParams.get("id");
  const parametros = {
    id,
    hasta: url.searchParams.get("hasta"),
    f: url.searchParams.get("f"),
  };

  let firma;
  try {
    firma = verificarEnlace(parametros);
  } catch (err) {
    console.error("[DOCUMENTO] no se pudo verificar:", err?.message ?? err);
    return noHayNada(res);
  }
  if (!firma.ok) {
    // El motivo se anota, no se responde: al de afuera se le dice lo mismo
    // siempre, exista o no el documento.
    console.log(`[DOCUMENTO] enlace rechazado (${firma.motivo}).`);
    return noHayNada(res);
  }

  const almacen = abrirAlmacen();
  let lead = null;
  let cotizacion = null;
  try {
    [lead, cotizacion] = await Promise.all([
      almacen.leadPorId({ id }),
      almacen.cotizacionDeLead({ lead_id: id }),
    ]);
  } catch (err) {
    console.error("[DOCUMENTO] la base no contestó:", err?.message ?? err);
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("No disponible por ahora. Inténtalo en un momento.");
  }

  if (!lead || !cotizacion) {
    console.log("[DOCUMENTO] firma válida pero sin cotización guardada:", String(id).slice(0, 8));
    return noHayNada(res);
  }

  const referencia = referenciaDe(id);
  let pdf;
  try {
    pdf = await construirCotizacionPDF({
      cotizacion,
      persona: { nombre: lead.nombre, empresa: lead.empresa, necesidad: lead.necesidad },
      fecha: new Date(lead.creado_en ?? Date.now()),
      referencia,
    });
  } catch (err) {
    console.error("[DOCUMENTO] no se pudo armar el PDF:", err?.message ?? err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("No se pudo generar el documento.");
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  // "inline": WhatsApp y el navegador lo muestran en vez de forzar la descarga.
  res.setHeader("Content-Disposition", `inline; filename="${nombreDeArchivo(referencia)}"`);
  res.setHeader("Content-Length", String(pdf.length));
  // Privado y sin caché de intermediarios: lleva datos de una persona.
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return res.end(Buffer.from(pdf));
}

/** La misma respuesta para todo lo que no se sirve: no confirmar nada. */
function noHayNada(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.end("No encontrado");
}
