/**
 * LA MATRIZ DE PRECIOS — la única fuente de cifras de todo el sistema.
 *
 * El asistente tiene PROHIBIDO decir números de memoria: cualquier cifra que
 * dé un rango sale de aquí, calculada por la herramienta cotizar.
 *
 * Cada plan se vende como un puesto de trabajo, no como un software: por eso
 * los nombres son cargos. Formato: implementacion es [desde, hasta] en USD,
 * pago único. La mensualidad es fija por plan e incluye un tope de
 * conversaciones; el excedente se cobra por cada 100. Los proyectos web son
 * pago único, sin mensualidad propia. Todo valor es SIN IVA (la ficha manda
 * sumar el 15% vigente al facturar).
 *
 * Lista aprobada por Paul el 25 de agosto de 2026. Vigencia: 1 de octubre de
 * 2026, la fecha en que Meta empieza a cobrar cada mensaje que el agente
 * entrega — de ahí que bajen los topes y suba el excedente.
 */

export const PRECIOS = {
  planes: {
    asistente: {
      nombre: "Asistente de Recepción",
      implementacion: [290, 490],
      mensualidad: 79,
      conversaciones_incluidas: 100,
    },
    recepcionista: {
      nombre: "Recepcionista Digital",
      implementacion: [690, 1200],
      mensualidad: 149,
      conversaciones_incluidas: 300,
    },
    asesor: {
      nombre: "Asesor Comercial",
      implementacion: [1400, 2200],
      mensualidad: 299,
      conversaciones_incluidas: 700,
    },
    jefe_ventas: {
      nombre: "Jefe de Ventas",
      implementacion: [2400, 3800],
      mensualidad: 599,
      conversaciones_incluidas: 1400,
    },
  },

  // La voz nunca se vende sola: se monta sobre el Asesor Comercial o superior,
  // porque sin cotizador ni seguimiento el agente de voz no tiene dónde dejar
  // el trabajo que levanta en la llamada.
  modulo_voz: {
    nombre: "Módulo de voz",
    implementacion: [1500, 2500],
    mensualidad: 1000,
    minutos_incluidos: 700,
  },

  // Proyectos de pago único. Toda web nace con el Asistente de Recepción
  // adentro (primer mes incluido): es el diferenciador, no un extra.
  proyectos: {
    landing: { nombre: "Landing page", rango: [450, 900] },
    sitio_web: { nombre: "Sitio web corporativo", rango: [900, 2500] },
    tienda_online: { nombre: "Tienda en línea", rango: [1500, 3500] },
  },

  // Cada sistema externo que haya que conectar (agenda que no sea Google,
  // ERP, hoja de cálculo, pasarela...) suma esto a la implementación.
  integracion_extra: [150, 400],

  // Conversaciones por encima del tope del plan, por cada 100.
  excedente_por_100: 25,

  // Ajustes y cambios: incluidos por mes, y qué cuesta la hora que se pase.
  horas_de_ajuste_incluidas: 4,
  hora_extra: 60,

  // Minutos de voz por encima del tope del módulo.
  minuto_de_voz_extra: 0.9,
};

/**
 * "$1.234" — miles con punto, como se escribe en Ecuador. Sin decimales
 * cuando la cifra es redonda; con dos cuando no lo es, para que $0,90 el
 * minuto no se convierta en "$1".
 */
export function dolares(n) {
  const decimales = Number.isInteger(n) ? 0 : 2;
  return `$${n.toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`;
}

/** "entre $690 y $1.200" a partir de [690, 1200]. */
export function rango([desde, hasta]) {
  return `entre ${dolares(desde)} y ${dolares(hasta)}`;
}
