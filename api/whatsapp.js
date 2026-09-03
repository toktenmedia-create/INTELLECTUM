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
import {
  avisarEquipoWhatsApp,
  enviarTextoWhatsApp,
  normalizarTelefono,
} from "../lib/mensajeria.js";
import { enviarAviso } from "../lib/leads.js";
import { calificarConversacion } from "../lib/calificar.js";
import { CLIENTE, NEGOCIO, comoEscribirnos, atiendeAlSlug } from "../lib/cliente.js";
import { alertarAlOperador } from "../lib/alertas.js";

// bodyParser desactivado: la firma de Meta se calcula sobre el cuerpo EXACTO
// tal como llegó, así que hay que leerlo crudo, sin que nadie lo reinterprete.
// 120 s de vida por si una foto pesada o una agenda lenta alargan la vuelta:
// el 200 a Meta ya salió, esto solo protege el trabajo en segundo plano.
export const config = { maxDuration: 120, api: { bodyParser: false } };

// Estos dos son funciones y no constantes porque una copia sin correo ni
// teléfono configurados no tiene esas vías: la frase se arma con lo que hay y,
// si no hay nada, se corta limpia en vez de salir con el hueco a la vista
// ("escríbenos a  o llámanos al  y el equipo te ayuda").
function mensajeTropiezo() {
  const vias = comoEscribirnos();
  const base = "Perdona, se me complicó procesar tu mensaje. ¿Me lo repites?";
  return vias ? `${base} Si prefieres, ${vias} y el equipo te ayuda directamente.` : base;
}

function mensajeBaja() {
  const base =
    "Listo, queda registrado: no te escribiremos más por este medio y tu historial " +
    "de conversación quedó borrado. Si algún día quieres retomar, solo escríbenos y " +
    "con gusto te atendemos.";
  return NEGOCIO.correo ? `${base} También estamos en ${NEGOCIO.correo}.` : base;
}

/* ── EL FRENO DEL BOLSILLO ───────────────────────────────────────────────────
 *
 * Hasta el 30 de septiembre de 2026 responder por WhatsApp dentro de la
 * ventana de 24 horas era GRATIS, así que no hacía falta contar nada. Desde el
 * 1 de octubre Meta cobra por mensaje TODAS las respuestas del asistente (los
 * "mensajes de servicio"), y en Ecuador —que Meta mete en "Resto de
 * Latinoamérica"— eso es 0,0113 USD cada una.
 *
 * El chat de la web ya tenía sus dos topes (api/chat.js) porque cada mensaje
 * costaba en Anthropic. WhatsApp no tenía NINGUNO: un número que reciba cinco
 * mil mensajes en un día genera cinco mil respuestas y nadie lo para. Antes
 * eso solo era una factura de modelo; ahora son además 56 dólares de Meta en
 * un día, de un solo cliente, sobre una mensualidad fija.
 *
 * Son dos topes porque son dos daños distintos:
 *
 *   POR PERSONA — alguien que se queda pegado escribiendo (o un bucle entre
 *   dos bots) no puede consumir el mes entero él solo. Al llegar aquí se le
 *   manda UN último mensaje que lo remite al chat de la web, que no le cuesta
 *   nada a nadie, y después silencio.
 *
 *   POR DÍA, SUMANDO A TODOS — el freno de emergencia del despliegue. Aquí NO
 *   se avisa a quien escribe: mandar el aviso sería seguir pagando mensajes,
 *   que es justo lo que se está frenando. Se le avisa al dueño, que es quien
 *   puede decidir.
 *
 * Los dos se ajustan por variable de entorno y no tocando código, porque cada
 * despliegue tiene su propio plan y su propio volumen (regla del modelo madre).
 * Los valores por defecto son deliberadamente holgados para el uso normal
 * —tres mensajes por conversación, medidos— y estrechos para el desastre.
 */
const VENTANA_TOPE_MS = 24 * 60 * 60 * 1000;
const TOPE_POR_PERSONA = Math.max(1, Number(process.env.WHATSAPP_TOPE_PERSONA) || 40);
const TOPE_POR_DIA = Math.max(1, Number(process.env.WHATSAPP_TOPE_DIARIO) || 500);

/** Cada cuánto, como mucho, se le repite al dueño que el tope diario sigue puesto. */
const ESPERA_AVISO_DIA_MS = 6 * 60 * 60 * 1000;
// Respaldo por instancia para cuando el marcador durable no se puede escribir.
let ultimoAvisoDiaEnEstaInstancia = 0;

/**
 * Cuántos adjuntos (fotos, audios, PDFs) caben en una misma ráfaga. Los
 * textos no cuentan: son gratis de preparar y pesan poco. Los adjuntos no:
 * cada uno se descarga (hasta 5 MB) y viaja entero al modelo. Veinte fotos
 * seleccionadas de golpe llegan en un solo webhook; sin este tope serían
 * veinte descargas seguidas y UNA petición con veinte imágenes dentro, que
 * puede pasarse de los 120 s o de la memoria, y al reventar se perdería la
 * ráfaga entera. Con el tope se parte en varias vueltas: más respuestas, pero
 * cada una acotada.
 */
const ADJUNTOS_POR_RAFAGA = 4;

function mensajeTopeDeLaPersona() {
  const base =
    "Hemos hablado bastante por aquí y prefiero no saturarte. Seguimos cuando " +
    "quieras, y si necesitas algo ya mismo";
  // "sin límite" sería mentira: el chat de la web tiene sus propios topes. Lo
  // que sí es cierto es que no comparte cupo con este, y que ahí no se paga
  // por mensaje. Se dice eso.
  const web = NEGOCIO.sitio ? `${NEGOCIO.sitio.replace(/\/+$/, "")}/chat` : null;
  if (web) return `${base}, escríbeme en ${web}, que ahí te atiendo enseguida.`;
  const vias = comoEscribirnos();
  return vias ? `${base}, ${vias}.` : `${base}, escríbenos de nuevo más tarde.`;
}

/**
 * ¿Le toca a ESTA copia atender los mensajes de ese cliente?
 *
 * La regla vive en lib/cliente.js (atiendeAlSlug) para poder probarse sin
 * levantar un webhook. Cada copia atiende SOLO a su propio negocio: la casa ya
 * no "reparte", porque repartir significaba contestar a los clientes de otro
 * negocio desde el número y las plantillas de Intellectum.
 */
export function estaCopiaAtiendeA(dueño) {
  return atiendeAlSlug(dueño);
}

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
  const fallidos = [];
  for (const entrada of datos?.entry ?? []) {
    for (const cambio of entrada?.changes ?? []) {
      const valor = cambio?.value;
      for (const mensaje of valor?.messages ?? []) {
        // Confirmaciones de entrega, cambios de estado... no son conversación.
        if (mensaje?.from && mensaje?.id) paquetes.push({ valor, mensaje });
      }
      // Los estados de lo que NOSOTROS mandamos. Solo interesa el "failed":
      // es la única forma de enterarse de que un mensaje que Meta aceptó
      // nunca llegó (número inválido, ventana cerrada, cuenta restringida...).
      // Antes se descartaban todos, y un número restringido no se notaba.
      for (const estado of valor?.statuses ?? []) {
        if (estado?.status === "failed") fallidos.push({ valor, estado });
      }
    }
  }

  if (paquetes.length === 0 && fallidos.length === 0) {
    res.writeHead(200).end("OK");
    return;
  }

  // 3. El 200 sale YA; el trabajo de verdad sigue en segundo plano.
  res.writeHead(200).end("OK");
  if (fallidos.length > 0) enSegundoPlano(anotarFallidos(fallidos));
  if (paquetes.length > 0) enSegundoPlano(procesarEnOrden(paquetes));
}

/**
 * Un "failed" de Meta queda en la bitácora con el código de error y le suena
 * al operador. Los códigos que más importan: 131047 (ventana de 24 h cerrada,
 * hacía falta plantilla), 131026 (número no puede recibir), 131049/131048
 * (Meta frenó el envío por calidad o por límite), 130429 (demasiado rápido).
 */
async function anotarFallidos(fallidos) {
  const almacen = abrirAlmacen();
  for (const { valor, estado } of fallidos) {
    const errores = (estado.errors ?? []).map((e) => ({
      codigo: e?.code ?? null,
      titulo: e?.title ?? null,
      detalle: e?.error_data?.details ?? e?.message ?? null,
    }));
    const codigo = errores[0]?.codigo ?? "sin_codigo";
    const detalle = {
      canal: "whatsapp",
      wamid: estado.id ?? null,
      destinatario: String(estado.recipient_id ?? "").slice(-4),
      phone_number_id: valor?.metadata?.phone_number_id ?? null,
      errores,
    };
    console.error("[WHATSAPP] Meta no pudo entregar un mensaje:", JSON.stringify(detalle));
    await almacen
      .registrarEvento({ tipo: "mensaje_no_entregado", actor: "sistema", cliente: CLIENTE, detalle })
      .catch((err) => console.error("[WHATSAPP] el fallo quedó sin evento:", err?.message ?? err));
    await alertarAlOperador({
      asunto: `Meta no entregó un mensaje (error ${codigo})`,
      cuerpo:
        `${errores[0]?.titulo ?? "sin título"}${errores[0]?.detalle ? `: ${errores[0].detalle}` : ""}. ` +
        `Destinatario terminado en ${detalle.destinatario || "?"}. Si se repite con el mismo código, ` +
        "revisa la calidad y el estado del número en Meta o consulta /api/salud.",
      clave: `estado_fallido:${codigo}`,
      almacen,
      detalle: { codigo, wamid: detalle.wamid },
    }).catch(() => {});
  }
}

/**
 * LA RÁFAGA SE CONTESTA UNA SOLA VEZ.
 *
 * Meta agrupa: cuando alguien escribe "hola", "buenas", "quiero info" en diez
 * segundos, los tres llegan en el mismo webhook. Antes cada uno se procesaba
 * por separado y salían TRES respuestas — tres vueltas del modelo y, desde el
 * 1 de octubre de 2026, tres cobros de Meta por una sola intención. Además se
 * leía raro: el asistente contestaba a "hola" mientras la persona ya había
 * preguntado otra cosa.
 *
 * Aquí los mensajes seguidos del MISMO remitente (y entrados por el mismo
 * número nuestro) se juntan en un grupo, que se atiende como si fuera un solo
 * mensaje con varias líneas. Se agrupa solo lo CONSECUTIVO: si en el lote se
 * intercalan dos personas, cada una conserva su turno y su orden.
 *
 * Ojo con lo que esto NO arregla: si Meta reparte la ráfaga en varios webhooks
 * —que pasa— cada uno llega por su lado y se contesta por su lado. Juntar eso
 * exigiría esperar unos segundos por si viene más, y esperar es otra cosa, con
 * sus propios riesgos. Esto atrapa el caso común sin cambiar el momento en que
 * se responde.
 */
export function agruparRafagas(paquetes) {
  const grupos = [];
  for (const { valor, mensaje } of paquetes) {
    const ultimo = grupos[grupos.length - 1];
    const pesa = esAdjunto(mensaje);
    const mismaPersona =
      ultimo &&
      ultimo.mensajes[0].from === mensaje.from &&
      (ultimo.valor?.metadata?.phone_number_id ?? null) ===
        (valor?.metadata?.phone_number_id ?? null);
    const cabe = mismaPersona && (!pesa || ultimo.adjuntos < ADJUNTOS_POR_RAFAGA);
    if (cabe) {
      ultimo.mensajes.push(mensaje);
      if (pesa) ultimo.adjuntos++;
    } else {
      grupos.push({ valor, mensajes: [mensaje], adjuntos: pesa ? 1 : 0 });
    }
  }
  return grupos;
}

/** Lo que hay que descargar para poder leerlo. Un sticker animado no: no se baja. */
function esAdjunto(mensaje) {
  if (mensaje.type === "sticker") return !mensaje.sticker?.animated;
  return mensaje.type === "image" || mensaje.type === "audio" || mensaje.type === "document";
}

/**
 * Varias entradas ya preparadas, una sola entrada para el cerebro.
 *
 * Si todo era texto se devuelve texto, para que el historial siga siendo
 * legible. Si en la ráfaga venía una foto o un PDF, se arma la lista de
 * bloques respetando el orden en que la persona los mandó.
 */
export function juntarEntradas(entradas) {
  if (entradas.length === 1) return entradas[0];
  const bloques = [];
  for (const e of entradas) {
    if (typeof e.bloques === "string") bloques.push({ type: "text", text: e.bloques });
    else bloques.push(...e.bloques);
  }
  const todoTexto = bloques.every((b) => b.type === "text");
  return {
    bloques: todoTexto ? bloques.map((b) => b.text).join("\n") : bloques,
    memoria: entradas.map((e) => e.memoria).join("\n"),
  };
}

/**
 * ¿Queda cupo para contestarle a esta persona?
 *
 * Cuenta lo ENTREGADO en las últimas 24 horas contra los dos topes. La cuenta
 * sale de la bitácora, que ya registraba cada envío con su sesión desde antes
 * de que esto existiera (lib/mensajeria.js) — no hubo que inventar contador.
 *
 * Devuelve el motivo del corte, o null si se puede seguir.
 *
 * Si la base NO CONTESTA se deja pasar, a propósito y como en el resto del
 * archivo: durante una caída de Supabase, callar al asistente le cuesta al
 * negocio más que el puñado de mensajes que se escapen. Queda gritado en el
 * registro.
 */
export async function revisarCupo({ almacen, cliente, numero }) {
  const desde = new Date(Date.now() - VENTANA_TOPE_MS).toISOString();
  // El que ANOTA la entrega guarda el número ya normalizado (lib/mensajeria.js:
  // enviarTextoWhatsApp), así que el que CUENTA tiene que buscar por el mismo.
  // Con los números de Ecuador que manda Meta los dos coinciden hoy, pero por
  // casualidad y no por diseño: si alguna vez dejan de coincidir, este contador
  // no encontraría nada y el tope por persona no frenaría a nadie.
  const sesion = normalizarTelefono(numero) ?? numero;
  let deLaPersona;
  let delDia;
  try {
    [deLaPersona, delDia] = await Promise.all([
      almacen.contarEventos({
        cliente,
        tipo: "mensaje_entregado",
        sesion,
        desde,
        tope: TOPE_POR_PERSONA + 1,
      }),
      almacen.contarEventos({
        cliente,
        tipo: "mensaje_entregado",
        desde,
        tope: TOPE_POR_DIA + 1,
      }),
    ]);
  } catch (err) {
    console.error("[TOPE] no se pudo contar lo entregado, se atiende igual:", err?.message ?? err);
    return null;
  }

  if (delDia >= TOPE_POR_DIA) return { motivo: "dia", entregados: delDia };
  if (deLaPersona >= TOPE_POR_PERSONA) return { motivo: "persona", entregados: deLaPersona };
  return null;
}

/**
 * Uno tras otro, nunca en paralelo: dos mensajes del mismo número procesados
 * a la vez se pisan la memoria y cruzan las respuestas. Y si uno falla, los
 * siguientes se atienden igual — ya tienen su propia disculpa si hace falta.
 */
async function procesarEnOrden(paquetes) {
  for (const { valor, mensajes } of agruparRafagas(paquetes)) {
    try {
      await procesar(valor, mensajes);
    } catch (err) {
      console.error("[WHATSAPP] fallo con un mensaje del lote:", err?.message ?? err);
    }
  }
}

/** El trabajo de verdad. Corre después de haberle respondido a Meta. */
async function procesar(valor, mensajes) {
  const numero = mensajes[0].from;
  // En un lote pueden venir mensajes de varios números: el nombre de perfil se
  // busca por wa_id para no colgarle a alguien el nombre de otro remitente.
  const contacto = valor?.contacts?.find((c) => c?.wa_id === numero) ?? valor?.contacts?.[0];
  const nombrePerfil = contacto?.profile?.name;

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

  // Un cliente dado de baja NO se atiende como el dueño de esta copia: sus
  // clientes recibirían respuestas de otro negocio, con otra ficha y otros
  // precios. Se calla y se deja constancia. Que no haya enrutamiento (columna
  // sin aplicar, número sin registrar) sí es el caso normal: ahí atiende el
  // dueño de la copia, que es como funcionaba antes de que esto existiera.
  if (dueño && dueño.activo === false) {
    console.warn(`[WHATSAPP] llegó un mensaje al número de "${dueño.slug}", que está desactivado. Se ignora.`);
    return;
  }

  // Y NO SE ATIENDE A UN CLIENTE QUE NO ES EL DE ESTA COPIA. Los datos se
  // enrutan por número de teléfono y la identidad se decide por variable de
  // entorno, y hasta aquí nada obligaba a que ambas coincidieran: un
  // whatsapp_phone_id mal pegado en la fila de un cliente bastaba para que los
  // mensajes de un negocio se atendieran con la ficha, la agenda y los precios
  // de otro, sin un solo error en el registro.
  //
  // La copia de casa SÍ enruta a otros: hay una sola app de Meta y su webhook
  // apunta aquí, así que es la que reparte. Una copia ajena solo se atiende a
  // sí misma; si el número no es suyo, es un error de configuración y callarse
  // es la respuesta correcta.
  if (!estaCopiaAtiendeA(dueño?.slug)) {
    console.error(
      `[WHATSAPP] el número por el que entró este mensaje es de "${dueño.slug}", pero esta copia es de "${CLIENTE}". ` +
        "Apunta el webhook de ese número a su propia copia (o corrige whatsapp_phone_id en la tabla clientes). No se responde.",
    );
    alertarAlOperador({
      asunto: "Un mensaje de WhatsApp entró por la copia equivocada",
      cuerpo: `El número está registrado a "${dueño.slug}" y esta copia es de "${CLIENTE}". Se dejó sin responder.`,
      clave: "copia_equivocada",
      almacen,
    }).catch(() => {});
    return;
  }

  // Y TAMPOCO SE RESPONDE DESDE EL NÚMERO EQUIVOCADO. La respuesta sale por
  // META_PHONE_NUMBER_ID, el de esta copia. Si el mensaje entró por otro
  // número (Meta lo dice en metadata.phone_number_id), contestar significaría
  // que el cliente escribió a un WhatsApp y recibió respuesta desde otro. Eso
  // pasa cuando dos números comparten una app de Meta y el webhook apunta a
  // una sola copia: el arreglo es apuntar cada número a su copia.
  const entroPor = String(valor?.metadata?.phone_number_id ?? "").trim();
  const propio = String(process.env.META_PHONE_NUMBER_ID ?? "").trim();
  if (entroPor && propio && entroPor !== propio) {
    console.error(
      `[WHATSAPP] el mensaje entró por el número ${entroPor} y esta copia responde desde ${propio}: ` +
        "no se responde para no contestar desde el número equivocado.",
    );
    alertarAlOperador({
      asunto: "Un mensaje de WhatsApp entró por un número que no es el de esta copia",
      cuerpo: `Entró por ${entroPor}; esta copia manda desde ${propio}. Apunta el webhook de ese número a su propia copia.`,
      clave: "numero_ajeno",
      almacen,
    }).catch(() => {});
    return;
  }
  const cliente = dueño?.slug ?? CLIENTE;

  // Con esto viaja el contador de mensajes entregados hasta lib/mensajeria.js.
  const bitacora = { almacen, cliente };

  // ¿Estas huellas ya pasaron por aquí? Se revisa UNA POR UNA aunque vengan en
  // ráfaga: Meta puede reenviar el lote entero por un 200 que se perdió, y en
  // ese reenvío puede venir mezclado algún mensaje nuevo. Descartar el grupo
  // completo por el primer repetido perdería ese mensaje nuevo en silencio.
  // Si la bitácora no contesta, se sigue: ante la duda es mejor arriesgar un
  // duplicado rarísimo que callar siempre.
  const nuevos = [];
  for (const mensaje of mensajes) {
    try {
      if (await almacen.yaProcesado({ marcador: mensaje.id, cliente })) {
        console.log("[WHATSAPP] mensaje repetido, se ignora:", mensaje.id.slice(-12));
        continue;
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
    nuevos.push(mensaje);
  }
  if (nuevos.length === 0) return;
  mensajes = nuevos;

  // ¿Quién atiende este hilo? Se pregunta ANTES del "escribiendo…" y de leer
  // la memoria: en manos humanas el bot calla y no debe prometer respuesta.
  let modo = "bot";
  try {
    modo =
      (await almacen.modoConversacion?.({ canal: "whatsapp", sesion: numero, cliente })) ?? "bot";
  } catch (err) {
    console.warn("[WHATSAPP] no se pudo leer el modo (se atiende como bot):", err?.message ?? err);
  }

  // EL FRENO, antes de gastar. Se CONSULTA aquí y se APLICA más abajo, después
  // de la baja: descargar la foto, pensar la respuesta y entregarla cuestan los
  // tres, y ninguno hace falta si ya no hay cupo. Se consulta antes del
  // "escribiendo…" para no encender un aviso de respuesta que no va a llegar.
  // En manos humanas no se consulta: el bot no manda nada, no hay qué frenar.
  const corte = modo === "humano" ? null : await revisarCupo({ almacen, cliente, numero });

  // Doble check azul: la persona sabe que la escucharon, tenga cupo o no. El
  // "escribiendo…" solo cuando de verdad viene respuesta — en manos humanas o
  // sin cupo sería prometer algo que no llega. Es cosmético: si falla, no
  // detiene nada. El último del grupo: marcar leído el más reciente da por
  // leídos los anteriores, y el "escribiendo…" se enciende una vez por ráfaga.
  marcarLeido(mensajes[mensajes.length - 1].id, {
    escribiendo: modo !== "humano" && !corte,
  }).catch(() => {});

  // "SALIR": la única palabra que no pasa por el cerebro. Se atiende aquí,
  // determinista y al instante, porque una baja no es una conversación: es un
  // derecho. Se apunta en la lista (que no caduca), se borra el historial y
  // se confirma. Si la persona vuelve a escribir después, se le responde con
  // normalidad: retomar la conversación es decisión suya.
  // Basta con que UNO de la ráfaga pida la baja. Es un derecho, no una
  // conversación: si alguien escribe "gracias" y enseguida "salir", lo que
  // manda es el "salir", y no se le contesta nada más.
  if (mensajes.some((m) => esSolicitudDeBaja(m))) {
    // La baja también suelta el volante: sin esto, quien vuelva algún día se
    // encontraría con un bot mudo en vez de la atención normal que promete la
    // confirmación. Va ANTES del borrado porque en Supabase cambiar el modo
    // exige que la fila todavía exista.
    if (modo === "humano") {
      try {
        await almacen.cambiarModo?.({ canal: "whatsapp", sesion: numero, cliente, modo: "bot" });
      } catch (err) {
        console.error("[BAJA] no se pudo soltar el modo humano:", err?.message ?? err);
      }
    }
    try {
      await almacen.registrarBaja({ canal: "whatsapp", sesion: numero, cliente });
      await almacen.olvidarConversacion({ canal: "whatsapp", sesion: numero, cliente });
    } catch (err) {
      // La confirmación sale igual: la persona no tiene la culpa de que la
      // base tosa. Pero queda gritado en el registro para arreglarlo a mano.
      console.error("[BAJA] ¡no se pudo registrar la baja de", numero + "!:", err?.message ?? err);
    }
    await enviarWhatsApp(numero, mensajeBaja(), { bitacora, motivo: "baja" }).catch((err) =>
      console.error("[BAJA] no se pudo confirmar:", err?.message ?? err),
    );
    return;
  }

  // EL FRENO se aplica aquí, después de la baja: no se le niega a nadie por
  // haber hablado mucho. Lo consultado arriba se ejecuta ahora.
  if (corte) {
    console.warn(
      `[TOPE] ${corte.motivo === "dia" ? "tope diario del despliegue" : "tope de la persona"} ` +
        `alcanzado (${corte.entregados} entregados en 24 h). No se responde.`,
    );

    if (corte.motivo === "dia") {
      // NO se le avisa a quien escribe: el aviso sería otro mensaje pagado,
      // multiplicado por toda la gente que siga escribiendo, que es exactamente
      // la sangría que este tope existe para cortar. Se le avisa al dueño, que
      // es quien puede subir el tope o averiguar qué pasa.
      //
      // Con marcador durable: el freno de alertarAlOperador vive en la memoria
      // de UNA instancia de Vercel (lib/alertas.js) y el tráfico se reparte
      // entre varias. Sin esto, el aviso —que sale por WhatsApp, y WhatsApp se
      // paga— se repetiría una vez por instancia: el freno de emergencia
      // gastando en lo que vino a frenar.
      let avisar = true;
      try {
        avisar =
          (await almacen.contarEventos({
            cliente,
            tipo: "tope_dia_avisado",
            desde: new Date(Date.now() - ESPERA_AVISO_DIA_MS).toISOString(),
            tope: 1,
          })) === 0;
        if (avisar) {
          await almacen.registrarEvento({
            tipo: "tope_dia_avisado",
            actor: "sistema",
            cliente,
            detalle: { canal: "whatsapp", entregados: corte.entregados, tope: TOPE_POR_DIA },
          });
        }
      } catch (err) {
        // Que el dueño se entere de que su asistente está mudo vale más que
        // el riesgo de un aviso repetido — pero acotado: sin marcador durable,
        // esta instancia avisa como mucho una vez cada ESPERA_AVISO_DIA_MS. El
        // freno de diez minutos de alertarAlOperador, solo, dejaba salir un
        // aviso pagado por instancia cada diez minutos mientras durara el fallo.
        console.error("[TOPE] marcador del aviso diario ilegible:", err?.message ?? err);
        avisar = Date.now() - ultimoAvisoDiaEnEstaInstancia > ESPERA_AVISO_DIA_MS;
      }

      if (avisar) {
        ultimoAvisoDiaEnEstaInstancia = Date.now();
        // La cifra de verdad, solo ahora que se va a avisar (una vez cada seis
        // horas, no en cada mensaje frenado). revisarCupo deja de contar en
        // TOPE + 1 porque para frenar no necesita más, pero para DECIDIR el
        // dueño sí: "501 con el tope en 500" parece un buen día; "5.000" es un
        // bucle. Si ni con esto se llega al fondo, se dice "más de".
        const techo = TOPE_POR_DIA * 20;
        let entregados = corte.entregados;
        try {
          entregados = await almacen.contarEventos({
            cliente,
            tipo: "mensaje_entregado",
            desde: new Date(Date.now() - VENTANA_TOPE_MS).toISOString(),
            tope: techo,
          });
        } catch {
          // se avisa con la cifra que hay
        }
        const cifra = entregados >= techo ? `más de ${techo}` : String(entregados);
        await alertarAlOperador({
          asunto: "WhatsApp llegó al tope diario y dejó de responder",
          cuerpo:
            `Se entregaron ${cifra} mensajes en las últimas 24 horas y el tope está en ` +
            `${TOPE_POR_DIA}. El asistente no está respondiendo por WhatsApp. Si es tráfico real, ` +
            "sube WHATSAPP_TOPE_DIARIO en las variables del despliegue; si no lo es, mira quién " +
            "está escribiendo antes de subirlo.",
          clave: "tope_diario_whatsapp",
          almacen,
          detalle: { entregados, tope: TOPE_POR_DIA },
        }).catch(() => {});
      }
      return;
    }

    // Tope de la persona: UN mensaje de despedida y nada más. El marcador se
    // escribe ANTES de mandarlo y solo se manda si quedó escrito. Al revés
    // —mandar y no poder anotar— la despedida volvería a salir con cada mensaje
    // siguiente: seguir pagando por decir que ya no se paga. Si no se puede ni
    // leer ni anotar, se calla, que es el lado barato de la duda.
    let anotado = false;
    try {
      const yaSeDespidio =
        (await almacen.contarEventos({
          cliente,
          tipo: "tope_avisado",
          sesion: numero,
          desde: new Date(Date.now() - VENTANA_TOPE_MS).toISOString(),
          tope: 1,
        })) > 0;
      if (!yaSeDespidio) {
        await almacen.registrarEvento({
          tipo: "tope_avisado",
          actor: "sistema",
          cliente,
          detalle: { canal: "whatsapp", sesion: numero, entregados: corte.entregados },
        });
        anotado = true;
      }
    } catch (err) {
      console.error("[TOPE] sin marcador no se despide:", err?.message ?? err);
    }

    if (anotado) {
      // Lo que escribió queda en el historial UNA vez: justo ahora, cuando se
      // le despide. Si alguien toma el volante desde el panel ve dónde se
      // cortó y qué pedía. Solo esta vez, y solo el texto: el almacén guarda
      // apenas los últimos 16 mensajes (lib/almacen.js), y anexar cada ráfaga
      // posterior de "¿hola? ¿sigues ahí?" empujaría fuera la conversación de
      // verdad —la cotización, la cita— justo la que el humano necesita ver.
      // Bajar la foto o transcribir el audio se paga; frenar no puede costar
      // lo que cuesta atender, así que los adjuntos quedan como una etiqueta.
      const dicho = mensajes
        .map((m) => (m.type === "text" ? m.text?.body?.trim().slice(0, 2000) : "[Envió un adjunto]"))
        .filter(Boolean)
        .join("\n");
      if (dicho) {
        try {
          const base = await almacen.recordarConversacion({ canal: "whatsapp", sesion: numero, cliente });
          await almacen.anexarMensajes({
            canal: "whatsapp",
            cliente,
            sesion: numero,
            nombrePerfil,
            base,
            nuevos: [{ role: "user", content: dicho }],
          });
        } catch (err) {
          console.error("[TOPE] no se pudo guardar lo que escribió:", err?.message ?? err);
        }
      }
      await enviarWhatsApp(numero, mensajeTopeDeLaPersona(), {
        bitacora,
        motivo: "tope_persona",
      }).catch((err) => console.error("[TOPE] no se pudo avisar del tope:", err?.message ?? err));
    }
    return;
  }

  // Cada mensaje de la ráfaga se prepara por su lado (una puede ser foto y
  // otra texto) y después se juntan en una sola entrada. Los que no se pueden
  // preparar —reacciones, mensajes vacíos— se caen del grupo sin tumbarlo.
  const entradas = [];
  for (const mensaje of mensajes) {
    try {
      const preparada = await prepararEntrada(mensaje);
      if (preparada) entradas.push(preparada);
    } catch (err) {
      console.error("[WHATSAPP] no se pudo preparar la entrada:", err?.message ?? err);
    }
  }
  if (entradas.length === 0) return; // reacciones y mensajes vacíos no se responden
  const entrada = juntarEntradas(entradas);

  // Si la base no contesta, se responde sin memoria. Contestar sin recordar es
  // peor que recordar, pero muchísimo mejor que dejar a alguien sin respuesta.
  let historial = [];
  try {
    historial = await almacen.recordarConversacion({ canal: "whatsapp", sesion: numero, cliente });
  } catch (err) {
    console.error("[WHATSAPP] no se pudo leer la memoria:", err?.message ?? err);
  }

  // La conversación está en manos humanas: el bot calla. El mensaje se anexa
  // al historial para que el panel lo muestre y se le avisa al dueño, que es
  // quien responde ahora.
  if (modo === "humano") {
    try {
      await almacen.anexarMensajes({
        canal: "whatsapp",
        cliente,
        sesion: numero,
        nombrePerfil,
        base: historial,
        nuevos: [{ role: "user", content: entrada.memoria }],
      });
    } catch (err) {
      console.error("[WHATSAPP] no se pudo guardar el mensaje en manos humanas:", err?.message ?? err);
    }
    await avisarManosHumanas({
      numero,
      nombrePerfil,
      texto: entrada.memoria,
      bitacora,
      almacen,
      cliente,
    });
    return;
  }

  try {
    const { texto: respuesta, leadTocado } = await responder({
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
    // una y otra vez sin necesidad. Se ANEXA sobre una relectura: durante la
    // vuelta del modelo (segundos) pudo escribir el panel u otro webhook, y
    // guardar la copia vieja les borraría el mensaje.
    try {
      await almacen.anexarMensajes({
        canal: "whatsapp",
        cliente,
        sesion: numero,
        nombrePerfil,
        base: historial,
        nuevos: [
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

    // La ficha que se escribe sola: solo si la vuelta ESCRIBIÓ ficha de
    // verdad (un rebote de herramienta no enciende la señal). Ya estamos en
    // segundo plano; si falla, calificar se lo traga y lo deja en el registro.
    if (leadTocado) {
      await calificarConversacion({
        almacen,
        cliente,
        canal: "whatsapp",
        sesion: numero,
        historial: [
          ...historial,
          { role: "user", content: entrada.memoria },
          { role: "assistant", content: respuesta },
        ],
      });
    }
  } catch (err) {
    console.error("[WHATSAPP] error procesando el mensaje:", err?.message ?? err);
    // Ya le dijimos 200 a Meta, así que nadie va a reintentar por nosotros.
    // Antes que el silencio, una disculpa honesta con el contacto del equipo.
    await enviarWhatsApp(numero, mensajeTropiezo(), { bitacora, motivo: "tropiezo" }).catch(() => {});
    // Y que el dueño se entere HOY: desde que el WhatsApp público lo atiende
    // IntelliA, un fallo aquí es un cliente perdido, no una línea de registro.
    avisarDelTropiezo(numero, err, bitacora);
  }
}

/**
 * Le avisa al operador que un mensaje no se pudo atender.
 *
 * Va por lib/alertas.js, que trae su propio freno de diez minutos por motivo:
 * si algo se cae de verdad (el modelo, la base, Meta) pueden llegar decenas
 * de mensajes seguidos, y cien avisos no informan más que uno. Antes salía
 * solo por WhatsApp y con el freno en la memoria de la instancia; ahora sale
 * por todos los canales configurados y deja evento en la bitácora.
 */
function avisarDelTropiezo(numero, err, bitacora) {
  const motivo = String(err?.message ?? err ?? "desconocido").slice(0, 140);
  const ultimos = String(numero ?? "").slice(-4);
  alertarAlOperador({
    asunto: "Un mensaje de WhatsApp no se pudo atender",
    cuerpo:
      `Número terminado en ${ultimos}. Se le pidió disculpas y se le dio el contacto del equipo. ` +
      `Motivo: ${motivo}`,
    clave: "tropiezo",
    almacen: bitacora?.almacen ?? null,
  }).catch(() => {});
}

/**
 * El aviso de "te escribieron y esta conversación la llevas tú", con dos
 * vallas: un freno de cinco minutos por número (seis mensajes seguidos no son
 * seis avisos pagados, y el volumen lo controla un tercero) y un rastro en la
 * bitácora si ningún canal lo pudo entregar — un mensaje esperando respuesta
 * humana no puede quedar en silencio Y sin registro a la vez. Los mensajes
 * frenados igual quedan guardados en el historial y en la alerta del panel.
 */
const ESPERA_AVISO_MANOS_MS = 60 * 60 * 1000; // un aviso por hora por persona
const avisosManos = new Map(); // número → cuándo se avisó por última vez (por instancia)

export async function avisarManosHumanas({ numero, nombrePerfil, texto, bitacora, almacen, cliente }) {
  // EL FRENO DE ESTE AVISO ES DURABLE, y es el único tope que tiene una
  // conversación en manos humanas: el bot no responde, así que el freno del
  // bolsillo no la mira, pero ESTE aviso sale por WhatsApp y WhatsApp se paga.
  // Decisión de Paul (3 sep 2026): un aviso por hora por persona. El marcador
  // vive en la bitácora, porque el mapa de la instancia no ve lo que avisaron
  // las demás instancias de Vercel; el mapa queda solo de respaldo para cuando
  // la bitácora no contesta.
  const ahora = Date.now();
  let avisar;
  try {
    avisar =
      (await almacen.contarEventos({
        cliente,
        tipo: "aviso_manos",
        sesion: numero,
        desde: new Date(ahora - ESPERA_AVISO_MANOS_MS).toISOString(),
        tope: 1,
      })) === 0;
    if (avisar) {
      await almacen.registrarEvento({
        tipo: "aviso_manos",
        actor: "sistema",
        cliente,
        detalle: { canal: "whatsapp", sesion: numero },
      });
    }
  } catch (err) {
    // Sin bitácora, el freno de la instancia: que el equipo se entere de que
    // alguien espera vale más que el riesgo de un aviso repetido, acotado.
    console.error("[WHATSAPP] marcador del aviso de manos humanas ilegible:", err?.message ?? err);
    avisar = ahora - (avisosManos.get(numero) ?? 0) >= ESPERA_AVISO_MANOS_MS;
  }
  if (!avisar) return;
  avisosManos.set(numero, ahora);
  if (avisosManos.size > 500) avisosManos.clear(); // que el mapa no crezca sin fin

  // En una sola línea: la vía de plantilla de Meta (el respaldo cuando la
  // ventana de 24 h está cerrada) rechaza parámetros con saltos de línea.
  const resumen = (typeof texto === "string" ? texto : "(multimedia)")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const quien = nombrePerfil || `+${numero}`;

  let entregado = false;
  try {
    const aviso = await avisarEquipoWhatsApp({
      texto: `${quien} escribió y la conversación está en tus manos: "${resumen}". Respóndele desde el panel.`,
      bitacora,
    });
    entregado = Boolean(aviso?.entregado);
    if (!entregado) {
      const correo = await enviarAviso({
        asunto: "Mensaje de WhatsApp esperando tu respuesta",
        cuerpo:
          `${quien} escribió y su conversación está en manos humanas (el bot no responde):\n\n` +
          `"${resumen}"\n\nRespóndele desde el panel de ${NEGOCIO.nombreCorto}.`,
      });
      entregado = Boolean(correo?.entregado);
    }
  } catch (err) {
    console.error("[WHATSAPP] el aviso de manos humanas tropezó:", err?.message ?? err);
  }
  if (!entregado) {
    console.error("[WHATSAPP] ningún canal pudo avisar del mensaje en manos humanas de", quien);
    await almacen
      .registrarEvento({
        tipo: "aviso_fallido",
        actor: "sistema",
        cliente,
        detalle: { canal: "whatsapp", sesion: numero, motivo: "manos_humanas" },
      })
      .catch(() => {});
  }
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
async function marcarLeido(idMensaje, { escribiendo = true } = {}) {
  const cuerpo = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: idMensaje,
  };
  // El "escribiendo…" solo cuando el bot va a responder: mostrarlo con la
  // conversación en manos humanas es prometer una respuesta que no viene.
  if (escribiendo) cuerpo.typing_indicator = { type: "text" };
  await fetch(`${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
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
