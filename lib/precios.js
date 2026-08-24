/**
 * LA MATRIZ DE PRECIOS — la única fuente de cifras de todo el sistema.
 *
 * El asistente tiene PROHIBIDO decir números de memoria: cualquier cifra que
 * dé un rango sale de aquí, calculada por la herramienta cotizar.
 *
 * Formato: implementacion es [desde, hasta] en USD, pago único. La mensualidad
 * es fija por plan e incluye un tope de conversaciones; el excedente se cobra
 * por cada 100. Los proyectos web son pago único, sin mensualidad propia.
 * Todo valor es SIN IVA (la ficha manda sumar el 15% vigente al facturar).
 */

export const PRECIOS = {
  planes: {
    esencial: {
      nombre: "Agente Esencial",
      implementacion: [500, 900],
      mensualidad: 89,
      conversaciones_incluidas: 300,
    },
    operativo: {
      nombre: "Agente Operativo",
      implementacion: [900, 1600],
      mensualidad: 199,
      conversaciones_incluidas: 800,
    },
    plataforma: {
      nombre: "Plataforma",
      implementacion: [1800, 2800],
      mensualidad: 299,
      conversaciones_incluidas: 1500,
    },
  },

  // La voz nunca se vende sola: se monta sobre el Agente Operativo o superior,
  // porque sin agenda ni CRM el agente de voz no tiene dónde dejar el trabajo.
  modulo_voz: {
    nombre: "Módulo de voz",
    implementacion: [1500, 2500],
    mensualidad: 1000,
    minutos_incluidos: 1000,
  },

  // Proyectos de pago único. Toda web nace con el Agente Esencial adentro
  // (primer mes incluido): es el diferenciador, no un extra.
  proyectos: {
    landing: { nombre: "Landing page", rango: [450, 900] },
    sitio_web: { nombre: "Sitio web corporativo", rango: [900, 2500] },
    tienda_online: { nombre: "Tienda en línea", rango: [1500, 3500] },
  },

  // Cada sistema externo que haya que conectar (agenda que no sea Google,
  // ERP, hoja de cálculo, pasarela...) suma esto a la implementación.
  integracion_extra: [150, 400],

  // Conversaciones por encima del tope del plan, por cada 100.
  excedente_por_100: 15,
};

/** "$1.234" — miles con punto, como se escribe en Ecuador; sin decimales. */
export function dolares(n) {
  return `$${Math.round(n).toLocaleString("es-EC")}`;
}

/** "entre $900 y $1.600" a partir de [900, 1600]. */
export function rango([desde, hasta]) {
  return `entre ${dolares(desde)} y ${dolares(hasta)}`;
}
