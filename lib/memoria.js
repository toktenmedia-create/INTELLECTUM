/**
 * LA MEMORIA DE LA RELACIÓN — quién es esta persona, más allá de esta charla.
 *
 * El hilo de conversación se cierra solo tras un mes de silencio, y está bien:
 * retomar a media frase una charla de hace seis semanas confunde más de lo que
 * ayuda (ver conversacionVigente en almacen.js). Pero al cerrarse el hilo se
 * perdía también todo lo demás: quién era, a qué se dedica, qué se le cotizó.
 * La persona volvía y el agente la trataba como a un desconocido, le preguntaba
 * otra vez lo mismo y le hacía repetir su caso. Eso no lo hace ni un vendedor
 * distraído: la ficha del cliente existe justamente para no depender de la
 * memoria de nadie.
 *
 * Aquí se separan las dos cosas. El HILO caduca; la RELACIÓN no. Lo que se
 * rescata es lo que un buen vendedor tendría anotado antes de contestar: cómo
 * se llama, qué buscaba, qué precio se le dio y cuánto tiempo pasó.
 *
 * Solo mira lo que la propia persona dejó en esta misma línea (su número de
 * WhatsApp, su sesión del sitio). No cruza datos entre canales ni arma perfiles:
 * es la ficha de un cliente, no un expediente.
 */

/** Pasado este tiempo, el dato es historia y no ayuda a atender mejor. */
const DIAS_QUE_IMPORTAN = 180;

/**
 * ¿Qué sabemos ya de quien está escribiendo?
 *
 * @returns {Promise<string|null>} un resumen corto para el prompt, o null si es
 *          alguien nuevo (que es el caso normal y no vale la pena consultar).
 */
export async function recordarPersona(almacen, { cliente, canal, sesion } = {}) {
  if (!sesion || typeof almacen?.leadDeSesion !== "function") return null;

  let lead = null;
  try {
    lead = await almacen.leadDeSesion({ cliente, canal, sesion });
  } catch (err) {
    // Que el agente no sepa quién es alguien es un problema menor; que no
    // conteste por un fallo de base de datos es un problema grande.
    console.error("[MEMORIA] no se pudo recordar a la persona:", err?.message ?? err);
    return null;
  }
  if (!lead) return null;

  const dias = diasDesde(lead.creado_en);
  if (dias === null || dias > DIAS_QUE_IMPORTAN) return null;

  const datos = [
    campo("Nombre", lead.nombre),
    campo("Empresa", lead.empresa),
    campo("Sector", lead.sector),
    campo("Lo que buscaba", lead.necesidad),
    campo("Lo que se le dijo", lead.nota || lead.resumen),
    campo("Cuándo", hace(dias)),
  ].filter(Boolean);

  if (datos.length === 0) return null;

  return [
    "Esta persona YA HABLÓ con nosotros antes. Esto es lo que quedó anotado:",
    ...datos,
    "",
    "Úsalo como lo usaría un vendedor que revisó su ficha antes de contestar:",
    "salúdala por su nombre y da por sabido lo que ya te contó, en vez de",
    "volver a preguntárselo. NO se lo recites, no le digas cuánto tiempo pasó",
    "ni menciones que tienes anotaciones suyas. Si lo que quiere hoy es otra",
    "cosa, síguela a ella y olvida esto. Y si te pide precio otra vez, vuelve",
    "a llamar a la herramienta cotizar: las cifras de arriba son referencia",
    "para ti, no para decirlas de memoria.",
  ].join("\n");
}

function campo(etiqueta, valor) {
  const limpio = String(valor ?? "").trim();
  return limpio ? `- ${etiqueta}: ${limpio.slice(0, 300)}` : null;
}

function diasDesde(fecha) {
  const cuando = new Date(fecha ?? "").getTime();
  if (!Number.isFinite(cuando)) return null;
  return Math.max(0, Math.floor((Date.now() - cuando) / 86_400_000));
}

/** Solo para el prompt: al agente le sirve saber si fue ayer o hace meses. */
function hace(dias) {
  if (dias === 0) return "hoy mismo";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return "hace una semana";
  if (dias < 31) return `hace ${Math.round(dias / 7)} semanas`;
  if (dias < 60) return "hace un mes";
  return `hace ${Math.round(dias / 30)} meses`;
}
