/**
 * LOS PLANES QUE SE VENDEN.
 *
 * Este archivo es la lista de precios en forma de código: define qué sabe hacer
 * el agente de cada cliente según lo que contrató. Subir a un cliente de plan
 * es cambiar una palabra en su ficha, no reprogramar nada.
 *
 * Cada plan es un puesto de trabajo, no un paquete de software, y por eso lleva
 * nombre de cargo. La escalera es acumulativa: cada uno hace todo lo del
 * anterior y algo más.
 *
 * Cada plan enumera herramientas por su nombre. Las herramientas viven en
 * lib/herramientas.js, y cada una declara si ya está construida o todavía no.
 * Así el catálogo comercial nunca puede prometer algo que no existe: la función
 * loQueSeEntregaHoy() separa lo vendible de lo que sigue en obra.
 */

export const PLANES = {
  asistente: {
    nombre: "Asistente de Recepción",
    para_quien:
      "Quien necesita dejar de perder los mensajes que llegan al sitio y todavía " +
      "no tiene procesos que automatizar.",
    promesa: "Conversa, califica y te entrega el contacto. Nada se pierde.",
    herramientas: ["guardar_lead", "escalar_a_humano"],
    // Sin WhatsApp a propósito: es el plan que se puede vender sin esperar
    // ninguna aprobación de Meta.
    canales: ["web"],
    agente_privado: false,
    panel: "leads",
  },

  recepcionista: {
    nombre: "Recepcionista Digital",
    para_quien:
      "Quien ya recibe suficiente volumen como para que atender consuma horas: " +
      "clínicas, inmobiliarias, servicios con agenda.",
    promesa:
      "Además de conversar, hace: agenda, reconoce a quien vuelve y avisa cuando " +
      "algo necesita una persona.",
    herramientas: [
      "guardar_lead",
      "escalar_a_humano",
      "ver_disponibilidad",
      "agendar_cita",
      "reagendar_cita",
      "reconocer_contacto",
    ],
    canales: ["web", "whatsapp"],
    agente_privado: false,
    panel: "crm",
  },

  asesor: {
    nombre: "Asesor Comercial",
    para_quien:
      "Quien vende algo que hay que cotizar y pierde negocios por no responder " +
      "a tiempo ni volver a insistir.",
    promesa:
      "Todo lo anterior, más el precio al instante y el seguimiento que nadie " +
      "alcanza a hacer a mano.",
    herramientas: [
      "guardar_lead",
      // El cotizador da rangos al instante. La matriz de lib/precios.js es LA
      // DE INTELLECTUM: cuando un cliente quiera su propio cotizador, su matriz
      // irá en su ficha, no en este archivo.
      "cotizar",
      "escalar_a_humano",
      "ver_disponibilidad",
      "agendar_cita",
      "reagendar_cita",
      "reconocer_contacto",
      "programar_seguimiento",
    ],
    canales: ["web", "whatsapp"],
    // La voz se cobra aparte (módulo), pero recién desde este plan tiene dónde
    // dejar lo que levanta en la llamada.
    admite_voz: true,
    agente_privado: false,
    panel: "crm",
  },

  jefe_ventas: {
    nombre: "Jefe de Ventas",
    para_quien:
      "Quien tiene varias sucursales o líneas de negocio y quiere operar desde " +
      "la conversación, sin abrir un panel.",
    promesa:
      "Todo lo anterior, más un agente privado que responde solo al dueño y le " +
      "prepara el trabajo. El panel sigue estando: el agente no lo reemplaza.",
    herramientas: [
      "guardar_lead",
      "cotizar",
      "escalar_a_humano",
      "ver_disponibilidad",
      "agendar_cita",
      "reagendar_cita",
      "reconocer_contacto",
      "programar_seguimiento",
      "enviar_documento",
    ],
    canales: ["web", "whatsapp"],
    admite_voz: true,
    // Varios agentes o sucursales bajo la misma cuenta: no es una herramienta,
    // es cuántas fichas puede tener el cliente.
    multi_sede: true,
    agente_privado: true,
    panel: "crm",
  },
};

/** Plan que se usa cuando una ficha no dice cuál tiene. */
export const PLAN_POR_DEFECTO = "jefe_ventas";

/**
 * Los nombres viejos de los planes, de cuando la escalera tenía tres peldaños.
 * Una ficha guardada antes del 24 de agosto de 2026 sigue diciendo "operativo"
 * y tiene que seguir funcionando sin que nadie edite la base de datos.
 */
const EQUIVALENCIAS = {
  esencial: "asistente",
  operativo: "recepcionista",
  plataforma: "jefe_ventas",
};

/**
 * Herramientas que puede usar el agente privado. No dependen del plan del
 * cliente sino de quién habla: al agente privado solo llega su dueño, ya
 * identificado. Por eso puede leer datos que el agente público jamás debe ver.
 */
export const HERRAMIENTAS_PRIVADAS = [
  "resumen_de_leads",
  "ver_citas",
  "ver_conversaciones",
  "buscar_leads",
  "revisar_ficha",
  "estado_del_sistema",
];

/** El plan, aceptando también el nombre que tenía antes. */
export function planDe(nombre) {
  return PLANES[nombre] ?? PLANES[EQUIVALENCIAS[nombre]] ?? PLANES[PLAN_POR_DEFECTO];
}

/** La clave vigente de un plan, traduciendo los nombres viejos. */
export function claveDePlan(nombre) {
  if (PLANES[nombre]) return nombre;
  return EQUIVALENCIAS[nombre] ?? PLAN_POR_DEFECTO;
}

export function nombresDePlanes() {
  return Object.keys(PLANES);
}
