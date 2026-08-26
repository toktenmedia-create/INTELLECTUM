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
 * DECISIÓN DE DISEÑO, y conviene entenderla: Dapta NO documenta públicamente
 * el formato exacto de su aviso. En vez de fingir que lo conocemos, este
 * receptor es TOLERANTE: guarda el mensaje crudo COMPLETO en la bitácora
 * (recortado a un tope sano) y encima extrae lo que reconoce probando los
 * nombres de campo habituales. Si la primera llamada real trae un formato
 * sorpresa, no se pierde nada: queda el crudo para leerlo y afinar el mapeo.
 *
 * Seguridad: exige un secreto (DAPTA_WEBHOOK_TOKEN). De preferencia en la
 * cabecera Authorization; si el panel de Dapta no deja configurar cabeceras,
 * se acepta ?token= en la URL — no es lo ideal (las URL quedan en los
 * registros de Vercel, que solo ve el dueño), pero un webhook sin secreto es
 * peor: cualquiera podría inventarle llamadas al CRM. Sin la variable
 * configurada, el endpoint duerme: la regla de toda la casa.
 *
 * La duración se guarda SIEMPRE que venga: es el dato con el que se va a medir
 * el costo real por minuto antes de vender el módulo de voz en serio.
 */

import { abrirAlmacen } from "../lib/almacen.js";
import { enviarAviso } from "../lib/leads.js";
import { normalizarTelefono } from "../lib/mensajeria.js";

/** Cuánto del mensaje crudo se guarda. Suficiente para leerlo; no infinito. */
const TOPE_CRUDO = 8_000;
const TOPE_TRANSCRIPCION = 4_000;

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

  let cuerpo;
  try {
    cuerpo = JSON.parse(await leerCrudo(req));
  } catch {
    return responder(res, 400, { error: "El cuerpo no es JSON" });
  }

  const llamada = extraer(cuerpo);
  const almacen = abrirAlmacen();

  // 1. La bitácora, SIEMPRE, con el crudo adentro. Es lo que garantiza que la
  // primera llamada real se pueda estudiar aunque el mapeo no reconozca nada.
  try {
    await almacen.registrarEvento({
      tipo: "llamada_registrada",
      actor: "agente_voz",
      detalle: {
        canal: "voz",
        telefono: llamada.telefono,
        duracion_segundos: llamada.duracionSegundos,
        resultado: llamada.resultado,
        resumen: llamada.resumen?.slice(0, 500) ?? null,
        transcripcion: llamada.transcripcion?.slice(0, TOPE_TRANSCRIPCION) ?? null,
        crudo: JSON.stringify(cuerpo).slice(0, TOPE_CRUDO),
      },
    });
  } catch (err) {
    console.error("[VOZ] no se pudo anotar la llamada:", err?.message ?? err);
  }

  // 2. El lead. Solo si la llamada trae con qué: sin teléfono no hay a quién
  // seguir. Si esta persona ya llamó hace poco, no se parte en dos.
  let leadId = null;
  if (llamada.telefono) {
    try {
      const previo = await almacen.leadDeSesion?.({
        canal: "voz",
        sesion: llamada.telefono,
      });
      const edadDias = previo
        ? (Date.now() - new Date(previo.creado_en ?? 0).getTime()) / 86_400_000
        : Infinity;

      if (previo && edadDias <= 30) {
        leadId = previo.id;
        await almacen.actualizarLead?.({
          id: previo.id,
          nota: `Volvió a llamar${llamada.resumen ? `: ${llamada.resumen.slice(0, 180)}` : "."}`,
        });
      } else {
        const guardado = await almacen.guardarLead(
          {
            nombre: llamada.nombre || "",
            contacto: llamada.telefono,
            empresa: llamada.empresa || "",
            necesidad: llamada.resumen || "Llamó al agente de voz.",
            urgencia: "media",
            resumen:
              `Llamada de ${formatearDuracion(llamada.duracionSegundos)}` +
              (llamada.resultado ? ` (${llamada.resultado})` : "") +
              (llamada.resumen ? `: ${llamada.resumen.slice(0, 300)}` : "."),
          },
          { cliente: "intellectum", canal: "voz", sesion: llamada.telefono, origen: "dapta" },
        );
        leadId = guardado?.id ?? null;
      }
    } catch (err) {
      console.error("[VOZ] la llamada quedó en bitácora pero sin lead:", err?.message ?? err);
    }
  }

  // 3. El aviso al equipo. Una llamada es de lo más valioso que entra: se
  // avisa siempre, falle lo que falle arriba.
  await enviarAviso({
    asunto: `Llamada atendida por el agente de voz${llamada.nombre ? `: ${llamada.nombre}` : ""}`,
    cuerpo: [
      `Teléfono: ${llamada.telefono || "no identificado"}`,
      `Duración: ${formatearDuracion(llamada.duracionSegundos)}`,
      llamada.resultado ? `Resultado: ${llamada.resultado}` : "",
      llamada.resumen ? `` : "",
      llamada.resumen ? `Resumen: ${llamada.resumen.slice(0, 600)}` : "",
      llamada.transcripcion ? `` : "",
      llamada.transcripcion ? `— Transcripción (inicio) —` : "",
      llamada.transcripcion ? llamada.transcripcion.slice(0, 900) : "",
      ``,
      `El detalle completo quedó en el panel: www.intellectum.ec/panel`,
    ]
      .filter((l, i, todas) => l !== "" || todas[i + 1] !== "")
      .join("\n"),
  }).catch((err) => console.error("[VOZ] sin correo de aviso:", err?.message ?? err));

  return responder(res, 200, { ok: true, lead: leadId });
}

/**
 * Saca lo que se reconozca del mensaje, probando los nombres habituales.
 * Cada dato se busca en varias claves y en varios niveles: es lo que cuesta
 * integrarse contra un formato no documentado sin inventárselo.
 */
function extraer(cuerpo) {
  // Los proveedores anidan la llamada en un objeto, y las variables extraídas
  // en OTRO objeto adentro ("Recuperación de datos post-llamada" en Dapta). Se
  // aplanan las dos cosas: los contenedores típicos de la llamada y, dentro de
  // cada uno, los contenedores típicos de las variables. Sin esto, el nombre y
  // la empresa que el agente extrajo llegarían y no los veríamos.
  // "call_analysis" está CONFIRMADO en la documentación de Dapta: ahí viven
  // call_summary y el objeto con las variables extraídas.
  const CONTENEDORES = ["call", "data", "payload", "event", "body", "result", "call_analysis", "callAnalysis"];
  const CONTENEDORES_VARIABLES = [
    "extracted_data", "extractedData", "extracted_variables", "variables",
    "post_call_data", "postCallData", "analysis", "insights", "retrieved_data",
    "custom_data", "custom_analysis_data", "customAnalysisData",
    "metadata", "datos", "resultados",
  ];

  const capas = [];

  /**
   * Agrega una capa donde buscar. Acepta también un OBJETO SERIALIZADO como
   * texto: si en el flujo de Dapta un parámetro se declara de tipo texto en vez
   * de objeto, lo que llega es la cadena '{"from":"099..."}' y no el objeto. Sin
   * esto, el dato llegaría íntegro y se ignoraría por completo — el peor de los
   * fallos, porque todo parece bien configurado y el lead llega vacío.
   */
  const agregar = (x) => {
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
    if (v && typeof v === "object" && !Array.isArray(v)) capas.push(v);
  };

  agregar(cuerpo);

  // ENVOLTORIO DESCONOCIDO: si quien configura el flujo mete todo dentro de una
  // llave inventada —{"todo": {...}}, {"payload_llamada": {...}}—, ningún nombre
  // de la lista la reconocería. Cuando el cuerpo trae UNA sola llave y adentro
  // hay un objeto, se entra: no hay ambigüedad posible y ahorra una tarde de
  // "pero si lo configuré bien". Se hace dos niveles por si viene envuelto dos
  // veces, que pasa más de lo que uno creería.
  let sonda = cuerpo;
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const llaves = sonda && typeof sonda === "object" ? Object.keys(sonda) : [];
    if (llaves.length !== 1) break;
    sonda = sonda[llaves[0]];
    agregar(sonda);
  }

  for (const base of [...capas]) {
    for (const nombre of CONTENEDORES) agregar(base?.[nombre]);
  }
  // Las variables pueden colgar del cuerpo o de cualquier contenedor de arriba.
  for (const base of [...capas]) {
    for (const nombre of CONTENEDORES_VARIABLES) agregar(base?.[nombre]);
  }

  // El orden importa y es al revés de lo intuitivo: primero se prueba la CLAVE
  // en todas las capas, y después se pasa a la clave siguiente. Así el nombre
  // más preciso gana sobre el más superficial. Al revés —capa por capa— un
  // "call_summary" genérico de la capa de arriba le ganaba al "summary" que el
  // agente redactó siguiendo nuestras instrucciones, que es el que queremos.
  // Y nunca se devuelve un objeto: si el valor no es un dato, no es la respuesta.
  const buscar = (...claves) => {
    for (const clave of claves) {
      for (const capa of capas) {
        const valor = capa[clave];
        if (valor === undefined || valor === null || valor === "") continue;
        if (typeof valor === "object" && !Array.isArray(valor)) continue;
        return valor;
      }
    }
    return null;
  };

  const telefonoCrudo = buscar(
    "phone", "phone_number", "phoneNumber", "telefono", "teléfono",
    "from", "to", "caller", "customer_phone", "contact_phone", "number",
  );

  const duracion = Number(
    buscar("duration", "duration_seconds", "durationSeconds", "call_duration", "duracion", "call_length", "seconds"),
  );

  let transcripcion = buscar("transcript", "transcription", "call_transcript", "transcripcion", "messages");
  if (Array.isArray(transcripcion)) {
    // Algunos proveedores mandan la charla como lista de turnos.
    transcripcion = transcripcion
      .map((t) => `${t.role ?? t.speaker ?? "?"}: ${t.content ?? t.text ?? t.message ?? ""}`)
      .join("\n");
  }
  if (transcripcion && typeof transcripcion !== "string") transcripcion = JSON.stringify(transcripcion);

  return {
    telefono: normalizarTelefono(telefonoCrudo) || (telefonoCrudo ? String(telefonoCrudo).slice(0, 24) : null),
    duracionSegundos: Number.isFinite(duracion) && duracion > 0 ? Math.round(duracion) : null,
    resultado: texto(buscar("outcome", "status", "result", "disposition", "call_status", "resultado")),
    resumen: texto(buscar("summary", "resumen", "call_summary", "summary_text", "notes")),
    transcripcion: transcripcion || null,
    nombre: texto(buscar("name", "contact_name", "customer_name", "nombre", "lead_name")),
    empresa: texto(buscar("company", "empresa", "organization", "business")),
  };
}

function texto(v) {
  if (v === null || v === undefined) return null;
  return (typeof v === "string" ? v : JSON.stringify(v)).trim() || null;
}

function formatearDuracion(segundos) {
  if (!segundos) return "duración desconocida";
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

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
  return Buffer.concat(trozos).toString("utf8");
}

function responder(res, codigo, datos) {
  res.statusCode = codigo;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(datos));
}
