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
 *   eventos         — la bitácora.
 *
 * Acciones (POST {accion:"lead", id, estado, nota}):
 *   lead            — actualiza el estado o la nota de un lead.
 */

import { abrirAlmacen, esPersistente, dondeSeGuarda } from "../lib/almacen.js";
import { agendaConfigurada, citasProximas } from "../lib/calendario.js";

export const config = { maxDuration: 30 };

const ESTADOS_VALIDOS = new Set(["nuevo", "contactado", "ganado", "perdido"]);

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
      if (cuerpo?.accion !== "lead") return responderJson(res, 400, { error: "Acción desconocida" });

      const estado = cuerpo.estado === undefined ? undefined : String(cuerpo.estado);
      if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
        return responderJson(res, 400, { error: "Estado inválido" });
      }
      const nota = cuerpo.nota === undefined ? undefined : String(cuerpo.nota).slice(0, 2000);

      const lead = await almacen.actualizarLead({ id: String(cuerpo.id ?? ""), estado, nota });
      if (!lead) return responderJson(res, 404, { error: "Ese lead no existe" });
      return responderJson(res, 200, { lead });
    }

    if (req.method !== "GET") return responderJson(res, 405, { error: "Método no permitido" });

    const vista = url.searchParams.get("vista") ?? "resumen";

    if (vista === "resumen") {
      const [leads, conversaciones, eventos, citas] = await Promise.all([
        almacen.listarLeads({ limite: 200 }),
        almacen.listarConversaciones({ limite: 100 }),
        almacen.listarEventos({ limite: 6 }),
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
