/**
 * EL CEREBRO.
 *
 * Un solo módulo para los dos agentes y para todos los canales:
 *
 *   ambito "publico"  → el agente que atiende al visitante. Manos cortas:
 *                       solo las herramientas del plan que contrató el cliente,
 *                       y ninguna que lea datos de otras conversaciones.
 *   ambito "privado"  → el agente al que le hablas tú. Manos largas: puede
 *                       consultar los datos acumulados del negocio, porque del
 *                       otro lado hay alguien ya identificado.
 *
 * Las herramientas no viven aquí: viven en lib/herramientas.js. Este archivo
 * solo conversa, decide a quién le entrega qué, ejecuta lo que el modelo pide y
 * lo deja escrito en la bitácora.
 */

import Anthropic from "@anthropic-ai/sdk";
import { construirSystem } from "./prompt.js";
import { construirSystemPrivado } from "./prompt-privado.js";
import { herramientasPara, buscarHerramienta } from "./herramientas.js";
import { PLAN_POR_DEFECTO, claveDePlan } from "./planes.js";
import { abrirAlmacen } from "./almacen.js";
import { recordarPersona } from "./memoria.js";

const cliente = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

// Sonnet 5: sigue las instrucciones con precisión y, a diferencia de Haiku,
// permite cachear las instrucciones (mínimo 1.024 tokens frente a 4.096), lo
// que compensa buena parte de su precio. Se cambia sin tocar código con la
// variable ANTHROPIC_MODEL en Vercel.
export const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Techo de tokens por respuesta. El costo real depende de lo que el modelo
// genere, no de este número: es solo un seguro contra respuestas desbocadas.
const MAX_TOKENS = 4096;

// Beta que permite que, si un clasificador de seguridad rechaza la petición,
// Anthropic la reintente solo en otro modelo en lugar de devolver vacío.
const BETA_FALLBACK = "server-side-fallback-2026-07-01";

/**
 * Cuántas veces puede el modelo usar herramientas antes de tener que cerrar.
 * El agente público casi nunca necesita más de una (guardar el lead y
 * confirmar); el privado sí, porque una pregunta suya puede necesitar consultar
 * dos o tres cosas y recién ahí responder.
 */
// Cuatro y no tres: agendar gasta dos vueltas (mirar la agenda y reservar) más
// la de responder. Con tres, cualquier reintento se quedaba sin margen.
const VUELTAS = { publico: 4, privado: 8 };

const MENSAJE_RECHAZO =
  "Prefiero no responder eso por aquí. Si quieres, escríbenos a info@intellectum.ec " +
  "o llámanos al +593 98 312 0003 y el equipo te ayuda.";

// Si se acaban las vueltas con el modelo a medio camino, la última respuesta
// puede venir sin una sola palabra. Callarse es la peor salida posible: la
// persona se queda mirando un chat mudo y se va.
const MENSAJE_ATASCO =
  "Perdona, se me complicó completar eso. ¿Lo intentamos otra vez? Si prefieres, " +
  "escríbenos a info@intellectum.ec o llámanos al +593 98 312 0003 y lo coordina el equipo.";

/**
 * Conversa una vuelta.
 *
 * @param {object}   opciones
 * @param {Array}    opciones.historial  [{ role: "user"|"assistant", content: string }]
 * @param {"web"|"whatsapp"|"panel"} [opciones.canal]
 * @param {"publico"|"privado"} [opciones.ambito]
 * @param {string}   [opciones.plan]      plan contratado (define las herramientas)
 * @param {string}   [opciones.cliente]   a qué cliente pertenece esta conversación
 * @param {string}   [opciones.duenoNombre] solo para el agente privado
 * @param {(texto: string) => void} [opciones.onTexto]  se llama con cada trocito de texto
 * @param {object}   [opciones.meta]      contexto extra (origen, sesión)
 * @returns {Promise<{ texto: string, lead: object|null, acciones: Array }>}
 */
export async function responder({
  historial,
  canal = "web",
  ambito = "publico",
  plan = PLAN_POR_DEFECTO,
  cliente: clienteId = "intellectum",
  duenoNombre,
  onTexto,
  meta = {},
}) {
  const mensajes = historial.map((m) => ({ role: m.role, content: m.content }));
  const almacen = abrirAlmacenSeguro();

  // Quién es el dueño de este agente. Su ficha decide QUÉ SABE y su plan decide
  // QUÉ PUEDE HACER; el resto del cerebro es idéntico para todos. Si la base no
  // contesta se sigue con lo que llegó por parámetro: un agente respondiendo
  // con la configuración de casa es un problema, uno que no responde es peor.
  const dueño = await almacen.fichaDeCliente?.({ cliente: clienteId }).catch(() => null);
  const planReal = claveDePlan(dueño?.plan ?? plan);

  const definiciones = herramientasPara({ ambito, plan: planReal });
  const contexto = { almacen, cliente: clienteId, canal, ambito, plan: planReal, meta, modelo: MODELO };

  // Solo al abrir un hilo nuevo se busca quién es: es el momento en que hace
  // falta (el que vuelve después de que su charla caducó) y el único en que
  // sale gratis. Ya dentro de la conversación, el contexto lo lleva ella misma,
  // y no tocar el prompt a media charla mantiene viva la caché.
  const memoria =
    ambito === "publico" && mensajes.length <= 1
      ? await recordarPersona(almacen, { cliente: clienteId, canal, sesion: meta?.sesion })
      : null;

  const system =
    ambito === "privado"
      ? construirSystemPrivado({ canal, duenoNombre, plan: planReal })
      : construirSystem({ canal, memoria, ficha: dueño?.ficha });

  let textoFinal = "";
  let leadGuardado = null;
  const acciones = [];

  // El separador entre vueltas: el modelo suele cerrar una frase, ejecutar una
  // herramienta y arrancar otra, y los dos textos llegan pegados
  // ("…reviso los horarios.Tengo espacio el lunes"). Se emite UNA vez por
  // vuelta, solo si ya había texto y ninguno de los dos lados trae su espacio.
  let ultimoCaracter = "";
  let separadorPendiente = false;
  const separar = (siguiente) => {
    if (!separadorPendiente) return "";
    separadorPendiente = false;
    const pegados = !/\s/.test(ultimoCaracter) && !/^\s/.test(siguiente);
    return pegados ? " " : "";
  };

  for (let vuelta = 0; vuelta < (VUELTAS[ambito] ?? 3); vuelta++) {
    // Entre vuelta y vuelta el modelo suele cerrar una frase, ejecutar la
    // herramienta y arrancar otra. Los dos textos llegan pegados si no se
    // separan aquí ("…reviso los horarios.Tengo espacio el lunes").
    const mensaje = await unaVuelta({
      system,
      mensajes,
      definiciones,
      onTexto:
        onTexto &&
        ((t) => {
          const trozo = separar(t) + t;
          if (trozo) ultimoCaracter = trozo.slice(-1);
          onTexto(trozo);
        }),
    });

    if (mensaje.stop_reason === "refusal") {
      onTexto?.(MENSAJE_RECHAZO);
      return { texto: MENSAJE_RECHAZO, lead: leadGuardado, acciones };
    }

    textoFinal = extraerTexto(mensaje.content);
    if (textoFinal) separadorPendiente = true;
    mensajes.push({ role: "assistant", content: mensaje.content });

    const llamadas = mensaje.content.filter((b) => b.type === "tool_use");
    if (llamadas.length === 0) {
      return { texto: textoFinal, lead: leadGuardado, acciones };
    }

    const resultados = [];
    for (const llamada of llamadas) {
      const { salida, accion } = await ejecutarHerramienta(llamada, contexto);
      if (accion) acciones.push(accion);
      if (llamada.name === "guardar_lead" && accion?.resultado === "ok") {
        leadGuardado = llamada.input;
      }
      resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: salida });
    }

    mensajes.push({ role: "user", content: resultados });
  }

  if (!textoFinal.trim()) {
    console.error("[BRAIN] se acabaron las vueltas sin respuesta; sale el mensaje de atasco");
    onTexto?.(MENSAJE_ATASCO);
    return { texto: MENSAJE_ATASCO, lead: leadGuardado, acciones };
  }

  return { texto: textoFinal, lead: leadGuardado, acciones };
}

/**
 * Limpia lo que el modelo mandó como argumentos.
 *
 * Muy de vez en cuando, el modelo derrama su propia sintaxis de llamada dentro
 * del valor de un campo. Pasó de verdad al agendar: el campo "empresa" llegó
 * con un cierre de etiqueta y el nombre del campo siguiente pegados adentro, y
 * esa basura terminó en el título del evento del calendario y en el correo al
 * cliente.
 *
 * No es algo que se pueda arreglar pidiéndoselo por prompt, así que se corta
 * aquí, en la puerta: un solo lugar que protege a todas las herramientas y a
 * todo lo que venga después.
 */
const SINTAXIS_DERRAMADA = /<\/?\s*(antml|parameter|invoke|function_calls)[^>]*>/gi;

function limpiarEntrada(valor) {
  if (typeof valor === "string") {
    return valor.replace(SINTAXIS_DERRAMADA, " ").replace(/\s{2,}/g, " ").trim();
  }
  if (Array.isArray(valor)) return valor.map(limpiarEntrada);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiarEntrada(v)]));
  }
  return valor;
}

/**
 * Ejecuta una herramienta pedida por el modelo, con tres cinturones:
 *   1. Tiene que existir Y pertenecer al ámbito de esta conversación. Un agente
 *      público que pida una herramienta privada no la recibe, punto.
 *   2. Si es irreversible, no se ejecuta: se deja preparada esperando el visto
 *      bueno del dueño.
 *   3. Pase lo que pase, queda escrito en la bitácora.
 */
async function ejecutarHerramienta(llamada, ctx) {
  const herramienta = buscarHerramienta(llamada.name, ctx.ambito);
  llamada = { ...llamada, input: limpiarEntrada(llamada.input) };

  if (!herramienta) {
    await anotar(ctx, {
      tipo: "herramienta_rechazada",
      detalle: { herramienta: llamada.name },
    });
    return {
      salida:
        "Esa herramienta no está disponible en este contexto. No la vuelvas a intentar; " +
        "explícale a la persona que eso todavía no lo puedes hacer.",
      accion: { herramienta: llamada.name, resultado: "rechazada" },
    };
  }

  // Todo lo irreversible pasa por aquí: el agente prepara, el dueño confirma.
  if (herramienta.requiere_confirmacion) {
    await anotar(ctx, {
      tipo: "accion_pendiente_de_confirmacion",
      detalle: { herramienta: llamada.name, entrada: llamada.input },
    });
    return {
      salida:
        "Acción preparada pero NO ejecutada: necesita la confirmación del dueño. " +
        "Dilo con naturalidad y no la des por hecha.",
      accion: { herramienta: llamada.name, resultado: "pendiente", entrada: llamada.input },
    };
  }

  try {
    const salida = await herramienta.ejecutar(llamada.input, ctx);
    await anotar(ctx, {
      tipo: "herramienta_ejecutada",
      detalle: { herramienta: llamada.name, entrada: llamada.input },
    });
    return { salida, accion: { herramienta: llamada.name, resultado: "ok" } };
  } catch (err) {
    console.error(`[BRAIN] fallo en ${llamada.name}:`, err?.message ?? err);
    await anotar(ctx, {
      tipo: "herramienta_fallida",
      detalle: { herramienta: llamada.name, error: String(err?.message ?? err) },
    });
    return {
      salida:
        `No se pudo completar (${err?.message ?? "error desconocido"}). ` +
        "No lo intentes otra vez: explícalo y ofrece el contacto directo del equipo.",
      accion: { herramienta: llamada.name, resultado: "error" },
    };
  }
}

/** Escribe en la bitácora. Nunca puede tumbar una conversación. */
async function anotar(ctx, evento) {
  try {
    await ctx.almacen.registrarEvento({
      ...evento,
      actor: ctx.ambito === "privado" ? "agente_privado" : "agente_publico",
      cliente: ctx.cliente,
    });
  } catch (err) {
    console.error("[BITACORA] no se pudo registrar:", err?.message ?? err);
  }
}

/**
 * Abre el almacén sin poder fallar. Si no está disponible, devuelve uno que
 * explica por qué cada vez que alguien lo usa, en vez de reventar la
 * conversación entera.
 */
function abrirAlmacenSeguro() {
  try {
    return abrirAlmacen();
  } catch (err) {
    console.error("[ALMACEN] no disponible:", err?.message ?? err);
    const fallar = async () => {
      throw new Error(`almacén no disponible: ${err?.message ?? err}`);
    };
    return {
      tipo: "no_disponible",
      guardarLead: fallar,
      listarLeads: fallar,
      buscarLeads: fallar,
      listarEventos: fallar,
      registrarEvento: async () => {}, // la bitácora nunca estorba
    };
  }
}

/** Una llamada al modelo, en streaming. Devuelve el mensaje completo. */
async function unaVuelta({ system, mensajes, definiciones, onTexto }) {
  const base = {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system,
    messages: mensajes,
    ...(definiciones.length > 0 ? { tools: definiciones } : {}),
    ...ajustesDelModelo(MODELO),
  };

  // El respaldo por rechazo solo aplica a los modelos que llevan clasificadores
  // de seguridad capaces de declinar una petición. En Haiku no hace falta.
  if (!usaRespaldo(MODELO)) {
    return await ejecutarStream(base, onTexto);
  }

  try {
    return await ejecutarStream({ ...base, fallbacks: "default", betas: [BETA_FALLBACK] }, onTexto);
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

  const mensaje = await stream.finalMessage();
  registrarConsumo(mensaje);
  return mensaje;
}

/**
 * Deja el consumo de cada llamada en los registros de Vercel.
 * Sirve para vigilar el gasto y para comprobar que la caché funciona: a partir
 * del segundo mensaje de una conversación, cache_leido debería ser > 0.
 */
function registrarConsumo(mensaje) {
  const uso = mensaje?.usage;
  if (!uso) return;

  console.log(
    "[USO]",
    JSON.stringify({
      modelo: mensaje.model,
      entrada: uso.input_tokens ?? 0,
      salida: uso.output_tokens ?? 0,
      cache_escrito: uso.cache_creation_input_tokens ?? 0,
      cache_leido: uso.cache_read_input_tokens ?? 0,
    }),
  );
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

function usaRespaldo(modelo) {
  return ["claude-opus-5", "claude-fable-5", "claude-mythos-5"].includes(modelo);
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
