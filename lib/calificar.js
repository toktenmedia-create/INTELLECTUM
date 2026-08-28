/**
 * EL CALIFICADOR — la ficha que se escribe sola.
 *
 * Cuando una conversación tocó un lead (lo guardó, lo cotizó o le agendó una
 * cita), un segundo modelo — chico y barato — lee el hilo y deja en la ficha
 * cuatro cosas que el dueño necesita sin leer el hilo entero:
 *
 *   temperatura   caliente | tibio | frio — ¿a quién llamo primero?
 *   puntaje       0-100, para ordenar dentro de la misma temperatura
 *   resumen_ia    3-4 líneas: qué quiere, qué se le dijo, qué quedó pendiente
 *   proximo_paso  la acción concreta que sigue, en una línea
 *
 * Decisiones deliberadas:
 *   - Corre DESPUÉS de responder y en segundo plano: jamás retrasa al cliente.
 *   - Solo corre si la conversación tocó un lead: calificar charlas de "hola,
 *     ¿qué venden?" sería pagar por clasificar humo.
 *   - Si falla, no pasa nada visible: la ficha queda como estaba y el error va
 *     al registro. La calificación es un lujo, no una pieza estructural.
 *   - No conoce a Intellectum: el prompt es genérico y sirve para cualquier
 *     cliente del modelo madre.
 *
 * Variables:
 *   CALIFICADOR_MODELO  otro modelo si se quiere (por defecto Haiku 4.5).
 *   CALIFICAR_LEADS     "no" lo apaga por completo.
 */

import Anthropic from "@anthropic-ai/sdk";

// Se construye recién al primer uso: el SDK lanza si no hay ANTHROPIC_API_KEY,
// y este módulo no puede tumbar a quien lo importa solo por existir.
let anthropic = null;
const clienteAnthropic = () => (anthropic ??= new Anthropic());

const MODELO_CALIFICADOR = process.env.CALIFICADOR_MODELO || "claude-haiku-4-5";

/** Las herramientas cuyo uso convierte una charla en algo que vale calificar. */
const HERRAMIENTAS_QUE_CALIFICAN = new Set(["guardar_lead", "cotizar", "agendar_cita"]);

const SYSTEM =
  "Eres el calificador de prospectos de un negocio que atiende y vende por chat. " +
  "Lees una conversación entre un cliente potencial y el asistente del negocio, y " +
  "produces una calificación honesta PARA EL DUEÑO, no para el cliente. Reglas: " +
  "caliente = pidió precio o cita, tiene una necesidad concreta y dio cómo contactarlo; " +
  "tibio = interés real pero sin urgencia o sin datos completos; " +
  "frio = curiosidad, sin necesidad concreta o sin forma de contactarlo. " +
  "Basa TODO en lo que la conversación dice de verdad: si un dato no está, no existe. " +
  "El resumen va en español, en 3 o 4 líneas útiles: qué quiere, qué se le ofreció o " +
  "cotizó, y qué quedó pendiente. El próximo paso es UNA acción concreta que el dueño " +
  "puede hacer hoy.";

const DEFINICION = {
  name: "calificar_lead",
  description: "Registra la calificación del prospecto en su ficha del CRM.",
  input_schema: {
    type: "object",
    properties: {
      temperatura: { type: "string", enum: ["caliente", "tibio", "frio"] },
      puntaje: {
        type: "integer",
        description: "0 a 100. 90+ solo si pidió cita o cotización Y dejó contacto.",
      },
      resumen: { type: "string", description: "3-4 líneas para el dueño." },
      proximo_paso: { type: "string", description: "Una acción concreta, una línea." },
    },
    required: ["temperatura", "puntaje", "resumen", "proximo_paso"],
    additionalProperties: false,
  },
};

/** ¿Esta vuelta de conversación tocó un lead? (para decidir si se califica) */
export function tocoUnLead(acciones = []) {
  return acciones.some(
    (a) => HERRAMIENTAS_QUE_CALIFICAN.has(a?.herramienta) && a?.resultado === "ok",
  );
}

/**
 * Califica la conversación de una sesión y lo escribe en su lead.
 * Nunca lanza: todo fallo se anota y se sigue.
 */
export async function calificarConversacion({
  almacen,
  cliente = "intellectum",
  canal,
  sesion,
  historial = [],
}) {
  if (String(process.env.CALIFICAR_LEADS ?? "").toLowerCase() === "no") return;
  if (!almacen || !sesion || historial.length === 0) return;

  try {
    const lead = await almacen.leadDeSesion?.({ cliente, canal, sesion });
    if (!lead?.id) return; // sin ficha no hay dónde escribir

    const hilo = historial
      .slice(-24)
      .map((m) => {
        const quien = m.role === "user" ? "Cliente" : "Asistente";
        const texto = typeof m.content === "string" ? m.content : "[archivo adjunto]";
        return `${quien}: ${texto}`;
      })
      .join("\n")
      .slice(0, 12_000);

    const respuesta = await clienteAnthropic().messages.create({
      model: MODELO_CALIFICADOR,
      max_tokens: 500,
      system: SYSTEM,
      tools: [DEFINICION],
      tool_choice: { type: "tool", name: "calificar_lead" },
      messages: [{ role: "user", content: hilo }],
    });

    const uso = respuesta.content.find((b) => b.type === "tool_use");
    if (!uso?.input) return;

    // El esquema no puede imponer rangos (la trampa de strict con minimum);
    // los topes se imponen aquí, que es donde de verdad se cumplen.
    const temperatura = ["caliente", "tibio", "frio"].includes(uso.input.temperatura)
      ? uso.input.temperatura
      : "tibio";
    const puntaje = Math.min(100, Math.max(0, Math.round(Number(uso.input.puntaje) || 0)));

    await almacen.actualizarLead({
      cliente,
      id: lead.id,
      temperatura,
      puntaje,
      resumen_ia: String(uso.input.resumen ?? "").slice(0, 700),
      proximo_paso: String(uso.input.proximo_paso ?? "").slice(0, 200),
      calificado_en: new Date().toISOString(),
    });

    await almacen
      .registrarEvento({
        tipo: "lead_calificado",
        actor: "sistema",
        cliente,
        detalle: { lead_id: lead.id, temperatura, puntaje, canal },
      })
      .catch(() => {});
  } catch (err) {
    const mensaje = String(err?.message ?? err);
    if (/column|columna/i.test(mensaje)) {
      console.error(
        "[CALIFICAR] a la tabla leads le faltan columnas: aplica supabase/calificacion.sql y listo.",
      );
    } else {
      console.error("[CALIFICAR] no se pudo calificar:", mensaje);
    }
  }
}
