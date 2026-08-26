/**
 * POST /api/voz  →  aquí caen las llamadas del agente de voz (Dapta).
 *
 * Dapta pone la llamada; este sistema pone el cerebro comercial. Cuando una
 * llamada termina, Dapta manda un aviso HTTP con lo que pasó, y este endpoint
 * lo convierte en lo que ya existe en la casa: un lead en el CRM, un evento en
 * la bitácora y un correo al equipo. Así las llamadas viven donde viven los
 * chats, y cambiar de proveedor de voz algún día es cambiar este archivo, no
 * rehacer el CRM.
 *
 * DECISIÓN DE DISEÑO: Dapta NO documenta públicamente el formato exacto de su
 * aviso. En vez de fingir que lo conocemos, este receptor es TOLERANTE: guarda
 * el mensaje crudo COMPLETO y encima extrae lo que reconoce probando los
 * nombres de campo habituales en cualquier nivel de anidado. Ningún cuerpo raro
 * se rechaza: rechazar algo inesperado sería peor que guardarlo a medias.
 *
 * TRES COSAS QUE NUNCA PUEDEN PASAR, y que dictan casi todo lo de abajo:
 *   1. Que el endpoint responda 500 y la llamada desaparezca sin dejar rastro.
 *      Por eso el crudo va a los registros ANTES de tocar nada, y el mapeo
 *      entero vive dentro de un try.
 *   2. Que se pierda un dato que SÍ venía. Por eso se recorre el anidado en
 *      cola hasta agotarlo, y las claves se comparan sin distinguir mayúsculas.
 *   3. Que dos personas distintas terminen en el mismo lead. Perder un dato se
 *      recupera del crudo; fundir dos prospectos no se recupera nunca. Por eso
 *      la llave de deduplicación es SOLO un teléfono normalizado de verdad.
 *
 * Seguridad: exige un secreto (DAPTA_WEBHOOK_TOKEN), de preferencia en la
 * cabecera Authorization; se acepta ?token= porque el panel de Dapta no siempre
 * deja configurar cabeceras. Sin la variable, el endpoint duerme.
 */

import { abrirAlmacen } from "../lib/almacen.js";
import { enviarAviso } from "../lib/leads.js";
import { normalizarTelefono } from "../lib/mensajeria.js";

/** Cuánto del mensaje crudo se guarda. Suficiente para leerlo; no infinito. */
const TOPE_CRUDO = 8_000;
const TOPE_TRANSCRIPCION = 4_000;
/** Cuatro horas: ninguna llamada comercial dura más, y "no sé" es más honesto. */
const TOPE_DURACION = 4 * 3600;

export default async function handler(req, res) {
  const esperado = process.env.DAPTA_WEBHOOK_TOKEN;
  if (!esperado) {
    console.warn("[VOZ] sin DAPTA_WEBHOOK_TOKEN: el endpoint está dormido.");
    return responder(res, 503, { error: "No configurado" });
  }
  if (!tokenCorrecto(req, esperado)) {
    return responder(res, 401, { error: "No autorizado" });
  }

  // Un GET con el token correcto responde que está vivo: sirve para probar la
  // URL desde el panel de Dapta sin fabricar una llamada.
  if (req.method === "GET") {
    return responder(res, 200, { ok: true, escuchando: true });
  }
  if (req.method !== "POST") {
    return responder(res, 405, { error: "Método no permitido" });
  }

  // Leer y entender son dos cosas distintas, y merecen respuestas distintas:
  // un 4xx le dice a Dapta "no reintentes", y eso solo es verdad si el cuerpo
  // llegó entero y no se pudo interpretar.
  let crudo;
  try {
    crudo = await leerCrudo(req);
  } catch (err) {
    console.error("[VOZ] no se pudo leer el cuerpo:", err?.message ?? err);
    return responder(res, 503, { error: "No se pudo leer el cuerpo; reintenta" });
  }
  let cuerpo;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return responder(res, 400, { error: "El cuerpo no es JSON" });
  }

  // El crudo, a los registros de Vercel ANTES que nada. Si la base está caída o
  // el mapeo revienta, esta línea es lo único que queda de la llamada.
  console.log("[VOZ_CRUDO]", crudo.slice(0, TOPE_CRUDO));

  let llamada;
  try {
    llamada = extraer(cuerpo);
  } catch (err) {
    // Que una clave nueva del proveedor cueste una llamada entera sería
    // absurdo: se sigue con lo que haya y el crudo ya quedó arriba.
    console.error("[VOZ] no se pudo mapear el cuerpo:", err?.message ?? err);
    llamada = vacia();
  }

  const almacen = abrirAlmacen();

  // 1. La bitácora, con el crudo adentro. Es lo que garantiza que la primera
  // llamada real se pueda estudiar aunque el mapeo no reconozca nada.
  let enBitacora = false;
  try {
    await almacen.registrarEvento({
      tipo: "llamada_registrada",
      actor: "agente_voz",
      detalle: {
        canal: "voz",
        telefono: llamada.telefono ?? llamada.telefonoCrudo,
        duracion_segundos: llamada.duracionSegundos,
        resultado: sano(llamada.resultado, 120),
        resumen: sano(llamada.resumen, 500),
        transcripcion: sano(llamada.transcripcion, TOPE_TRANSCRIPCION),
        grabacion: llamada.grabacion,
        corte: llamada.corte,
        buzon: llamada.buzon,
        crudo: crudo.slice(0, TOPE_CRUDO),
      },
    });
    enBitacora = true;
  } catch (err) {
    console.error("[VOZ] no se pudo anotar la llamada:", err?.message ?? err);
  }

  // 2. El lead. Se crea si hay a quién seguir O si el agente reconoció algo
  // útil: un prospecto con identificador oculto sigue siendo un prospecto.
  let leadId = null;
  if (llamada.telefono || llamada.telefonoCrudo || llamada.nombre || llamada.resumen) {
    try {
      // LA LLAVE DE DEDUPLICACIÓN ES SOLO UN TELÉFONO NORMALIZADO DE VERDAD.
      // Con "anonymous" o "unknown" como sesión, todo identificador oculto de
      // treinta días caería en el mismo lead y cada uno borraría la nota del
      // anterior. Sin teléfono, sesion queda nula: lead propio, nadie se funde.
      const sesion = llamada.telefono || null;
      const previo = sesion ? await almacen.leadDeSesion?.({ canal: "voz", sesion }) : null;
      const edadDias = previo
        ? (Date.now() - new Date(previo.creado_en ?? 0).getTime()) / 86_400_000
        : Infinity;

      // Fecha ilegible: se trata al previo como vigente. Ante la duda, no duplicar.
      if (previo && (!Number.isFinite(edadDias) || edadDias <= 30)) {
        leadId = previo.id;
        await almacen.actualizarLead?.({
          id: previo.id,
          nota: sano(`Volvió a llamar${llamada.resumen ? `: ${llamada.resumen}` : "."}`, 500),
        });
      } else {
        const guardado = await almacen.guardarLead(
          {
            nombre: sano(llamada.nombre, 120) || "",
            contacto: llamada.telefono || llamada.telefonoCrudo || "",
            empresa: sano(llamada.empresa, 120) || "",
            necesidad: sano(llamada.resumen, 2_000) || "Llamó al agente de voz.",
            urgencia: "media",
            resumen: sano(
              `Llamada de ${formatearDuracion(llamada.duracionSegundos)}` +
                (llamada.resultado ? ` (${sano(llamada.resultado, 60)})` : "") +
                (llamada.resumen ? `: ${llamada.resumen}` : "."),
              1_000,
            ),
          },
          { cliente: "intellectum", canal: "voz", sesion, origen: "dapta" },
        );
        leadId = guardado?.id ?? null;
      }
    } catch (err) {
      console.error("[VOZ] no se pudo guardar el lead:", err?.message ?? err);
    }
  }

  // 3. El aviso al equipo. Una llamada es de lo más valioso que entra: se
  // avisa siempre, falle lo que falle arriba. El asunto va recortado y sin
  // saltos de línea porque un asunto gigante hace que Resend rechace el correo
  // entero — y ahí se perdería el aviso de esa llamada.
  await enviarAviso({
    asunto: `Llamada atendida por el agente de voz${
      llamada.nombre ? `: ${sano(llamada.nombre, 60)}` : ""
    }`,
    cuerpo: [
      `Teléfono: ${llamada.telefono || llamada.telefonoCrudo || "no identificado"}`,
      `Duración: ${formatearDuracion(llamada.duracionSegundos)}`,
      llamada.resultado ? `Resultado: ${sano(llamada.resultado, 120)}` : "",
      llamada.resumen ? `` : "",
      llamada.resumen ? `Resumen: ${sano(llamada.resumen, 600)}` : "",
      llamada.transcripcion ? `` : "",
      llamada.transcripcion ? `— Transcripción (inicio) —` : "",
      llamada.transcripcion ? sano(llamada.transcripcion, 900) : "",
      ``,
      `El detalle completo quedó en el panel: www.intellectum.ec/panel`,
    ]
      .filter((l, i, todas) => l !== "" || todas[i + 1] !== "")
      .join("\n"),
  }).catch((err) => console.error("[VOZ] sin correo de aviso:", err?.message ?? err));

  // Si NADA sobrevivió, no se le miente a Dapta: un 503 invita a reintentar, y
  // ese reintento es la única oportunidad de no perder la llamada. Un 200 con
  // la base caída la borra del mundo sin que nadie se entere.
  if (!enBitacora && !leadId) {
    return responder(res, 503, { error: "No se pudo guardar; reintenta" });
  }
  return responder(res, 200, { ok: true, lead: leadId });
}

const vacia = () => ({
  telefono: null,
  telefonoCrudo: null,
  duracionSegundos: null,
  resultado: null,
  resumen: null,
  transcripcion: null,
  nombre: null,
  empresa: null,
  grabacion: null,
  corte: null,
  buzon: false,
});

// ─── EL MAPEO ────────────────────────────────────────────────────────────────

const CONTENEDORES = [
  "call", "data", "payload", "event", "body", "result",
  "call_analysis", "callAnalysis",
];
const CONTENEDORES_VARIABLES = [
  "extracted_data", "extractedData", "extracted_variables", "variables",
  "post_call_data", "postCallData", "analysis", "insights", "retrieved_data",
  "custom_data", "custom_analysis_data", "customAnalysisData",
  "metadata", "datos", "resultados",
];

/**
 * Saca lo que se reconozca del mensaje, probando los nombres habituales en
 * cualquier nivel de anidado. Es lo que cuesta integrarse contra un formato no
 * documentado sin inventárselo.
 */
function extraer(cuerpo) {
  const capas = []; // { indice, especifica }
  const vistos = new Set();

  /**
   * Agrega una capa donde buscar.
   *
   * Acepta un OBJETO SERIALIZADO como texto: si en el flujo de Dapta el
   * parámetro se declara de tipo texto (que a veces es la única opción), lo que
   * llega es la cadena '{"from":"099..."}' y no el objeto. Sin esto el dato
   * llegaría íntegro y se ignoraría — el peor fallo posible, porque todo parece
   * bien configurado y el lead llega vacío.
   *
   * El índice va en minúsculas porque los nombres de las variables se escriben
   * a mano en el panel de Dapta, y "Name" o "Summary" es tan probable como
   * "name". Perder el nombre por una mayúscula sería absurdo.
   */
  const agregar = (x, especifica = false) => {
    let v = x;
    if (typeof v === "string") {
      const podado = v.trim();
      if (!podado.startsWith("{")) return;
      try {
        v = JSON.parse(podado);
      } catch {
        return;
      }
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) return;
    if (vistos.has(v)) return;
    vistos.add(v);
    const indice = Object.create(null);
    for (const [k, valor] of Object.entries(v)) {
      const bajo = k.toLowerCase();
      if (!(bajo in indice)) indice[bajo] = valor;
    }
    capas.push({ indice, especifica });
  };

  agregar(cuerpo);

  // ENVOLTORIO DESCONOCIDO: si quien arma el flujo mete todo dentro de una
  // llave inventada, ningún nombre de la lista la reconocería. Con UNA sola
  // llave no hay ambigüedad posible, así que se entra. Dos niveles, porque
  // venir envuelto dos veces pasa más de lo que uno creería.
  let sonda = cuerpo;
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const llaves =
      sonda && typeof sonda === "object" && !Array.isArray(sonda) ? Object.keys(sonda) : [];
    if (llaves.length !== 1) break;
    sonda = sonda[llaves[0]];
    agregar(sonda);
  }

  // Un arreglo en la raíz: cada elemento es una capa.
  if (Array.isArray(cuerpo)) for (const x of cuerpo) agregar(x);

  // RECORRIDO EN COLA. Los contenedores anidan MÁS DE UN SALTO: el envoltorio
  // típico {"event":"call_ended","data":{"call_analysis":{...}}} deja las
  // variables que Dapta documenta dos niveles abajo, y con una sola pasada
  // nunca se llegaba. Se sigue bajando mientras aparezcan capas nuevas.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const antes = capas.length;
    for (const capa of [...capas]) {
      for (const n of CONTENEDORES) agregar(capa.indice[n.toLowerCase()]);
      for (const n of CONTENEDORES_VARIABLES) agregar(capa.indice[n.toLowerCase()], true);
    }
    if (capas.length === antes) break;
  }

  // Lo que el AGENTE extrajo gana sobre lo que trae el envoltorio del
  // proveedor: su "summary" sigue nuestras instrucciones; el del proveedor es
  // genérico. El sort es estable, así que dentro de cada grupo manda el orden
  // de llegada.
  capas.sort((a, b) => Number(b.especifica) - Number(a.especifica));

  /** Todos los valores no vacíos para esas claves, en orden de preferencia. */
  const candidatos = (...claves) => {
    const salida = [];
    for (const clave of claves) {
      const bajo = clave.toLowerCase();
      for (const capa of capas) {
        const valor = capa.indice[bajo];
        if (valor === undefined || valor === null || valor === "") continue;
        salida.push(valor);
      }
    }
    return salida;
  };

  /**
   * El primer valor que sea un dato suelto. Si NINGUNO lo es, se devuelve el
   * primer objeto encontrado para que texto() lo aplane: un nombre que llega
   * como {first, last} o como ["Paul","Fernández"] es un nombre, y perderlo por
   * venir estructurado sería tirar a la basura un dato que sí vino. Lo escalar
   * gana siempre; el objeto es el último recurso, no la primera opción.
   */
  const buscar = (...claves) => {
    const todos = candidatos(...claves);
    for (const v of todos) {
      if (typeof v === "object") continue;
      return v;
    }
    return todos.length ? todos[0] : null;
  };

  // ── EL TELÉFONO, que es la llave del lead y el dato que no se puede errar ──
  // Dapta DICE si la llamada fue entrante o saliente, así que no hay que
  // adivinar: en una entrante el prospecto es quien llama (from_number); en una
  // saliente es a quien llamamos (to_number). Confundirlos en una saliente
  // guardaría NUESTRO número y fundiría a todos los prospectos en un lead.
  const direccion = String(buscar("direction") ?? "").toLowerCase();
  // El sentido contrario va AL FINAL de la lista, no fuera: si algún día no
  // viniera "direction" y el primer candidato resultara ser nuestro número, hay
  // adónde caer en vez de quedarse sin teléfono.
  const COMUNES = ["customer_phone", "contact_phone", "phone", "phone_number", "phoneNumber", "telefono", "number"];
  const clavesTelefono =
    direccion === "outbound"
      ? ["to_number", "to", ...COMUNES, "from_number", "from", "caller"]
      : ["from_number", "from", "caller", ...COMUNES, "to_number", "to"];

  // Cinturón por si algún día no viene "direction": nuestro propio número nunca
  // es el del prospecto.
  const propio = normalizarTelefono(process.env.DAPTA_NUMERO_SALIDA || "");
  const telCandidatos = candidatos(...clavesTelefono).map((v) => (Array.isArray(v) ? v[0] : v));

  let telefono = null;
  for (const c of telCandidatos) {
    if (c === null || c === undefined || typeof c === "object") continue;
    // Un número JSON pierde el cero inicial: 991111111 vuelve a ser "0991111111".
    const n = normalizarTelefono(typeof c === "number" ? `0${c}` : c) ?? normalizarTelefono(c);
    if (n && n !== propio) {
      telefono = n;
      break;
    }
  }

  // El crudo se conserva para que el vendedor lo vea, pero NUNCA se usa como
  // llave de deduplicación (eso pasa en el handler).
  const telefonoCrudo =
    telefono ??
    telCandidatos
      .map((c) => (c === null || c === undefined || typeof c === "object" ? "" : String(c)))
      .map((x) => x.replace(/\s+/g, " ").trim())
      .find((x) => x.length > 0) ??
    null;

  // ── LA DURACIÓN, con la que se va a medir el costo real por minuto ──
  // Dapta manda DOS: total_duration_seconds (limpia) y duration_ms. La de
  // milisegundos va primero en la lista de nadie: leída como segundos, once
  // segundos de llamada se guardarían como tres horas y arruinarían cualquier
  // promedio de costo. Por eso la clave decide la unidad, no el valor.
  let duracion = null;
  for (const clave of [
    "total_duration_seconds", "duration_seconds", "durationSeconds", "duration",
    "call_duration", "duracion", "call_length", "seconds", "duration_ms", "durationMs",
  ]) {
    for (const c of candidatos(clave)) {
      const bruto = segundos(c);
      if (bruto === null) continue;
      const s = clave.toLowerCase().endsWith("_ms") || clave.endsWith("Ms") ? bruto / 1000 : bruto;
      if (s > 0) { duracion = s; break; }
    }
    if (duracion !== null) break;
  }

  // ── LA TRANSCRIPCIÓN ──
  // La LISTA se mira primero: si se dejara que buscar() la resolviera, la
  // aplanaría como un dato suelto y se perderían los turnos que sí son objetos.
  let transcripcion = null;
  const lista = candidatos(
    "transcript", "transcription", "messages", "turns", "conversation",
  ).find((v) => Array.isArray(v));
  if (lista) {
    // Un turno nulo NO puede costar la llamada entera, y una lista de frases
    // sueltas es tan válida como una de objetos.
    transcripcion = lista
      .map((t) => {
        if (t === null || t === undefined) return "";
        if (typeof t !== "object") return String(t);
        const quien = t.role ?? t.speaker ?? t.from ?? "?";
        const dice = t.content ?? t.text ?? t.message ?? "";
        return dice ? `${quien}: ${dice}` : "";
      })
      .filter(Boolean)
      .join("\n");
  } else {
    transcripcion = buscar("transcript", "transcription", "call_transcript", "transcripcion");
  }

  return {
    telefono,
    telefonoCrudo: telefonoCrudo ? telefonoCrudo.slice(0, 24) : null,
    duracionSegundos:
      duracion !== null && duracion <= TOPE_DURACION ? Math.max(1, Math.round(duracion)) : null,
    resultado: texto(
      buscar("outcome", "status", "result", "disposition", "call_status", "resultado"),
    ),
    resumen: texto(buscar("summary", "resumen", "call_summary", "summary_text", "notes")),
    transcripcion: texto(transcripcion),
    nombre: texto(buscar("name", "contact_name", "customer_name", "nombre", "lead_name")),
    empresa: texto(buscar("company", "empresa", "organization", "business")),
    // La grabación es de lo más útil que manda Dapta: deja escuchar la llamada
    // entera desde el panel en vez de leer una transcripción.
    grabacion: texto(buscar("recording_url", "recordingUrl", "audio_url")),
    // Por qué terminó y si fue a un buzón: distingue "colgó a los dos segundos"
    // de "conversó cinco minutos", y eso cambia si vale la pena perseguir.
    corte: texto(buscar("disconnection_reason", "end_reason")),
    buzon: buscar("voicemail_detected", "in_voicemail") === true,
  };
}

// ─── LIMPIEZA ────────────────────────────────────────────────────────────────

/** Lo que un modelo escribe cuando NO consiguió extraer la variable. */
const VACIOS = new Set([
  "null", "undefined", "n/a", "na", "none", "ninguno", "no aplica", "desconocido", "-",
]);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Recorta sin dejar restos: primero limpia los caracteres de control, DESPUÉS
 * corta, y al final barre el medio emoji que el corte dejó huérfano. Postgres
 * no admite el carácter nulo ni sustitutos sueltos, y un rechazo ahí se lo
 * tragaría el catch: la llamada desaparecería en silencio.
 */
function sano(s, tope) {
  if (s === null || s === undefined) return null;
  return String(s).replace(CONTROL, " ").slice(0, tope).replace(SUELTO, "").trim() || null;
}

function texto(v) {
  if (v === null || v === undefined) return null;
  let s;
  if (Array.isArray(v)) {
    // ["Paul","Fernández"] es una persona, no un JSON que enseñarle al vendedor.
    s = v.filter((x) => x !== null && x !== undefined && typeof x !== "object").join(" ");
  } else if (typeof v === "object") {
    // {first:"Paul", last:"Fernández"} → "Paul Fernández". Imperfecto, pero
    // infinitamente mejor que perder el nombre en silencio.
    s = Object.values(v)
      .filter((x) => x !== null && x !== undefined && typeof x !== "object")
      .join(" ");
  } else if (typeof v === "boolean") {
    return null; // "true" no es el nombre de nadie
  } else {
    s = String(v);
  }
  s = s.replace(CONTROL, " ").trim();
  if (!s || VACIOS.has(s.toLowerCase())) return null;
  return s;
}

/** Acepta 225, "225", "225s", "3:45" y "00:03:45". Lo que no entienda, null. */
function segundos(v) {
  if (typeof v === "boolean" || v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.includes(":")) {
      const partes = s.split(":").map(Number);
      if (partes.some((n) => !Number.isFinite(n))) return null;
      return partes.reduce((total, n) => total * 60 + n, 0);
    }
    const m = s.match(/^([\d.]+)\s*(s|seg|segundos|m|min|minutos|h)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const u = (m[2] || "s").toLowerCase();
    return u.startsWith("h") ? n * 3600 : u.startsWith("m") ? n * 60 : n;
  }
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

function formatearDuracion(segs) {
  if (!segs) return "duración desconocida";
  const m = Math.floor(segs / 60);
  const s = segs % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

// ─── PUERTA Y PLOMERÍA ───────────────────────────────────────────────────────

/**
 * El secreto: cabecera primero, URL como salida de emergencia. La comparación
 * es en tiempo constante por lo mismo de siempre (ver lib/acceso.js).
 */
function tokenCorrecto(req, esperado) {
  const cabecera = req.headers?.authorization || "";
  const deCabecera = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  const url = new URL(req.url ?? "/", "http://interno");
  const deUrl = url.searchParams.get("token") || "";

  for (const recibido of [deCabecera, deUrl]) {
    if (!recibido || recibido.length !== esperado.length) continue;
    let diferencia = 0;
    for (let i = 0; i < esperado.length; i++) {
      diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
    }
    if (diferencia === 0) return true;
  }
  return false;
}

async function leerCrudo(req) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  // Si algún día el runtime pre-interpreta el cuerpo, el flujo llega vacío y sin
  // esto TODAS las llamadas responderían 400. Mismo patrón que api/whatsapp.js.
  if (trozos.length === 0 && req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  return Buffer.concat(trozos).toString("utf8");
}

function responder(res, codigo, datos) {
  res.statusCode = codigo;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(datos));
}
