/**
 * EL CEREBRO.
 *
 * Un solo módulo que atiende los dos canales (web y WhatsApp). Si mañana se
 * conecta Instagram o un agente de voz, se llama a esta misma función: la ficha,
 * las reglas y la captura de leads no se duplican.
 */

import Anthropic from "@anthropic-ai/sdk";
import { construirSystem } from "./prompt.js";
import { entregarLead } from "./leads.js";

const cliente = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

export const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

// Techo de tokens por respuesta. El costo real depende de lo que el modelo
// genere, no de este número: es solo un seguro contra respuestas desbocadas.
const MAX_TOKENS = 4096;

// Beta que permite que, si un clasificador de seguridad rechaza la petición,
// Anthropic la reintente solo en otro modelo en lugar de devolver vacío.
const BETA_FALLBACK = "server-side-fallback-2026-07-01";

/** Herramienta con la que el modelo entrega el lead ya estructurado. */
const HERRAMIENTA_LEAD = {
  name: "guardar_lead",
  description:
    "Registra a un prospecto interesado para que el equipo de Intellectum lo contacte. " +
    "Úsala UNA sola vez por conversación y solo cuando ya tengas su nombre y un medio " +
    "de contacto real (email o teléfono). Nunca inventes datos: si no sabes algo, " +
    "envía una cadena vacía en ese campo.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre de la persona. Vacío si no lo dio." },
      contacto: {
        type: "string",
        description: "Email o número de teléfono tal como lo escribió la persona.",
      },
      empresa: { type: "string", description: "Nombre de su empresa. Vacío si no lo dio." },
      sector: {
        type: "string",
        description: "A qué se dedica la empresa (clínica, retail, inmobiliaria, etc.).",
      },
      cargo: { type: "string", description: "Rol de la persona: dueño, gerente, operaciones, TI..." },
      necesidad: {
        type: "string",
        description: "El proceso concreto que quiere automatizar y por qué le duele hoy.",
      },
      tamano_empresa: {
        type: "string",
        description: "Tamaño aproximado del equipo o volumen de atención, si lo mencionó.",
      },
      urgencia: {
        type: "string",
        enum: ["alta", "media", "baja", "no_indicada"],
        description:
          "alta = quiere resolverlo ya o este mes; media = próximos meses; baja = solo explorando.",
      },
      resumen: {
        type: "string",
        description: "Dos o tres líneas para que el equipo entienda la conversación sin leerla.",
      },
    },
    required: [
      "nombre",
      "contacto",
      "empresa",
      "sector",
      "cargo",
      "necesidad",
      "tamano_empresa",
      "urgencia",
      "resumen",
    ],
    additionalProperties: false,
  },
};

const MENSAJE_RECHAZO =
  "Prefiero no responder eso por aquí. Si quieres, escríbenos a info@intellectum.ec " +
  "o al WhatsApp +593 98 401 4129 y el equipo te ayuda.";

/**
 * Conversa una vuelta.
 *
 * @param {object}   opciones
 * @param {Array}    opciones.historial  [{ role: "user"|"assistant", content: string }]
 * @param {"web"|"whatsapp"} [opciones.canal]
 * @param {(texto: string) => void} [opciones.onTexto]  se llama con cada trocito de texto
 * @param {object}   [opciones.meta]  contexto para el lead (origen, sesión)
 * @returns {Promise<{ texto: string, lead: object|null }>}
 */
export async function responder({ historial, canal = "web", onTexto, meta = {} }) {
  const system = construirSystem({ canal });
  const mensajes = historial.map((m) => ({ role: m.role, content: m.content }));

  let textoFinal = "";
  let leadGuardado = null;

  // Como máximo 3 vueltas: hablar → guardar lead → confirmar. Más que eso sería
  // un bucle, no una conversación.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const mensaje = await unaVuelta({ system, mensajes, onTexto });

    if (mensaje.stop_reason === "refusal") {
      onTexto?.(MENSAJE_RECHAZO);
      return { texto: MENSAJE_RECHAZO, lead: leadGuardado };
    }

    textoFinal = extraerTexto(mensaje.content);
    mensajes.push({ role: "assistant", content: mensaje.content });

    const llamadas = mensaje.content.filter((b) => b.type === "tool_use");
    if (llamadas.length === 0) {
      return { texto: textoFinal, lead: leadGuardado };
    }

    const resultados = [];
    for (const llamada of llamadas) {
      let salida = "Herramienta desconocida.";
      if (llamada.name === "guardar_lead") {
        try {
          const entrega = await entregarLead(llamada.input, { canal, ...meta });
          leadGuardado = llamada.input;
          salida = `Lead registrado correctamente (${JSON.stringify(entrega)}). Confirma a la persona que el equipo la contactará.`;
        } catch (err) {
          console.error("[BRAIN] fallo entregando lead:", err?.message ?? err);
          salida =
            "No se pudo registrar automáticamente. Pídele a la persona que escriba a info@intellectum.ec o al WhatsApp +593 98 401 4129.";
        }
      }
      resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: salida });
    }

    mensajes.push({ role: "user", content: resultados });
  }

  return { texto: textoFinal, lead: leadGuardado };
}

/** Una llamada al modelo, en streaming. Devuelve el mensaje completo. */
async function unaVuelta({ system, mensajes, onTexto }) {
  const base = {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system,
    messages: mensajes,
    tools: [HERRAMIENTA_LEAD],
    ...ajustesDelModelo(MODELO),
  };

  try {
    return await ejecutarStream(
      { ...base, fallbacks: "default", betas: [BETA_FALLBACK] },
      onTexto,
    );
  } catch (err) {
    // Si esta cuenta o este modelo todavía no aceptan el parámetro de respaldo,
    // se reintenta sin él en vez de dejar al visitante sin respuesta.
    if (esParametroNoSoportado(err)) {
      console.warn("[BRAIN] fallbacks no disponible, reintentando sin él.");
      return await ejecutarStream(base, onTexto);
    }
    throw err;
  }
}

async function ejecutarStream(parametros, onTexto) {
  const stream = cliente.beta.messages.stream(parametros);

  if (onTexto) {
    stream.on("text", (fragmento) => onTexto(fragmento));
  }

  return await stream.finalMessage();
}

/**
 * Parámetros que solo aceptan algunos modelos.
 * Así ANTHROPIC_MODEL se puede cambiar sin romper nada.
 */
function ajustesDelModelo(modelo) {
  const modernos = [
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-fable-5",
  ];

  if (!modernos.includes(modelo)) return {}; // p. ej. claude-haiku-4-5

  return {
    // Pensamiento adaptativo con esfuerzo bajo: es un chat de atención, la
    // rapidez importa más que la deliberación profunda.
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
  };
}

function esParametroNoSoportado(err) {
  if (err?.status !== 400) return false;
  const mensaje = String(err?.message ?? "").toLowerCase();
  return mensaje.includes("fallback") || mensaje.includes("beta");
}

function extraerTexto(bloques) {
  return bloques
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
