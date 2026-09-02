/**
 * EL SEGUIMIENTO A QUIEN COTIZÓ Y NO VOLVIÓ.
 *
 * Corre una vez al día, a media mañana en Ecuador. Busca a quien pidió precio
 * por WhatsApp, se quedó callado unos días y nunca fue atendido, y le manda la
 * plantilla "seguimiento_cotizacion" que Meta aprobó.
 *
 * NACE APAGADO. Sin SEGUIMIENTOS_ACTIVOS=si no sale ningún mensaje: la tarea
 * calcula a quién le escribiría, lo deja en el registro y avisa por correo, pero
 * no manda nada. Esto no es timidez — es que estos mensajes van a personas
 * reales, cuestan dinero cada uno y llevan el nombre de la empresa. Conviene
 * mirar la primera lista antes de que salga sola.
 *
 * A quién y cuándo se decide en lib/seguimiento.js, que es una función pura y
 * está probada regla por regla. Aquí solo se trae lo que hace falta de la base,
 * se manda, y se anota lo que salió.
 *
 * Anotar es obligatorio, no cosmético: el evento seguimiento_enviado es lo que
 * impide que a la misma persona se le escriba dos veces.
 */

import { abrirAlmacen } from "../lib/almacen.js";
import { elegirParaSeguimiento, TOPE_POR_TANDA, DIAS_DE_SILENCIO } from "../lib/seguimiento.js";
import { enviarSeguimientoWhatsApp, whatsappSalidaConfigurada } from "../lib/mensajeria.js";
import { enviarAviso } from "../lib/leads.js";
import { claveCorrecta } from "../lib/acceso.js";
import { CLIENTE, NEGOCIO } from "../lib/cliente.js";
import { latidoDeTarea } from "../lib/alertas.js";

export default async function handler(req, res) {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    console.warn("[SEGUIMIENTOS] sin CRON_SECRET: la tarea está dormida.");
    return res.status(503).json({ error: "No configurado" });
  }
  if (!claveCorrecta(req, esperado)) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const enSerio = process.env.SEGUIMIENTOS_ACTIVOS === "si";
  const almacen = abrirAlmacen();

  // Rastro de que el cron disparó, para /api/salud (ver lib/alertas.js).
  await latidoDeTarea({ tarea: "seguimientos", almacen, resumen: { activo: enSerio } });

  let leads = [];
  let conversaciones = [];
  let bajas = new Set();
  let yaSeguidos = new Set();
  let programados = [];
  try {
    [leads, conversaciones, bajas, yaSeguidos, programados] = await Promise.all([
      almacen.listarLeads({ limite: 500 }),
      almacen.listarConversaciones({ limite: 500 }),
      almacen.sesionesDeBaja({ canal: "whatsapp" }),
      almacen.leadsYaSeguidos({}),
      almacen.seguimientosVencidos({}),
    ]);
  } catch (err) {
    console.error("[SEGUIMIENTOS] no se pudo leer la base:", err?.message ?? err);
    return res.status(500).json({ error: "No se pudo leer la base" });
  }

  const { elegidos, descartes, recortados, motivo_general } = elegirParaSeguimiento({
    leads,
    conversaciones,
    bajas,
    yaSeguidos,
    programados,
    ahora: new Date(),
  });

  if (motivo_general === "fin_de_semana") {
    console.log("[SEGUIMIENTOS] fin de semana: no se escribe.");
    return res.status(200).json({ enviados: 0, motivo: "fin_de_semana" });
  }

  // Ensayo: se calcula todo pero no sale nada. Es el estado de fábrica.
  if (!enSerio || !whatsappSalidaConfigurada()) {
    const razon = !enSerio ? "apagado" : "whatsapp_sin_configurar";
    console.log(
      `[SEGUIMIENTOS] ENSAYO (${razon}): le escribiría a ${elegidos.length}.`,
      JSON.stringify({ elegidos, descartes }),
    );
    if (elegidos.length > 0) await avisarDelEnsayo(elegidos, razon);
    return res.status(200).json({ ensayo: true, razon, habrian_salido: elegidos.length, elegidos, descartes });
  }

  const salieron = [];
  const fallaron = [];
  for (const quien of elegidos) {
    const { entregado } = await enviarSeguimientoWhatsApp({
      para: quien.numero,
      nombre: quien.nombre,
      concepto: quien.concepto,
      bitacora: { almacen, cliente: CLIENTE },
    });

    if (!entregado) {
      fallaron.push(quien.numero);
      continue;
    }

    // Sin este apunte, mañana se le vuelve a escribir a la misma persona.
    // Por eso se anota aunque falle todo lo demás.
    try {
      await almacen.registrarEvento({
        tipo: "seguimiento_enviado",
        actor: "sistema",
        detalle: {
          canal: "whatsapp",
          lead_id: quien.lead_id,
          sesion: quien.numero,
          concepto: quien.concepto,
          dias_de_silencio: quien.dias_de_silencio,
        },
      });
    } catch (err) {
      console.error(
        `[SEGUIMIENTOS] ¡salió el mensaje a ${quien.numero} pero NO se anotó! ` +
          `Puede repetirse mañana:`,
        err?.message ?? err,
      );
    }
    salieron.push(quien);
  }

  console.log(
    `[SEGUIMIENTOS] ${salieron.length} enviados, ${fallaron.length} fallidos.`,
    JSON.stringify(descartes),
  );
  if (salieron.length > 0 || fallaron.length > 0) {
    await avisarDeLoQueSalio(salieron, fallaron).catch(() => {});
  }

  return res.status(200).json({
    enviados: salieron.length,
    fallidos: fallaron.length,
    recortados: Boolean(recortados),
    descartes,
  });
}

/** El correo del ensayo: qué habría salido, para poder decidir encenderlo. */
async function avisarDelEnsayo(elegidos, razon) {
  const lista = elegidos
    .map((e) => `· ${e.nombre} (${e.numero}) — ${e.concepto}` + (e.lo_pidio ? " — LO PIDIÓ ella misma" : `, ${e.dias_de_silencio} días callado`))
    .join("\n");
  await enviarAviso({
    asunto: `Seguimiento en ensayo: ${elegidos.length} mensaje(s) NO enviados`,
    cuerpo: [
      razon === "apagado"
        ? "El seguimiento automático está APAGADO, así que no salió ningún mensaje."
        : "WhatsApp no está configurado para salir, así que no salió ningún mensaje.",
      ``,
      `Si estuviera encendido, hoy habría escrito a ${elegidos.length} persona(s):`,
      ``,
      lista,
      ``,
      `Para encenderlo: variable SEGUIMIENTOS_ACTIVOS=si en Vercel.`,
      `Cada mensaje se cobra a tarifa de marketing de Meta.`,
    ].join("\n"),
  }).catch((err) => console.error("[SEGUIMIENTOS] sin correo de ensayo:", err?.message ?? err));
}

/** El correo de después: a quién se le escribió de verdad. */
async function avisarDeLoQueSalio(salieron, fallaron) {
  const lista = salieron
    .map((e) => `· ${e.nombre} (${e.numero}) — ${e.concepto}` + (e.lo_pidio ? " — LO PIDIÓ ella misma" : `, ${e.dias_de_silencio} días callado`))
    .join("\n");
  await enviarAviso({
    asunto: `Seguimiento enviado a ${salieron.length} persona(s)`,
    cuerpo: [
      `${NEGOCIO.agente} retomó ${salieron.length} cotización(es) que quedaron a medias:`,
      ``,
      lista || "(ninguna)",
      ``,
      fallaron.length ? `No se pudo entregar a: ${fallaron.join(", ")}` : "",
      ``,
      `Si alguien responde, la conversación sigue por WhatsApp con normalidad.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

