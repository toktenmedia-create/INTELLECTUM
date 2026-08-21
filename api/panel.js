/**
 * GET/POST /api/panel  →  los datos del panel privado (/panel).
 *
 * Mismo criterio de seguridad que api/privado.js: una clave compartida en la
 * cabecera (Authorization: Bearer <AGENTE_PRIVADO_TOKEN>), porque el único
 * usuario es el dueño. El día que haya más usuarios, esto se reemplaza por el
 * inicio de sesión de Supabase.
 *
 * Vistas (GET ?vista=...):
 *   resumen         — los números de arriba del panel y los últimos eventos.
 *   leads           — lista (con ?texto= busca).
 *   conversaciones  — lista de conversaciones, la más reciente primero.
 *   conversacion    — los mensajes de una (?canal=...&sesion=...).
 *   citas           — las citas de los próximos 14 días.
 *   horarios        — las horas libres para agendar o mover una cita.
 *   eventos         — la bitácora.
 *
 * Acciones (POST {accion:...}):
 *   lead            — actualiza el estado o la nota de un lead.
 *   cancelar_cita   — cancela una cita por su código (emergencias). Le avisa al
 *                     cliente por correo, con disculpa y pedido de reagendar.
 *   responder       — manda un mensaje escrito a mano a una conversación de
 *                     WhatsApp. Solo entra dentro de la ventana de 24 horas de
 *                     Meta; fuera de ella se devuelve motivo "ventana".
 *   mover_cita      — mueve una cita a otra hora libre. Al cliente le llega la
 *                     invitación nueva por correo y el aviso por WhatsApp.
 */

import { abrirAlmacen, esPersistente, dondeSeGuarda } from "../lib/almacen.js";
import {
  agendaConfigurada,
  citasProximas,
  buscarPorCodigo,
  cancelarCita,
  moverCita,
  horariosLibres,
  inicioDesdeCodigo,
  invitacionICS,
} from "../lib/calendario.js";
import { enviarConfirmacionCita } from "../lib/leads.js";
import { enviarCancelacionWhatsApp, enviarTextoWhatsApp } from "../lib/mensajeria.js";

export const config = { maxDuration: 30 };

const ESTADOS_VALIDOS = new Set(["nuevo", "contactado", "en_conversacion", "ganado", "perdido"]);
const ESTADOS_ABIERTOS = new Set(["nuevo", "contactado", "en_conversacion"]);

export default async function handler(req, res) {
  const esperado = process.env.AGENTE_PRIVADO_TOKEN;
  if (!esperado) {
    return responderJson(res, 503, { error: "El panel está apagado: falta AGENTE_PRIVADO_TOKEN." });
  }
  if (!claveCorrecta(req, esperado)) {
    return responderJson(res, 401, { error: "No autorizado" });
  }

  const url = new URL(req.url ?? "/", "http://interno");
  const almacen = abrirAlmacen();

  try {
    if (req.method === "POST") {
      const cuerpo = await leerJson(req);

      if (cuerpo?.accion === "lead") {
        const estado = cuerpo.estado === undefined ? undefined : String(cuerpo.estado);
        if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
          return responderJson(res, 400, { error: "Estado inválido" });
        }
        const nota = cuerpo.nota === undefined ? undefined : String(cuerpo.nota).slice(0, 2000);

        // Etiquetas: lista corta de palabras del dueño, sin duplicados.
        const etiquetas =
          cuerpo.etiquetas === undefined
            ? undefined
            : [
                ...new Set(
                  (Array.isArray(cuerpo.etiquetas) ? cuerpo.etiquetas : [])
                    .map((e) => String(e).trim().toLowerCase().slice(0, 30))
                    .filter(Boolean),
                ),
              ].slice(0, 10);

        // Valor estimado en dólares. Nulo = "sin estimar", que no es cero.
        let valor_estimado;
        if (cuerpo.valor_estimado !== undefined) {
          if (cuerpo.valor_estimado === null || cuerpo.valor_estimado === "") {
            valor_estimado = null;
          } else {
            valor_estimado = Number(cuerpo.valor_estimado);
            if (!Number.isFinite(valor_estimado) || valor_estimado < 0 || valor_estimado > 99_999_999) {
              return responderJson(res, 400, { error: "Valor inválido" });
            }
          }
        }

        const motivo_perdida =
          cuerpo.motivo_perdida === undefined ? undefined : String(cuerpo.motivo_perdida).slice(0, 300);

        try {
          const lead = await almacen.actualizarLead({
            id: String(cuerpo.id ?? ""),
            estado,
            nota,
            etiquetas,
            valor_estimado,
            motivo_perdida,
          });
          if (!lead) return responderJson(res, 404, { error: "Ese lead no existe" });
          return responderJson(res, 200, { lead });
        } catch (err) {
          // Hasta que se corra supabase/crm.sql, la base no conoce las columnas
          // nuevas. Mejor decirlo con claridad que devolver un error genérico.
          if (/does not exist|column/i.test(String(err?.message))) {
            return responderJson(res, 400, {
              error: "Falta aplicar supabase/crm.sql en la base (Supabase → SQL Editor).",
            });
          }
          throw err;
        }
      }

      if (cuerpo?.accion === "responder") {
        const canal = String(cuerpo.canal ?? "");
        const sesion = String(cuerpo.sesion ?? "").trim();
        const texto = String(cuerpo.texto ?? "").trim().slice(0, 3500);
        if (canal !== "whatsapp") {
          return responderJson(res, 400, { error: "Solo se puede responder a mano por WhatsApp" });
        }
        if (!sesion || !texto) {
          return responderJson(res, 400, { error: "Falta el número o el mensaje" });
        }

        const envio = await enviarTextoWhatsApp({ para: sesion, texto });
        if (!envio.entregado) {
          // 131047 es el código de Meta para "fuera de la ventana de 24 horas".
          const ventana = String(envio.detalle ?? "").includes("131047");
          return responderJson(res, 200, { ok: false, motivo: ventana ? "ventana" : "envio" });
        }

        // Primero se envía y después se guarda: nunca queda escrito en la
        // memoria un mensaje que la persona no recibió. Si el guardado falla,
        // el mensaje igual salió; solo se pierde la constancia.
        let guardado = true;
        try {
          const historial = await almacen.recordarConversacion({ canal, sesion });
          await almacen.guardarConversacion({
            canal,
            sesion,
            mensajes: [...historial, { role: "assistant", content: texto, via: "panel" }],
          });
        } catch (err) {
          console.error("[PANEL] la respuesta salió pero no se pudo guardar:", err?.message ?? err);
          guardado = false;
        }

        await almacen
          .registrarEvento({
            tipo: "herramienta_ejecutada",
            actor: "panel",
            detalle: { herramienta: "responder", canal, sesion, guardado },
          })
          .catch(() => {});

        return responderJson(res, 200, { ok: true, guardado });
      }

      if (cuerpo?.accion === "mover_cita") {
        if (!agendaConfigurada()) return responderJson(res, 400, { error: "La agenda no está conectada" });

        const cita = await buscarPorCodigo(cuerpo.codigo);
        if (!cita) return responderJson(res, 404, { error: "Esa cita ya no existe o ya fue cancelada" });

        const nuevoInicio = inicioDesdeCodigo(String(cuerpo.nueva_hora ?? ""));
        if (!nuevoInicio) return responderJson(res, 400, { error: "Esa hora nueva no es válida" });

        const movida = await moverCita(cita, nuevoInicio);
        if (!movida.ok) return responderJson(res, 200, { ok: false, motivo: movida.motivo });

        // Igual que al cancelar: los avisos salen después de mover y nunca
        // deshacen nada. Si fallan, la cita igual quedó movida y el panel
        // avisa que hay que escribirle a mano.
        const promesaCorreo = (cita.contacto || "").includes("@")
          ? enviarConfirmacionCita({
              para: cita.contacto,
              nombre: cita.nombre,
              cuando: movida.etiqueta,
              codigo: cita.codigo,
              cambio: "movida",
              ics: invitacionICS({
                inicioISO: movida.inicio,
                finISO: movida.fin,
                nombre: cita.nombre,
                id: cita.id,
                secuencia: movida.secuencia,
              }),
            })
              .then((r) => Boolean(r?.entregado))
              .catch((err) => {
                console.error("[PANEL] correo de cambio de hora falló:", err?.message ?? err);
                return false;
              })
          : Promise.resolve(false);

        const promesaWhatsApp = enviarTextoWhatsApp({
          para: cita.telefono || cita.contacto,
          texto:
            `Hola${cita.nombre ? ` ${cita.nombre}` : ""}: tu consultoría con Intellectum quedó ` +
            `movida del ${cita.etiqueta} al ${movida.etiqueta} (hora de Ecuador). La invitación ` +
            `nueva ya va en camino a tu correo. Si esa hora no te sirve, respóndenos por aquí y ` +
            `buscamos otra.`,
        })
          .then((r) => Boolean(r?.entregado))
          .catch(() => false);

        const [correoEnviado, whatsappEnviado] = await Promise.all([promesaCorreo, promesaWhatsApp]);

        await almacen
          .registrarEvento({
            tipo: "herramienta_ejecutada",
            actor: "panel",
            detalle: {
              herramienta: "mover_cita",
              origen: "panel",
              codigo: cita.codigo,
              de: cita.etiqueta,
              a: movida.etiqueta,
              correo_enviado: correoEnviado,
              whatsapp_enviado: whatsappEnviado,
            },
          })
          .catch(() => {});

        return responderJson(res, 200, {
          ok: true,
          de: cita.etiqueta,
          a: movida.etiqueta,
          correo: correoEnviado,
          whatsapp: whatsappEnviado,
        });
      }

      if (cuerpo?.accion === "cancelar_cita") {
        if (!agendaConfigurada()) return responderJson(res, 400, { error: "La agenda no está conectada" });

        const cita = await buscarPorCodigo(cuerpo.codigo);
        if (!cita) return responderJson(res, 404, { error: "Esa cita ya no existe o ya fue cancelada" });

        await cancelarCita(cita.id);

        // Los avisos al cliente salen después de cancelar y nunca deshacen
        // nada: si fallan, la cita igual quedó cancelada y se le dice al
        // panel que avise a mano. Correo y WhatsApp van en paralelo.
        const promesaCorreo = (cita.contacto || "").includes("@")
          ? enviarConfirmacionCita({
              para: cita.contacto,
              nombre: cita.nombre,
              cuando: cita.etiqueta,
              codigo: cita.codigo,
              cambio: "reagendar",
              ics: invitacionICS({
                inicioISO: cita.inicio,
                finISO: cita.fin,
                nombre: cita.nombre,
                id: cita.id,
                secuencia: (cita.secuencia ?? 0) + 1,
                cancelada: true,
              }),
            })
              .then((r) => Boolean(r?.entregado))
              .catch((err) => {
                console.error("[PANEL] correo de cancelación falló:", err?.message ?? err);
                return false;
              })
          : Promise.resolve(false);

        // El teléfono guardado en la cita primero; si no hay, puede que el
        // "contacto" sea un número. enviarCancelacionWhatsApp descarta solo
        // lo que no sea teléfono.
        const promesaWhatsApp = enviarCancelacionWhatsApp({
          para: cita.telefono || cita.contacto,
          nombre: cita.nombre,
          cuando: cita.etiqueta,
        }).then((r) => Boolean(r?.entregado));

        const [correoEnviado, whatsappEnviado] = await Promise.all([promesaCorreo, promesaWhatsApp]);

        await almacen
          .registrarEvento({
            tipo: "herramienta_ejecutada",
            actor: "panel",
            detalle: {
              herramienta: "cancelar_cita",
              origen: "panel",
              codigo: cita.codigo,
              etiqueta: cita.etiqueta,
              correo_enviado: correoEnviado,
              whatsapp_enviado: whatsappEnviado,
            },
          })
          .catch(() => {});

        return responderJson(res, 200, {
          ok: true,
          etiqueta: cita.etiqueta,
          contacto: cita.contacto || "",
          correo: correoEnviado,
          whatsapp: whatsappEnviado,
        });
      }

      return responderJson(res, 400, { error: "Acción desconocida" });
    }

    if (req.method !== "GET") return responderJson(res, 405, { error: "Método no permitido" });

    const vista = url.searchParams.get("vista") ?? "resumen";

    if (vista === "resumen") {
      const [leads, conversaciones, eventos, citas] = await Promise.all([
        almacen.listarLeads({ limite: 200 }),
        almacen.listarConversaciones({ limite: 100 }),
        almacen.listarEventos({ limite: 10 }),
        agendaConfigurada() ? citasProximas().catch(() => []) : Promise.resolve([]),
      ]);

      const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
      const [d7, d30] = [hace(7), hace(30)];

      return responderJson(res, 200, {
        persistente: esPersistente(),
        guardadoEn: dondeSeGuarda(),
        leads: {
          total: leads.length,
          ultimos7: leads.filter((l) => l.creado_en >= d7).length,
          ultimos30: leads.filter((l) => l.creado_en >= d30).length,
          nuevos: leads.filter((l) => (l.estado ?? "nuevo") === "nuevo").length,
          // Urgencia alta y nadie los ha tocado en 3+ días: se están enfriando.
          // La misma regla vive en panel.html (leadEnRiesgo); si cambia aquí,
          // cambia allá.
          en_riesgo: leads.filter(
            (l) =>
              (l.estado ?? "nuevo") === "nuevo" &&
              String(l.urgencia ?? "").toLowerCase() === "alta" &&
              l.creado_en < hace(3),
          ).length,
          // La plata del embudo: suma de los valores estimados. "Abierto" es
          // lo que todavía puede cerrarse; "ganado" es el total ya cerrado.
          embudo: {
            abierto: leads
              .filter((l) => ESTADOS_ABIERTOS.has(l.estado ?? "nuevo"))
              .reduce((suma, l) => suma + (Number(l.valor_estimado) || 0), 0),
            ganado: leads
              .filter((l) => (l.estado ?? "nuevo") === "ganado")
              .reduce((suma, l) => suma + (Number(l.valor_estimado) || 0), 0),
          },
        },
        conversaciones: conversaciones.length,
        citas: { proximas: citas.length, siguiente: citas[0] ?? null },
        eventos,
      });
    }

    if (vista === "leads") {
      const texto = url.searchParams.get("texto") ?? "";
      const leads = texto
        ? await almacen.buscarLeads({ texto, limite: 50 })
        : await almacen.listarLeads({ limite: 100 });
      return responderJson(res, 200, { leads });
    }

    if (vista === "conversaciones") {
      const filas = await almacen.listarConversaciones({ limite: 100 });
      // Al listado no van los mensajes completos: solo lo que la tabla muestra.
      const conversaciones = filas.map((f) => {
        const mensajes = Array.isArray(f.mensajes) ? f.mensajes : [];
        const ultimo = mensajes[mensajes.length - 1];
        return {
          canal: f.canal,
          sesion: f.sesion,
          actualizado_en: f.actualizado_en,
          mensajes: mensajes.length,
          ultimo: typeof ultimo?.content === "string" ? ultimo.content.slice(0, 120) : "",
        };
      });
      return responderJson(res, 200, { conversaciones });
    }

    if (vista === "conversacion") {
      const canal = url.searchParams.get("canal") ?? "";
      const sesion = url.searchParams.get("sesion") ?? "";
      const mensajes = await almacen.recordarConversacion({ canal, sesion });
      return responderJson(res, 200, { canal, sesion, mensajes });
    }

    if (vista === "citas") {
      if (!agendaConfigurada()) return responderJson(res, 200, { citas: [], agenda: false });
      return responderJson(res, 200, { citas: await citasProximas(), agenda: true });
    }

    if (vista === "horarios") {
      if (!agendaConfigurada()) return responderJson(res, 200, { horarios: [], agenda: false });
      return responderJson(res, 200, { horarios: await horariosLibres({ maximo: 12 }), agenda: true });
    }

    if (vista === "eventos") {
      return responderJson(res, 200, { eventos: await almacen.listarEventos({ limite: 60 }) });
    }

    return responderJson(res, 400, { error: "Vista desconocida" });
  } catch (err) {
    console.error("[PANEL] error:", err?.message ?? err);
    return responderJson(res, 500, { error: "No se pudo leer la información" });
  }
}

function claveCorrecta(req, esperado) {
  const cabecera = req.headers.authorization || "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}

function responderJson(res, codigo, datos) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}

async function leerJson(req) {
  const trozos = [];
  for await (const t of req) {
    trozos.push(t);
    if (Buffer.concat(trozos).length > 64_000) return null;
  }
  try {
    return JSON.parse(Buffer.concat(trozos).toString("utf8"));
  } catch {
    return null;
  }
}
