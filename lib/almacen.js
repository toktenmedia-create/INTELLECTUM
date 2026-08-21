/**
 * EL ALMACÉN.
 *
 * Es la única puerta por la que se guardan y se leen datos. Todo lo demás
 * —agentes, herramientas, panel— habla con esta interfaz y no sabe qué hay
 * detrás. Eso es lo que permite cambiar de base de datos sin tocar el resto.
 *
 * Hoy hay una sola implementación: archivo local. Sirve para desarrollar y
 * probar en tu computadora.
 *
 * ⚠ ADVERTENCIA IMPORTANTE
 * En producción (Vercel) el disco es temporal: se borra solo, sin avisar y sin
 * horario fijo. Por eso el archivo local NO es una base de datos de verdad y el
 * agente privado no se publica hasta que exista Supabase. La función
 * esPersistente() dice la verdad sobre esto, y las herramientas la consultan
 * para no darte un número que en realidad está incompleto.
 *
 * Cuando abras Supabase, se agrega aquí crearAlmacenSupabase() con los mismos
 * métodos y nada más cambia en todo el proyecto.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// En Vercel solo /tmp acepta escritura, y es efímero.
const CARPETA = process.env.VERCEL ? "/tmp/intellectum" : path.join(RAIZ, "datos");

const ARCHIVOS = {
  leads: path.join(CARPETA, "leads.jsonl"),
  eventos: path.join(CARPETA, "eventos.jsonl"),
  conversaciones: path.join(CARPETA, "conversaciones.jsonl"),
  bajas: path.join(CARPETA, "bajas.jsonl"),
};

/** Cuántos mensajes se recuerdan de cada conversación. */
const MAX_MENSAJES_CONVERSACION = 16;

/** Tras cuántos días de silencio se considera que empieza una charla nueva. */
const DIAS_HILO_VIVO = 30;

/**
 * Devuelve el almacén configurado.
 * @returns {ReturnType<typeof crearAlmacenLocal>}
 */
export function abrirAlmacen() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    return crearAlmacenSupabase();
  }
  return crearAlmacenLocal();
}

/**
 * ¿Lo que se guarde va a seguir ahí mañana?
 * Falso mientras no haya base de datos real: el agente privado usa esto para
 * avisar que sus números pueden estar incompletos en vez de fingir que no.
 */
export function esPersistente() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/** Descripción en una línea de dónde se están guardando los datos. */
export function dondeSeGuarda() {
  if (esPersistente()) return "Supabase";
  if (process.env.VERCEL) return "archivo temporal de Vercel (se borra solo)";
  return `archivo local (${path.relative(RAIZ, CARPETA)}/)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementación local: un archivo por tipo, una línea JSON por registro.
// Se escribe añadiendo al final (append), que es la forma más difícil de
// corromper si dos peticiones escriben casi a la vez.
// ─────────────────────────────────────────────────────────────────────────────

function crearAlmacenLocal() {
  return {
    tipo: "local",

    /** Foto completa de lo guardado, para el respaldo periódico. */
    async respaldo() {
      return {
        leads: await leer(ARCHIVOS.leads),
        eventos: await leer(ARCHIVOS.eventos),
        conversaciones: await leer(ARCHIVOS.conversaciones),
        bajas: await leer(ARCHIVOS.bajas),
      };
    },

    async guardarLead(lead, meta = {}) {
      const registro = {
        id: crypto.randomUUID(),
        ...lead,
        cliente: meta.cliente ?? "intellectum",
        canal: meta.canal ?? "web",
        origen: meta.origen ?? null,
        sesion: meta.sesion ?? null,
        creado_en: new Date().toISOString(),
      };
      await añadir(ARCHIVOS.leads, registro);
      return registro;
    },

    async listarLeads({ cliente = "intellectum", desde = null, limite = 50 } = {}) {
      const todos = await leer(ARCHIVOS.leads);
      return todos
        .filter((l) => l.cliente === cliente)
        .filter((l) => !desde || l.creado_en >= desde)
        .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
        .slice(0, limite);
    },

    async buscarLeads({ cliente = "intellectum", texto = "", urgencia = null, limite = 20 } = {}) {
      const aguja = texto.trim().toLowerCase();
      const todos = await leer(ARCHIVOS.leads);

      return todos
        .filter((l) => l.cliente === cliente)
        .filter((l) => !urgencia || l.urgencia === urgencia)
        .filter((l) => {
          if (!aguja) return true;
          const paja = [l.nombre, l.empresa, l.sector, l.contacto, l.necesidad, l.resumen]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return paja.includes(aguja);
        })
        .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
        .slice(0, limite);
    },

    async listarConversaciones({ cliente = "intellectum", limite = 50 } = {}) {
      const filas = await leer(ARCHIVOS.conversaciones);
      const porSesion = new Map();
      for (const f of filas) {
        if (f.cliente !== cliente) continue;
        porSesion.set(`${f.canal}|${f.sesion}`, f); // la última escritura gana
      }
      return [...porSesion.values()]
        .sort((x, y) => (x.actualizado_en < y.actualizado_en ? 1 : -1))
        .slice(0, limite);
    },

    async actualizarLead({ cliente = "intellectum", id, estado, nota } = {}) {
      // En el archivo local no se reescribe: se añade una versión nueva con el
      // mismo id, y quien lee se queda con la última. Suficiente para probar.
      const todos = await leer(ARCHIVOS.leads);
      const actual = todos.filter((l) => l.id === id).pop();
      if (!actual) return null;
      const nuevo = { ...actual };
      if (estado !== undefined) nuevo.estado = estado;
      if (nota !== undefined) nuevo.nota = nota;
      await añadir(ARCHIVOS.leads, nuevo);
      return nuevo;
    },

    async recordarConversacion({ cliente = "intellectum", canal, sesion } = {}) {
      const todas = await leer(ARCHIVOS.conversaciones);
      // Se escribe añadiendo al final, así que la última coincidencia manda.
      const fila = todas.findLast(
        (c) => c.cliente === cliente && c.canal === canal && c.sesion === sesion,
      );
      return conversacionVigente(fila);
    },

    async guardarConversacion({
      cliente = "intellectum",
      canal,
      sesion,
      nombrePerfil = null,
      mensajes = [],
    }) {
      const registro = {
        cliente,
        canal,
        sesion,
        nombre_perfil: nombrePerfil,
        mensajes: ultimosMensajes(mensajes),
        actualizado_en: new Date().toISOString(),
      };
      await añadir(ARCHIVOS.conversaciones, registro);
      return registro;
    },

    /** Borrado a pedido: la persona ejerce su derecho y no queda historial. */
    async olvidarConversacion({ cliente = "intellectum", canal, sesion }) {
      await añadir(ARCHIVOS.conversaciones, {
        cliente,
        canal,
        sesion,
        nombre_perfil: null,
        mensajes: [],
        actualizado_en: new Date().toISOString(),
      });
    },

    /**
     * LA BITÁCORA. Cada cosa que hace un agente queda escrita aquí.
     * Es lo que te deja revisar el panel y ver exactamente qué pasó, quién lo
     * pidió y con qué resultado. También es la prueba documental que pide la
     * ley de protección de datos.
     */
    async registrarEvento({ tipo, actor, detalle = {}, cliente = "intellectum" }) {
      const evento = {
        id: crypto.randomUUID(),
        tipo,
        actor,
        cliente,
        detalle,
        creado_en: new Date().toISOString(),
      };
      await añadir(ARCHIVOS.eventos, evento);
      return evento;
    },

    async listarEventos({ cliente = "intellectum", limite = 50 } = {}) {
      const todos = await leer(ARCHIVOS.eventos);
      return todos
        .filter((e) => e.cliente === cliente)
        .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
        .slice(0, limite);
    },

    /**
     * ¿Este mensaje ya se atendió? El webhook de WhatsApp lo pregunta antes de
     * procesar, porque Meta a veces entrega el mismo mensaje dos veces y nadie
     * quiere recibir dos respuestas a la misma pregunta.
     */
    async yaProcesado({ marcador, cliente = "intellectum" }) {
      const eventos = await leer(ARCHIVOS.eventos);
      return eventos.some(
        (e) =>
          e.cliente === cliente &&
          e.tipo === "mensaje_procesado" &&
          e.detalle?.marcador === marcador,
      );
    },

    /** En local no hay reloj de retención: son datos de prueba en tu máquina. */
    async limpiarVencidos() {
      return [];
    },

    /**
     * "No me escribas más." Se apunta y no caduca: la lista de bajas es lo
     * primero que hay que consultar el día que se manden mensajes iniciados
     * por la empresa.
     */
    async registrarBaja({ canal, sesion, cliente = "intellectum" }) {
      await añadir(ARCHIVOS.bajas, {
        cliente,
        canal,
        sesion,
        creado_en: new Date().toISOString(),
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementación Supabase.
//
// Habla con la base por HTTP (PostgREST), sin librería. Es a propósito: el
// mismo archivo va a funcionar tal cual cuando el cerebro se mude a Cloudflare
// Workers, donde no corren las librerías que dependen de Node.
//
// Usa la CLAVE DE SERVICIO, que pasa por encima de las reglas de seguridad de
// la base. Por eso esta clave vive SOLO en el servidor y jamás en el navegador.
// El aislamiento entre clientes lo garantiza aquí el filtro por cliente_id; en
// el panel lo garantizará la base con las políticas del esquema.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS_LEAD = [
  "nombre",
  "contacto",
  "empresa",
  "sector",
  "cargo",
  "necesidad",
  "tamano_empresa",
  "urgencia",
  "resumen",
];

/** slug → uuid, resuelto una vez por proceso. */
const idsDeCliente = new Map();

function crearAlmacenSupabase() {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const clave = process.env.SUPABASE_SERVICE_KEY;

  async function pedir(ruta, opciones = {}) {
    const respuesta = await fetch(`${base}/rest/v1/${ruta}`, {
      ...opciones,
      headers: {
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...opciones.headers,
      },
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      throw new Error(`Supabase respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
    }

    // Con "return=minimal" la base contesta 201/204 con el cuerpo VACÍO, y
    // json() sobre vacío revienta. Se lee como texto y se interpreta solo si
    // hay algo que interpretar.
    const texto = await respuesta.text();
    return texto ? JSON.parse(texto) : null;
  }

  async function idDe(slug) {
    if (idsDeCliente.has(slug)) return idsDeCliente.get(slug);

    const filas = await pedir(`clientes?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
    if (!filas?.length) {
      throw new Error(
        `El cliente "${slug}" no existe en la base. Créalo en la tabla clientes antes de usarlo.`,
      );
    }

    idsDeCliente.set(slug, filas[0].id);
    return filas[0].id;
  }

  return {
    tipo: "supabase",

    /**
     * Foto completa de la base, para el respaldo periódico. Trae TODAS las
     * filas de cada tabla: con el volumen de un negocio que empieza eso son
     * kilobytes; el día que sean megas, este es el método a paginar.
     */
    async respaldo() {
      const tablas = ["clientes", "leads", "eventos", "conversaciones", "bajas"];
      const foto = {};
      for (const tabla of tablas) {
        foto[tabla] = (await pedir(`${tabla}?select=*`)) ?? [];
      }
      return foto;
    },

    async guardarLead(lead, meta = {}) {
      const cliente_id = await idDe(meta.cliente ?? "intellectum");

      const fila = { cliente_id, canal: meta.canal ?? "web" };
      for (const campo of CAMPOS_LEAD) fila[campo] = lead[campo] ?? "";
      if (meta.origen) fila.origen = String(meta.origen).slice(0, 500);
      if (meta.sesion) fila.sesion = String(meta.sesion).slice(0, 64);

      const [guardado] = await pedir("leads", { method: "POST", body: JSON.stringify(fila) });
      return guardado;
    },

    async listarLeads({ cliente = "intellectum", desde = null, limite = 50 } = {}) {
      const cliente_id = await idDe(cliente);
      const partes = [`cliente_id=eq.${cliente_id}`, "order=creado_en.desc", `limit=${limite}`];
      if (desde) partes.push(`creado_en=gte.${desde}`);
      return await pedir(`leads?${partes.join("&")}`);
    },

    async buscarLeads({ cliente = "intellectum", texto = "", urgencia = null, limite = 20 } = {}) {
      const cliente_id = await idDe(cliente);
      const partes = [`cliente_id=eq.${cliente_id}`, "order=creado_en.desc", `limit=${limite}`];

      if (urgencia) partes.push(`urgencia=eq.${encodeURIComponent(urgencia)}`);

      const aguja = limpiarBusqueda(texto);
      if (aguja) {
        const campos = ["nombre", "empresa", "sector", "contacto", "necesidad", "resumen"];
        const condiciones = campos.map((c) => `${c}.ilike.*${aguja}*`).join(",");
        partes.push(`or=(${encodeURIComponent(condiciones)})`);
      }

      return await pedir(`leads?${partes.join("&")}`);
    },

    async listarConversaciones({ cliente = "intellectum", limite = 50 } = {}) {
      const cliente_id = await idDe(cliente);
      return (
        (await pedir(
          `conversaciones?cliente_id=eq.${cliente_id}&order=actualizado_en.desc&limit=${limite}` +
            `&select=canal,sesion,mensajes,actualizado_en`,
        )) ?? []
      );
    },

    async actualizarLead({ cliente = "intellectum", id, estado, nota } = {}) {
      const cliente_id = await idDe(cliente);
      const cambios = {};
      if (estado !== undefined) cambios.estado = estado;
      if (nota !== undefined) cambios.nota = nota;
      if (Object.keys(cambios).length === 0) return null;
      const filas = await pedir(
        `leads?id=eq.${encodeURIComponent(id)}&cliente_id=eq.${cliente_id}`,
        { method: "PATCH", body: JSON.stringify(cambios) },
      );
      return filas?.[0] ?? null;
    },

    async recordarConversacion({ cliente = "intellectum", canal, sesion } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `conversaciones?cliente_id=eq.${cliente_id}` +
          `&canal=eq.${encodeURIComponent(canal)}` +
          `&sesion=eq.${encodeURIComponent(sesion)}` +
          `&select=mensajes,actualizado_en&limit=1`,
      );
      return conversacionVigente(filas?.[0]);
    },

    async guardarConversacion({
      cliente = "intellectum",
      canal,
      sesion,
      nombrePerfil = null,
      mensajes = [],
    }) {
      const cliente_id = await idDe(cliente);
      const fila = {
        cliente_id,
        canal,
        sesion,
        mensajes: ultimosMensajes(mensajes),
        actualizado_en: new Date().toISOString(),
      };
      // El nombre solo se escribe si viene. Si no, un mensaje sin perfil
      // borraría el nombre que ya se conocía de la persona.
      if (nombrePerfil) fila.nombre_perfil = nombrePerfil;

      // upsert por (cliente, canal, sesión): si la conversación ya existe se
      // reemplaza, en vez de crear una segunda fila para el mismo número.
      const [guardada] = await pedir("conversaciones?on_conflict=cliente_id,canal,sesion", {
        method: "POST",
        body: JSON.stringify(fila),
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      });
      return guardada;
    },

    /** Borrado a pedido: la persona ejerce su derecho y no queda historial. */
    async olvidarConversacion({ cliente = "intellectum", canal, sesion }) {
      const cliente_id = await idDe(cliente);
      await pedir(
        `conversaciones?cliente_id=eq.${cliente_id}` +
          `&canal=eq.${encodeURIComponent(canal)}` +
          `&sesion=eq.${encodeURIComponent(sesion)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    },

    async registrarEvento({ tipo, actor, detalle = {}, cliente = "intellectum" }) {
      const cliente_id = await idDe(cliente);
      const [evento] = await pedir("eventos", {
        method: "POST",
        body: JSON.stringify({ cliente_id, tipo, actor, detalle }),
      });
      return evento;
    },

    async listarEventos({ cliente = "intellectum", limite = 50 } = {}) {
      const cliente_id = await idDe(cliente);
      return await pedir(
        `eventos?cliente_id=eq.${cliente_id}&order=creado_en.desc&limit=${limite}`,
      );
    },

    /**
     * ¿Este mensaje ya se atendió? Busca la huella en la bitácora. El marcador
     * viene de Meta y trae signos de igual, así que va codificado en la URL.
     */
    async yaProcesado({ marcador, cliente = "intellectum" }) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `eventos?cliente_id=eq.${cliente_id}&tipo=eq.mensaje_procesado` +
          `&detalle->>marcador=eq.${encodeURIComponent(marcador)}&select=id&limit=1`,
      );
      return Boolean(filas?.length);
    },

    /**
     * EL RELOJ DE RETENCIÓN. Ejecuta en la base la función limpiar_vencidos(),
     * que borra conversaciones y bitácora más viejas que el plazo de cada
     * cliente (90 días por defecto). Es lo que convierte la promesa del aviso
     * de privacidad — "tus datos no se guardan para siempre" — en un hecho.
     * Lo llama la tarea diaria de api/recordatorios.js.
     */
    async limpiarVencidos() {
      return await pedir("rpc/limpiar_vencidos", { method: "POST", body: "{}" });
    },

    /**
     * "No me escribas más." Va a la tabla bajas, que no tiene reloj de
     * retención a propósito: esa decisión no caduca. Pedirla dos veces no
     * duplica la fila (upsert sobre cliente+canal+sesión).
     */
    async registrarBaja({ canal, sesion, cliente = "intellectum" }) {
      const cliente_id = await idDe(cliente);
      await pedir("bajas?on_conflict=cliente_id,canal,sesion", {
        method: "POST",
        body: JSON.stringify({ cliente_id, canal, sesion }),
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      });
    },
  };
}

/** Solo se guardan los últimos mensajes: el resto no aporta y cuesta. */
function ultimosMensajes(mensajes) {
  return (Array.isArray(mensajes) ? mensajes : []).slice(-MAX_MENSAJES_CONVERSACION);
}

/**
 * Devuelve los mensajes solo si siguen siendo la misma conversación.
 *
 * Pasado un mes de silencio, quien escribe "hola" está empezando de cero:
 * retomar a media frase una charla de hace seis semanas confunde más de lo que
 * ayuda. La fila NO se borra aquí — de eso se encarga el reloj de retención.
 */
function conversacionVigente(fila) {
  if (!Array.isArray(fila?.mensajes) || fila.mensajes.length === 0) return [];

  const edadDias = (Date.now() - new Date(fila.actualizado_en).getTime()) / 86_400_000;
  if (!Number.isFinite(edadDias) || edadDias > DIAS_HILO_VIVO) return [];

  return fila.mensajes;
}

/**
 * Los filtros de PostgREST se escriben con comas y paréntesis, así que un texto
 * de búsqueda con esos caracteres rompería la consulta. Se dejan pasar solo
 * letras, números, espacios y guiones.
 */
function limpiarBusqueda(texto) {
  return String(texto ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s@.\-]/gu, " ")
    .trim()
    .slice(0, 80);
}

// ─── utilidades de archivo ───────────────────────────────────────────────────

async function añadir(archivo, registro) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  await fs.appendFile(archivo, `${JSON.stringify(registro)}\n`, "utf8");
}

async function leer(archivo) {
  let crudo;
  try {
    crudo = await fs.readFile(archivo, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return []; // todavía no hay nada guardado
    throw err;
  }

  const registros = [];
  for (const linea of crudo.split("\n")) {
    if (!linea.trim()) continue;
    try {
      registros.push(JSON.parse(linea));
    } catch {
      // Una línea rota no puede tumbar la lectura de las demás.
      console.warn("[ALMACEN] línea ilegible, se omite");
    }
  }
  return registros;
}
