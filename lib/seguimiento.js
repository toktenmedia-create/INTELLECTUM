/**
 * A QUIÉN SE LE INSISTE, Y CUÁNDO.
 *
 * Meta aprobó la plantilla "seguimiento_cotizacion" y la clasificó MARKETING,
 * así que cada mensaje que sale de aquí CUESTA (no es una respuesta dentro de
 * la ventana de 24 horas, es el negocio escribiendo primero). Eso cambia el
 * criterio: no se trata de alcanzar a todo el mundo, sino de escribirle solo a
 * quien de verdad quedó a medias.
 *
 * Las reglas, y el porqué de cada una:
 *
 *   · Solo WhatsApp. La plantilla dice "por este chat"; a un lead que llegó por
 *     la web se le escribe por correo, no por aquí.
 *   · Solo quien pidió precio. El texto dice "quedó pendiente la cotización":
 *     mandárselo a quien nunca cotizó es mentir en el primer renglón.
 *   · Silencio de verdad. Se miden los días desde el ÚLTIMO mensaje de la
 *     conversación, no desde que se creó el lead. Si la persona escribió ayer,
 *     "quedó pendiente" es falso y además molesta.
 *   · Ni muy pronto ni muy tarde. Antes de tres días es acoso; después de un
 *     mes, nadie se acuerda de haber pedido nada y el mensaje da mala espina.
 *   · Una sola vez. Quien ignoró el primero no va a contestar el segundo, y el
 *     segundo cuesta lo mismo que el primero.
 *   · Nunca a quien pidió salir. Es un derecho, no una preferencia.
 *   · Nunca en fin de semana. Un mensaje comercial el sábado no vende: estorba.
 *
 * Todo esto es una función pura a propósito: recibe listas y devuelve a quién
 * escribirle. Así se puede probar cada regla sin base de datos y sin gastar un
 * centavo en mensajes de prueba.
 */

/** Días de silencio antes de insistir. */
export const DIAS_DE_SILENCIO = 3;

/** Pasado este plazo ya no es seguimiento, es resucitar un muerto. */
export const DIAS_MAXIMO = 30;

/** Freno de mano: por muy roto que esté algo, no salen más de esto por tanda. */
export const TOPE_POR_TANDA = 25;

/**
 * El prefijo con el que la herramienta cotizar deja escrito qué se cotizó.
 * Vive aquí y no allá porque quien lo LEE es el seguimiento: si alguien cambia
 * el texto, tiene que ver en el mismo archivo que hay alguien leyéndolo.
 */
export const RESUMEN_COTIZACION = "Cotizó por chat: ";

/**
 * Qué se le cotizó a esta persona, para el hueco {{2}} de la plantilla.
 * Si el resumen no tiene la forma esperada se devuelve una frase honesta en vez
 * de inventar un nombre de plan: el mensaje sigue teniendo sentido.
 */
export function conceptoCotizado(lead) {
  const resumen = String(lead?.resumen ?? "");
  if (!resumen.startsWith(RESUMEN_COTIZACION)) return "el servicio que consultaste";
  const concepto = resumen.slice(RESUMEN_COTIZACION.length).split(".")[0].trim();
  return concepto || "el servicio que consultaste";
}

/**
 * Meta rechaza los parámetros de plantilla con saltos de línea, tabulaciones o
 * espacios seguidos. Un nombre raro no puede tumbar el envío.
 */
export function limpiarParametro(texto, respaldo) {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return limpio || respaldo;
}

/** ¿Es sábado o domingo en Ecuador? (UTC-5 todo el año, sin librerías) */
export function esFinDeSemana(ahora) {
  const enEcuador = new Date(ahora.getTime() - 5 * 3_600_000);
  const dia = enEcuador.getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * Decide a quién escribirle hoy.
 *
 * Devuelve también los descartes contados por motivo: sin eso, un día que no
 * salga ningún mensaje es indistinguible de un día en que algo se rompió.
 *
 * @param {object[]} leads          los leads del cliente
 * @param {object[]} conversaciones para saber cuándo habló cada quien por última vez
 * @param {Set<string>} bajas       sesiones que pidieron SALIR
 * @param {Set<string>} yaSeguidos  ids de lead a los que ya se les escribió
 * @param {Date} ahora
 */
export function elegirParaSeguimiento({
  leads = [],
  conversaciones = [],
  bajas = new Set(),
  yaSeguidos = new Set(),
  ahora = new Date(),
} = {}) {
  const descartes = {
    no_es_whatsapp: 0,
    sin_cotizacion: 0,
    ya_atendido: 0,
    dio_de_baja: 0,
    ya_se_le_escribio: 0,
    todavia_es_pronto: 0,
    demasiado_viejo: 0,
    sin_numero: 0,
  };

  if (esFinDeSemana(ahora)) {
    return { elegidos: [], descartes, motivo_general: "fin_de_semana" };
  }

  // Cuándo habló cada conversación por última vez.
  const ultimaSeñal = new Map();
  for (const c of conversaciones) {
    const fecha = c.actualizado_en ?? c.creado_en;
    if (c.sesion && fecha) ultimaSeñal.set(`${c.canal}|${c.sesion}`, fecha);
  }

  const elegidos = [];

  for (const lead of leads) {
    if (lead.canal !== "whatsapp") { descartes.no_es_whatsapp++; continue; }
    if (!(Number(lead.valor_estimado) > 0)) { descartes.sin_cotizacion++; continue; }
    if ((lead.estado ?? "nuevo") !== "nuevo") { descartes.ya_atendido++; continue; }
    if (!lead.sesion) { descartes.sin_numero++; continue; }
    if (bajas.has(lead.sesion)) { descartes.dio_de_baja++; continue; }
    if (yaSeguidos.has(lead.id)) { descartes.ya_se_le_escribio++; continue; }

    // El reloj corre desde el último mensaje de la conversación; si no hay
    // conversación guardada, desde que nació el lead.
    const referencia = ultimaSeñal.get(`whatsapp|${lead.sesion}`) ?? lead.creado_en;
    const dias = (ahora.getTime() - new Date(referencia).getTime()) / 86_400_000;
    if (!Number.isFinite(dias)) { descartes.todavia_es_pronto++; continue; }
    if (dias < DIAS_DE_SILENCIO) { descartes.todavia_es_pronto++; continue; }
    if (dias > DIAS_MAXIMO) { descartes.demasiado_viejo++; continue; }

    elegidos.push({
      lead_id: lead.id,
      numero: lead.sesion,
      nombre: limpiarParametro(lead.nombre, "buen día"),
      concepto: limpiarParametro(conceptoCotizado(lead), "el servicio que consultaste"),
      dias_de_silencio: Math.floor(dias),
    });
  }

  // Primero los que llevan más tiempo esperando: si el tope corta, que corte
  // por los más frescos, que todavía tienen días por delante.
  elegidos.sort((a, b) => b.dias_de_silencio - a.dias_de_silencio);

  const recortados = elegidos.length > TOPE_POR_TANDA;
  return {
    elegidos: elegidos.slice(0, TOPE_POR_TANDA),
    descartes,
    recortados,
    motivo_general: null,
  };
}
