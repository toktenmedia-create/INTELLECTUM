/**
 * Webhook de WhatsApp Business (Meta Cloud API).
 *
 * El puente entre WhatsApp y el cerebro de la casa (lib/brain.js): misma
 * ficha, mismas reglas, misma captura de leads que el chat de la web. No hay
 * dos bots que mantener.
 *
 * Variables necesarias:
 *   META_VERIFY_TOKEN     — lo inventas tú; lo pegas igual en Meta.
 *   META_APP_SECRET       — Meta → tu app → Configuración básica.
 *   META_TOKEN            — token permanente de la cuenta de WhatsApp.
 *   META_PHONE_NUMBER_ID  — id del número emisor (lo da Meta, no es el número).
 *
 * URL del webhook registrada en Meta:  https://www.intellectum.ec/api/whatsapp
 *
 * CÓMO ESTÁ ARMADO — dos decisiones que evitan respuestas duplicadas:
 *
 * 1. Se responde 200 a Meta DE INMEDIATO y el mensaje se procesa después, en
 *    segundo plano. Si Meta no recibe el 200 en pocos segundos, da la entrega
 *    por perdida y REENVÍA el mensaje — y pensar una respuesta con Claude
 *    tarda más que esos pocos segundos. Contestar primero y trabajar después
 *    corta el problema de raíz.
 *
 * 2. Cada mensaje trae una huella única (el wamid). Antes de procesarlo se
 *    revisa en la bitácora si esa huella ya pasó por aquí; si ya pasó, se
 *    ignora. Es el cinturón para las raras veces en que Meta entrega el mismo
 *    mensaje dos veces aunque todo haya salido bien.
 */

import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { responder } from "../lib/brain.js";
import { abrirAlmacen, esPersistente } from "../lib/almacen.js";
import { prepararEntrada, GRAPH } from "../lib/multimedia.js";
import { avisarEquipoWhatsApp, enviarTextoWhatsApp } from "../lib/mensajeria.js";

// bodyParser desactivado: la firma de Meta se calcula sobre el cuerpo EXACTO
// tal como llegó, así que hay que leerlo crudo, sin que nadie lo reinterprete.
// 120 s de vida por si una foto pesada o una agenda lenta alargan la vuelta:
// el 200 a Meta ya salió, esto solo protege el trabajo en segundo plano.
export const config = { maxDuration: 120, api: { bodyParser: false } };

const MENSAJE_TROPIEZO =
  "Perdona, se me complicó procesar tu mensaje. ¿Me lo repites? Si prefieres, " +
  "escríbenos a info@intellectum.ec o llámanos al +593 98 312 0003 y el equipo te ayuda " +
  "directamente.";

const MENSAJE_BAJA =
  "Listo, queda registrado: no te escribiremos más por este medio y tu historial " +
  "de conversación quedó borrado. Si algún día quieres retomar, solo escríbenos y " +
  "con gusto te atendemos. También estamos en info@intellectum.ec.";

export default async function handler(req, res) {
  // 1. Verificación del webhook: Meta llama una sola vez con un reto.
  if (req.method === "GET") {
    const url = new URL(req.url, "https://placeholder.local");
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const reto = url.searchParams.get("hub.challenge");

    if (modo === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(reto ?? "");
      return;
    }

    res.writeHead(403).end("Token incorrecto");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end("Método no permitido");
    return;
  }

  if (!configurado()) {
    console.warn("[WHATSAPP] llegó un mensaje pero el canal no está configurado.");
    res.writeHead(503).end("Canal de WhatsApp no configurado");
    return;
  }

  // 2. Comprobar que el mensaje viene de Meta y no de un tercero.
  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers["x-hub-signature-256"])) {
    console.warn("[WHATSAPP] firma inválida, mensaje descartado.");
    res.writeHead(401).end("Firma inválida");
    return;
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch {
    res.writeHead(200).end("OK");
    return;
  }

  // Meta AGRUPA: un webhook puede traer varios entry, varios changes y varios
  // messages (pasa siempre que la persona escribe dos mensajes seguidos).
  // Quedarse con el primero pierde los demás en silencio, así que aquí se
  // recogen todos y se atienden en orden.
  const paquetes = [];
  for (const entrada of datos?.entry ?? []) {
    for (const cambio of entrada?.changes ?? []) {
      const valor = cambio?.value;
      for (const mensaje of valor?.messages ?? []) {
        // Confirmaciones de entrega, cambios de estado... no son conversación.
        if (mensaje?.from && mensaje?.id) paquetes.push({ valor, mensaje });
      }
    }
  }

  if (paquetes.length === 0) {
    res.writeHead(200).end("OK");
    return;
  }

  // 3. El 200 sale YA; el trabajo de verdad sigue en segundo plano.
  res.writeHead(200).end("OK");
  enSegundoPlano(procesarEnOrden(paquetes));
}

/**
 * Uno tras otro, nunca en paralelo: dos mensajes del mismo número procesados
 * a la vez se pisan la memoria y cruzan las respuestas. Y si uno falla, los
 * siguientes se atienden igual — ya tienen su propia disculpa si hace falta.
 */
async function procesarEnOrden(paquetes) {
  for (const { valor, mensaje } of paquetes) {
    try {
      await procesar(valor, mensaje);
    } catch (err) {
      console.error("[WHATSAPP] fallo con un mensaje del lote:", err?.message ?? err);
    }
  }
}

/** El trabajo de verdad. Corre después de haberle respondido a Meta. */
async function procesar(valor, mensaje) {
  const numero = mensaje.from;
  const nombrePerfil = valor?.contacts?.[0]?.profile?.name;

  avisarSiLaMemoriaEsFragil();
  const almacen = abrirAlmacen();

  // DE QUIÉN ES ESTE MENSAJE. Meta dice en cada webhook por cuál de nuestros
  // números entró (metadata.phone_number_id), y ese número identifica al
  // cliente. Mientras no haya un segundo cliente dado de alta —o mientras no
  // se aplique supabase/multicliente.sql— esto devuelve null y se atiende como
  // Intellectum, igual que siempre.
  const dueño = await almacen
    .clientePorTelefono?.({ phone_number_id: valor?.metadata?.phone_number_id })
    .catch(() => null);
  const cliente = dueño?.slug ?? "intellectum";

  // Con esto viaja el contador de mensajes entregados hasta lib/mensajeria.js.
  const bitacora = { almacen, cliente };

  // ¿Esta huella ya pasó por aquí? Si la bitácora no contesta, se sigue:
  // ante la duda es mejor arriesgar un duplicado rarísimo que callar siempre.
  try {
    if (await almacen.yaProcesado({ marcador: mensaje.id, cliente })) {
      console.log("[WHATSAPP] mensaje repetido, se ignora:", mensaje.id.slice(-12));
      return;
    }
    await almacen.registrarEvento({
      tipo: "mensaje_procesado",
      actor: "sistema",
      cliente,
      detalle: { canal: "whatsapp", marcador: mensaje.id },
    });
  } catch (err) {
    console.error("[WHATSAPP] no se pudo revisar duplicados:", err?.message ?? err);
  }

  // Doble check azul y "escribiendo...": la persona sabe que la escucharon.
  // Es cosmético: si falla, no detiene nada.
  marcarLeido(mensaje.id).catch(() => {});

  // "SALIR": la única palabra que no pasa por el cerebro. Se atiende aquí,
  // determinista y al instante, porque una baja no es una conversación: es un
  // derecho. Se apunta en la lista (que no caduca), se borra el historial y
  // se confirma. Si la persona vuelve a escribir después, se le responde con
  // normalidad: retomar la conversación es decisión suya.
  if (esSolicitudDeBaja(mensaje)) {
    try {
      await almacen.registrarBaja({ canal: "whatsapp", sesion: numero, cliente });
      await almacen.olvidarConversacion({ canal: "whatsapp", sesion: numero, cliente });
    } catch (err) {
      // La confirmación sale igual: la persona no tiene la culpa de que la
      // base tosa. Pero queda gritado en el registro para arreglarlo a mano.
      console.error("[BAJA] ¡no se pudo registrar la baja de", numero + "!:", err?.message ?? err);
    }
    await enviarWhatsApp(numero, MENSAJE_BAJA, { bitacora, motivo: "baja" }).catch((err) =>
      console.error("[BAJA] no se pudo confirmar:", err?.message ?? err),
    );
    return;
  }

  let entrada;
  try {
    entrada = await prepararEntrada(mensaje);
  } catch (err) {
    console.error("[WHATSAPP] no se pudo preparar la entrada:", err?.message ?? err);
    entrada = null;
  }
  if (!entrada) return; // reacciones y mensajes vacíos no se responden

  // Si la base no contesta, se responde sin memoria. Contestar sin recordar es
  // peor que recordar, pero muchísimo mejor que dejar a alguien sin respuesta.
  let historial = [];
  try {
    historial = await almacen.recordarConversacion({ canal: "whatsapp", sesion: numero, cliente });
  } catch (err) {
    console.error("[WHATSAPP] no se pudo leer la memoria:", err?.message ?? err);
  }

  try {
    const { texto: respuesta } = await responder({
      // El modelo recibe los bloques completos (con la foto o el PDF adentro)...
      historial: [...historial, { role: "user", content: entrada.bloques }],
      canal: "whatsapp",
      cliente,
      meta: { origen: `whatsapp:${nombrePerfil || numero}`, sesion: numero },
    });

    if (!respuesta) return;

    // Primero se envía y después se guarda: si fallara el orden inverso,
    // quedaría escrita una respuesta que la persona nunca recibió.
    await enviarWhatsApp(numero, respuesta, { bitacora, motivo: "respuesta" });

    // ...pero la memoria guarda solo texto. Guardar la foto en el historial
    // la volvería a mandar al modelo en cada mensaje siguiente, pagándola
    // una y otra vez sin necesidad.
    try {
      await almacen.guardarConversacion({
        canal: "whatsapp",
        cliente,
        sesion: numero,
        nombrePerfil,
        mensajes: [
          ...historial,
          { role: "user", content: entrada.memoria },
          { role: "assistant", content: respuesta },
        ],
      });
    } catch (err) {
      console.error(
        "[WHATSAPP] la respuesta salió pero no se pudo guardar la memoria:",
        err?.message ?? err,
      );
    }
  } catch (err) {
    console.error("[WHATSAPP] error procesando el mensaje:", err?.message ?? err);
    // Ya le dijimos 200 a Meta, así que nadie va a reintentar por nosotros.
    // Antes que el silencio, una disculpa honesta con el contacto del equipo.
    await enviarWhatsApp(numero, MENSAJE_TROPIEZO, { bitacora, motivo: "tropiezo" }).catch(() => {});
    // Y que el dueño se entere HOY: desde que el WhatsApp público lo atiende
    // IntelliA, un fallo aquí es un cliente perdido, no una línea de registro.
    avisarDelTropiezo(numero, err, bitacora);
  }
}

/**
 * Le avisa al equipo que un mensaje no se pudo atender.
 *
 * Con freno de diez minutos: si algo se cae de verdad (el modelo, la base,
 * Meta), pueden llegar decenas de mensajes seguidos y cien avisos no informan
 * más que uno — solo consiguen que el dueño silencie el chat, que es
 * exactamente lo contrario de lo que queremos.
 */
const ESPERA_ENTRE_AVISOS_MS = 10 * 60 * 1000;
let ultimoAviso = 0;

function avisarDelTropiezo(numero, err, bitacora) {
  const ahora = Date.now();
  if (ahora - ultimoAviso < ESPERA_ENTRE_AVISOS_MS) return;
  ultimoAviso = ahora;

  const motivo = String(err?.message ?? err ?? "desconocido").slice(0, 140);
  const ultimos = String(numero ?? "").slice(-4);
  avisarEquipoWhatsApp({
    texto:
      `no pude atender un mensaje de WhatsApp (número terminado en ${ultimos}). ` +
      `Le pedí disculpas y le di el correo y el teléfono. Motivo: ${motivo}`,
    bitacora,
  }).catch(() => {});
}

/**
 * En Vercel, waitUntil mantiene viva la función hasta que la tarea termine
 * aunque la respuesta ya haya salido. En la máquina local no existe ese
 * mecanismo, pero tampoco hace falta: el proceso no se apaga solo.
 */
function enSegundoPlano(promesa) {
  try {
    waitUntil(promesa);
  } catch {
    promesa.catch((err) => console.error("[WHATSAPP] tarea de fondo:", err?.message ?? err));
  }
}

/**
 * ¿El mensaje es una solicitud de baja? Solo cuenta si el texto COMPLETO es la
 * palabra clave ("SALIR", "salir.", "Baja!"), sin importar mayúsculas, tildes
 * ni signos. Una frase que la contenga ("quiero salir de viaje") NO es baja:
 * esa conversación la entiende el cerebro, no una lista de palabras.
 */
const PALABRAS_DE_BAJA = new Set(["salir", "baja", "stop", "unsubscribe", "no molestar"]);

function esSolicitudDeBaja(mensaje) {
  if (mensaje.type !== "text") return false;
  const texto = (mensaje.text?.body ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fuera tildes
    .replace(/[^a-z\s]/g, " ") // fuera signos y números
    .replace(/\s+/g, " ")
    .trim();
  return PALABRAS_DE_BAJA.has(texto);
}

let yaAvisado = false;

/**
 * Sin Supabase, la memoria cae en un archivo temporal que Vercel borra sin
 * horario. El canal sigue funcionando, pero conviene que quede escrito en el
 * registro: un bot que olvida a medias es más difícil de diagnosticar que uno
 * que no responde.
 */
function avisarSiLaMemoriaEsFragil() {
  if (yaAvisado || esPersistente()) return;
  yaAvisado = true;
  console.warn(
    "[WHATSAPP] sin SUPABASE_URL_INTELLECTUM/SUPABASE_SERVICE_KEY_INTELLECTUM: la memoria de las " +
      "conversaciones no sobrevive a los reinicios.",
  );
}

function configurado() {
  return Boolean(
    process.env.META_VERIFY_TOKEN &&
      process.env.META_APP_SECRET &&
      process.env.META_TOKEN &&
      process.env.META_PHONE_NUMBER_ID &&
      process.env.ANTHROPIC_API_KEY,
  );
}

/** El cuerpo tal cual llegó. Si algo ya lo interpretó, se rearma como respaldo. */
async function leerCrudo(req) {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  if (trozos.length > 0) return Buffer.concat(trozos).toString("utf8");

  if (typeof req.body === "string") return req.body;
  if (req.body) return JSON.stringify(req.body);
  return "";
}

function firmaValida(cuerpoCrudo, cabecera) {
  const firma = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  if (!firma?.startsWith("sha256=")) return false;

  const esperado = crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(cuerpoCrudo, "utf8")
    .digest("hex");

  const recibido = firma.slice("sha256=".length);
  if (recibido.length !== esperado.length) return false;

  return crypto.timingSafeEqual(Buffer.from(recibido, "hex"), Buffer.from(esperado, "hex"));
}

/** Doble check azul + "escribiendo..." mientras el cerebro piensa. */
async function marcarLeido(idMensaje) {
  await fetch(`${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: idMensaje,
      typing_indicator: { type: "text" },
    }),
  });
}

/**
 * Manda texto por el camino común de lib/mensajeria.js, que es el único que
 * cuenta lo entregado. Lanza si no salió: quien llama decide si eso es fatal
 * (la respuesta al cliente) o cosmético (una disculpa que ya venía de un
 * error). Antes esto era un fetch propio — un segundo camino a Meta que
 * ningún contador veía.
 */
async function enviarWhatsApp(numero, texto, { bitacora, motivo } = {}) {
  const envio = await enviarTextoWhatsApp({
    para: numero,
    texto: texto.slice(0, 4000),
    bitacora,
    motivo,
  });
  if (!envio.entregado) {
    throw new Error(`Meta no entregó el mensaje: ${envio.detalle ?? "sin detalle"}`);
  }
}
