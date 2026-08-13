/**
 * LOS PLANES QUE SE VENDEN.
 *
 * Este archivo es la lista de precios en forma de código: define qué sabe hacer
 * el agente de cada cliente según lo que contrató. Subir a un cliente de plan
 * es cambiar una palabra en su ficha, no reprogramar nada.
 *
 * Cada plan enumera herramientas por su nombre. Las herramientas viven en
 * lib/herramientas.js, y cada una declara si ya está construida o todavía no.
 * Así el catálogo comercial nunca puede prometer algo que no existe: la función
 * loQueSeEntregaHoy() separa lo vendible de lo que sigue en obra.
 */

export const PLANES = {
  esencial: {
    nombre: "Agente Esencial",
    para_quien:
      "Quien necesita dejar de perder los mensajes que llegan al sitio y no tiene " +
      "procesos que automatizar todavía.",
    promesa: "Conversa, califica y te entrega el contacto. Nada se pierde.",
    herramientas: ["guardar_lead", "escalar_a_humano"],
    canales: ["web"],
    agente_privado: false,
    panel: "leads",
  },

  operativo: {
    nombre: "Agente Operativo",
    para_quien:
      "Quien ya recibe suficiente volumen como para que atender consuma horas: " +
      "clínicas, inmobiliarias, servicios con agenda.",
    promesa:
      "Además de conversar, hace: agenda, consulta, da seguimiento y avisa cuando " +
      "algo necesita una persona.",
    herramientas: [
      "guardar_lead",
      "escalar_a_humano",
      "ver_disponibilidad",
      "agendar_cita",
      "reagendar_cita",
      "programar_seguimiento",
      "reconocer_contacto",
    ],
    canales: ["web", "whatsapp"],
    agente_privado: false,
    panel: "crm",
  },

  plataforma: {
    nombre: "Plataforma",
    para_quien:
      "Quien quiere operar el negocio desde la conversación: preguntar por sus " +
      "números y pedir trabajo hecho, sin abrir un panel.",
    promesa:
      "Todo lo anterior, más un agente privado que responde solo al dueño y le " +
      "prepara el trabajo. El panel sigue estando: el agente no lo reemplaza.",
    herramientas: [
      "guardar_lead",
      "escalar_a_humano",
      "ver_disponibilidad",
      "agendar_cita",
      "reagendar_cita",
      "programar_seguimiento",
      "reconocer_contacto",
      "enviar_documento",
    ],
    canales: ["web", "whatsapp", "voz"],
    agente_privado: true,
    panel: "crm",
  },
};

/** Plan que se usa cuando una ficha no dice cuál tiene. */
export const PLAN_POR_DEFECTO = "plataforma";

/**
 * Herramientas que puede usar el agente privado. No dependen del plan del
 * cliente sino de quién habla: al agente privado solo llega su dueño, ya
 * identificado. Por eso puede leer datos que el agente público jamás debe ver.
 */
export const HERRAMIENTAS_PRIVADAS = [
  "resumen_de_leads",
  "buscar_leads",
  "revisar_ficha",
  "estado_del_sistema",
];

export function planDe(nombre) {
  return PLANES[nombre] ?? PLANES[PLAN_POR_DEFECTO];
}

export function nombresDePlanes() {
  return Object.keys(PLANES);
}
