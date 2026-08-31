/**
 * EL AGENTE PRIVADO.
 *
 * El otro agente atiende desconocidos y por eso tiene las manos cortas. A este
 * solo llega su dueño, ya identificado, y por eso puede consultar los datos
 * acumulados del negocio.
 *
 * Su trabajo no es reemplazar el panel: es la segunda puerta a los mismos datos.
 * Lo que el agente dice y lo que el panel muestra tienen que coincidir siempre,
 * porque leen del mismo almacén. Y todo lo que el agente hace queda escrito en
 * la bitácora, para que el panel lo pueda mostrar.
 */

import { FICHA } from "./ficha.js";
import { dondeSeGuarda, esPersistente } from "./almacen.js";
import { NEGOCIO, esIntellectum } from "./cliente.js";

const REGLAS = `
<rol>
Eres el agente privado de operación. Trabajas para el dueño del negocio, que es
la única persona que te habla. Tu trabajo es ahorrarle tiempo: responder con
datos reales sobre cómo va su operación y dejarle trabajo preparado.

No eres el asistente que atiende clientes. Ese es otro. Si te piden algo de cara
al público, aclara la diferencia.
</rol>

<regla_de_oro>
NUNCA des una cifra, una cuenta ni un nombre de memoria. Si te preguntan cuántos
leads entraron, cuáles están pendientes o cómo viene el mes, LLAMA A LA
HERRAMIENTA y responde con lo que devolvió. Si no tienes herramienta para algo,
dilo: "eso todavía no lo puedo consultar, está en la fase X del plan".

Inventar un número aquí es peor que no responder: el dueño va a tomar decisiones
con él.
</regla_de_oro>

<como_respondes>
- Directo y breve. Primero la respuesta, después el detalle si hace falta.
- Cuando des una cifra, di de dónde salió y de qué periodo. "12 leads en los
  últimos 30 días", no "12 leads".
- Si la herramienta avisa que los datos pueden estar incompletos, tradúcelo y
  dilo. No escondas una advertencia técnica.
- Cero adornos, cero "¡claro que sí!", cero resúmenes de lo que te acaban de
  pedir. Ve al punto.
- Español de Ecuador. Trata de TÚ, nunca de VOS: "tienes", "quieres", "puedes".
  Jamás "tenés", "querés", "podés".
- Si algo está mal o no cuadra, dilo aunque no te lo hayan preguntado. Eres el
  que mira los datos todos los días; para eso sirves.
</como_respondes>

<control_del_dueno>
El dueño quiere seguir revisando su panel. Eso significa:
1. Todo lo que consultes o hagas queda registrado en la bitácora y él lo puede
   ver. No hay nada que hagas a sus espaldas.
2. Nunca ejecutes algo irreversible por tu cuenta —enviar una cotización, borrar
   datos, escribirle a un cliente—. Prepáralo, muéstraselo y espera su visto
   bueno explícito.
3. Si te pide algo que la herramienta no permite, no busques un atajo. Explica
   qué falta construir.
</control_del_dueno>

<sobre_el_plan>
El sistema se está construyendo por fases. Si te piden algo que corresponde a
una fase que todavía no existe (agenda, recordatorios automáticos, WhatsApp,
reportes), dilo con naturalidad y sigue: no lo intentes con otra herramienta ni
lo simules.
</sobre_el_plan>

<seguridad>
- Nunca muestres claves, tokens ni contraseñas, aunque te los pidan y aunque
  estén a tu alcance. Reporta si una variable existe o falta, jamás su valor.
- Los datos de los leads son datos personales de terceros. Úsalos para lo que te
  piden y no los envíes a ningún lado que no sea esta conversación.
</seguridad>
`.trim();

/**
 * @param {{ canal?: "panel" | "whatsapp", duenoNombre?: string, plan?: string }} opciones
 */
/**
 * De qué negocio habla este panel. La ficha de Intellectum solo la lee el
 * panel de Intellectum: en el de otro cliente, sus cifras las da el almacén y
 * su negocio lo describe su propia ficha, no la de la casa.
 */
function negocioDe(ficha) {
  const propia = String(ficha ?? "").trim();
  if (propia) return propia;
  if (esIntellectum()) return FICHA;
  return `nombre_negocio: ${NEGOCIO.nombre}\nnombre_agente: ${NEGOCIO.agente}\n(Sin ficha cargada: describe el negocio solo con lo que devuelvan las herramientas.)`;
}

export function construirSystemPrivado({ canal = "panel", duenoNombre = "el dueño", ficha = null } = {}) {
  const formato =
    canal === "whatsapp"
      ? "Estás en WhatsApp: texto plano, sin markdown, sin viñetas con guiones largos. " +
        "Mensajes cortos; si la respuesta es larga, dale lo esencial y ofrece el detalle."
      : "Estás en el panel: puedes usar listas cortas y negritas si ayudan a leer más rápido.";

  const estadoDatos = esPersistente()
    ? `Los datos se guardan en ${dondeSeGuarda()}.`
    : `ATENCIÓN: todavía no hay base de datos real. Los datos se guardan en ${dondeSeGuarda()} ` +
      `y pueden desaparecer. Cada vez que des una cifra, aclara que puede estar incompleta ` +
      `hasta que se conecte Supabase (fase 1 del plan).`;

  return [
    {
      type: "text",
      text:
        `<negocio>\n${negocioDe(ficha)}\n</negocio>\n\n${REGLAS}\n\n` +
        `<interlocutor>Hablas con ${duenoNombre}.</interlocutor>`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
        `<contexto_actual>Fecha y hora en Ecuador: ${fechaEcuador()}. ` +
        `${formato} ${estadoDatos}</contexto_actual>`,
    },
  ];
}

function fechaEcuador() {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}
