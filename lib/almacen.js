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

/**
 * CUÁNTOS MENSAJES CUESTA UNA CONVERSACIÓN.
 *
 * Desde el 1 de octubre de 2026 Meta cobra por mensaje ENTREGADO. Los topes de
 * cada plan se calcularon sobre una estimación de cuántos manda el agente por
 * charla; esto reemplaza esa estimación por la cuenta real.
 *
 * Los avisos al equipo se cuentan aparte: cuestan, pero no son atención al
 * cliente, y meterlos en el promedio haría parecer más caras las conversaciones
 * de lo que son.
 *
 * Devuelve hechos, nunca dólares: la tarifa de Meta cambia y guardarla aquí
 * envejecería mal. El precio se multiplica donde vive la tarifa del momento.
 */
function resumirEntregas(filas, { dias, desde }) {
  const porTipo = { servicio: 0, plantilla: 0 };
  const porMotivo = {};
  const sesiones = new Set();
  let aClientes = 0;
  let alEquipo = 0;

  for (const fila of filas) {
    const d = fila.detalle ?? {};
    if (d.destino === "equipo") {
      alEquipo += 1;
    } else {
      aClientes += 1;
      if (d.sesion) sesiones.add(d.sesion);
    }
    if (d.tipo === "plantilla" || d.tipo === "servicio") porTipo[d.tipo] += 1;
    const motivo = d.motivo ?? "sin_motivo";
    porMotivo[motivo] = (porMotivo[motivo] ?? 0) + 1;
  }

  return {
    desde,
    dias,
    entregados: { total: aClientes + alEquipo, a_clientes: aClientes, al_equipo: alEquipo },
    por_tipo: porTipo,
    por_motivo: porMotivo,
    conversaciones: sesiones.size,
    // EL número: cuántos mensajes entrega el agente por conversación atendida.
    por_conversacion: sesiones.size ? Number((aClientes / sesiones.size).toFixed(1)) : 0,
  };
}

/** Desde cuándo mirar, en ISO, a partir de una ventana en días. */
function haceDias(dias) {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

function haceHoras(horas) {
  return new Date(Date.now() - horas * 3_600_000).toISOString();
}

/* ── LA MISMA PERSONA, UNA SOLA FICHA ─────────────────────────────────────
 *
 * Antes cada puerta creaba su propio lead: cotizar por la web y agendar por
 * WhatsApp eran dos (o tres) fichas de la misma persona, y el panel contaba
 * fantasmas. La identidad que de verdad une a una persona entre canales es su
 * contacto — el correo o el teléfono — así que guardarLead busca primero una
 * ficha reciente con el mismo contacto y, si existe, la COMPLETA en lugar de
 * duplicarla. La ventana es la misma de "la misma oportunidad": pasado un mes,
 * quien vuelve trae un caso nuevo y merece ficha nueva.
 */
const DIAS_MISMA_PERSONA = 30;

/**
 * La llave de identidad de un contacto: "correo:..." o "tel:593...".
 * La parte de teléfono es GEMELA de normalizarTelefono en lib/mensajeria.js
 * (copiada, no importada, para que el almacén no dependa del canal): si un día
 * cambia allá, tiene que cambiar acá.
 */
function claveDeContacto(crudo) {
  const texto = String(crudo ?? "").trim().toLowerCase();
  if (!texto) return null;
  if (texto.includes("@")) return texto.includes(".") ? `correo:${texto}` : null;

  let digitos = texto.replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (/^09\d{8}$/.test(digitos)) digitos = `593${digitos.slice(1)}`;
  if (/^5930\d+$/.test(digitos)) digitos = `593${digitos.slice(4)}`;
  return /^[1-9]\d{7,14}$/.test(digitos) ? `tel:${digitos}` : null;
}

/**
 * Qué campos del lead nuevo completan o refrescan la ficha previa.
 * Regla: los datos de identidad solo se RELLENAN si faltaban (lo que el dueño
 * o la persona ya dijeron no se pisa); lo que describe la oportunidad de hoy
 * (necesidad, resumen, valor) se refresca; la urgencia sube y nunca baja; y
 * "contactado" gana a "nuevo", pero ganado/perdido — decisiones del dueño —
 * no se tocan. La `nota` no aparece aquí a propósito: es del dueño.
 */
function cambiosDeFusion(previo, lead) {
  const cambios = {};
  const vacio = (v) => !String(v ?? "").trim();

  for (const campo of ["nombre", "empresa", "sector", "cargo", "tamano_empresa"]) {
    if (vacio(previo[campo]) && !vacio(lead[campo])) cambios[campo] = lead[campo];
  }
  for (const campo of ["necesidad", "resumen"]) {
    if (!vacio(lead[campo])) cambios[campo] = lead[campo];
  }

  const valor = Number(lead.valor_estimado);
  if (Number.isFinite(valor) && valor > 0) cambios.valor_estimado = valor;

  const nivel = { baja: 0, media: 1, alta: 2 };
  if ((nivel[lead.urgencia] ?? -1) > (nivel[previo.urgencia] ?? -1)) {
    cambios.urgencia = lead.urgencia;
  }
  if (lead.estado === "contactado" && (!previo.estado || previo.estado === "nuevo")) {
    cambios.estado = "contactado";
  }

  return cambios;
}

/** Tras cuántos días de silencio se considera que empieza una charla nueva. */
const DIAS_HILO_VIVO = 30;

/**
 * Devuelve el almacén configurado.
 * @returns {ReturnType<typeof crearAlmacenLocal>}
 */
/**
 * Las variables de Supabase llevan el sufijo _INTELLECTUM para que no se
 * confundan con las de otros proyectos (Parques del Recuerdo usa _PARQUES):
 * dos archivos .env con los mismos nombres invitan a pegar la clave en el
 * proyecto equivocado. Vercel ya tiene los nombres con sufijo.
 */
export function credencialesSupabase() {
  const url = process.env.SUPABASE_URL_INTELLECTUM || "";
  const clave = process.env.SUPABASE_SERVICE_KEY_INTELLECTUM || "";
  return { url: url.replace(/\/+$/, ""), clave };
}

export function abrirAlmacen() {
  const { url, clave } = credencialesSupabase();
  if (url && clave) {
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
  const { url, clave } = credencialesSupabase();
  return Boolean(url && clave);
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
      const cliente = meta.cliente ?? "intellectum";

      // ¿Ya existe una ficha reciente de esta misma persona? Se completa esa.
      const clave = claveDeContacto(lead.contacto);
      if (clave) {
        try {
          const desde = haceDias(DIAS_MISMA_PERSONA);
          const previo = ultimaVersion(await leer(ARCHIVOS.leads))
            .filter(
              (l) =>
                l.cliente === cliente &&
                l.creado_en >= desde &&
                claveDeContacto(l.contacto) === clave,
            )
            .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))[0];

          if (previo) {
            const fusionado = {
              ...previo,
              ...cambiosDeFusion(previo, lead),
              actualizado_en: new Date().toISOString(),
            };
            await añadir(ARCHIVOS.leads, fusionado);
            await añadir(ARCHIVOS.eventos, {
              id: crypto.randomUUID(),
              tipo: "lead_fusionado",
              actor: "sistema",
              cliente,
              detalle: { lead_id: previo.id, canal: meta.canal ?? "web", clave },
              creado_en: new Date().toISOString(),
            });
            return fusionado;
          }
        } catch (err) {
          console.error("[ALMACEN] la fusión por persona falló, se guarda aparte:", err?.message);
        }
      }

      const registro = {
        id: crypto.randomUUID(),
        ...lead,
        cliente,
        canal: meta.canal ?? "web",
        origen: meta.origen ?? null,
        sesion: meta.sesion ?? null,
        creado_en: new Date().toISOString(),
      };
      await añadir(ARCHIVOS.leads, registro);
      return registro;
    },

    /** El lead que esta misma conversación ya dejó, si existe. */
    async leadDeSesion({ cliente = "intellectum", canal, sesion } = {}) {
      if (!sesion) return null;
      const todos = ultimaVersion(await leer(ARCHIVOS.leads));
      return (
        todos
          .filter((l) => l.cliente === cliente && l.canal === canal && l.sesion === sesion)
          .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))[0] ?? null
      );
    },

    async listarLeads({ cliente = "intellectum", desde = null, limite = 50 } = {}) {
      const todos = ultimaVersion(await leer(ARCHIVOS.leads));
      return todos
        .filter((l) => l.cliente === cliente)
        .filter((l) => !desde || l.creado_en >= desde)
        .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
        .slice(0, limite);
    },

    async buscarLeads({ cliente = "intellectum", texto = "", urgencia = null, limite = 20 } = {}) {
      const aguja = texto.trim().toLowerCase();
      const todos = ultimaVersion(await leer(ARCHIVOS.leads));

      return todos
        .filter((l) => l.cliente === cliente)
        .filter((l) => !urgencia || l.urgencia === urgencia)
        .filter((l) => {
          if (!aguja) return true;
          const paja = [l.nombre, l.empresa, l.sector, l.contacto, l.necesidad, l.resumen]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (paja.includes(aguja)) return true;
          // La etiqueta se busca ENTERA, no por trozos, para que aquí pase lo
          // mismo que contra Supabase (ver buscarLeads más abajo). Dos
          // buscadores que se comportan distinto según dónde corran son una
          // trampa para quien prueba en local y confía en lo que ve.
          return (Array.isArray(l.etiquetas) ? l.etiquetas : []).some(
            (e) => String(e).trim().toLowerCase() === aguja,
          );
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

    async actualizarLead({
      cliente = "intellectum",
      id,
      estado,
      nota,
      etiquetas,
      valor_estimado,
      motivo_perdida,
    } = {}) {
      // En el archivo local no se reescribe: se añade una versión nueva con el
      // mismo id, y quien lee se queda con la última. Suficiente para probar.
      const todos = await leer(ARCHIVOS.leads);
      const actual = todos.filter((l) => l.id === id).pop();
      if (!actual) return null;
      const nuevo = { ...actual };
      if (estado !== undefined) nuevo.estado = estado;
      if (nota !== undefined) nuevo.nota = nota;
      if (etiquetas !== undefined) nuevo.etiquetas = etiquetas;
      if (valor_estimado !== undefined) nuevo.valor_estimado = valor_estimado;
      if (motivo_perdida !== undefined) nuevo.motivo_perdida = motivo_perdida;
      nuevo.actualizado_en = new Date().toISOString();
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
     * ¿Cuántos eventos de este tipo hubo desde tal hora? Sirve de contador
     * durable para los frenos (peticiones por IP, tope diario del chat): la
     * memoria de una instancia de Vercel no cuenta lo que vieron las demás.
     * Cuenta hasta `tope` y ahí para: para decidir "¿se pasó del límite?" no
     * hace falta saber si fueron 400 o 4.000.
     */
    async contarEventos({ cliente = "intellectum", tipo, desde, ip, tope = 1000 } = {}) {
      const filas = await leer(ARCHIVOS.eventos);
      let n = 0;
      for (const e of filas) {
        if (e.cliente !== cliente || e.tipo !== tipo) continue;
        if (desde && !(e.creado_en >= desde)) continue;
        if (ip && e.detalle?.ip !== ip) continue;
        if (++n >= tope) break;
      }
      return n;
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

    async consumoDeMensajes({ cliente = "intellectum", dias = 30 } = {}) {
      const desde = haceDias(dias);
      const filas = (await leer(ARCHIVOS.eventos)).filter(
        (e) => e.cliente === cliente && e.tipo === "mensaje_entregado" && e.creado_en >= desde,
      );
      return { ...resumirEntregas(filas, { dias, desde }), truncado: false };
    },

    async leadPorId({ id, cliente = "intellectum" } = {}) {
      const todos = await leer(ARCHIVOS.leads);
      return todos.find((l) => l.id === id && l.cliente === cliente) ?? null;
    },

    async cotizacionDeLead({ lead_id, cliente = "intellectum" } = {}) {
      const eventos = await leer(ARCHIVOS.eventos);
      const suyas = eventos.filter(
        (e) => e.cliente === cliente && e.tipo === "cotizacion_entregada" && e.detalle?.lead_id === lead_id,
      );
      return suyas.sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))[0]?.detalle ?? null;
    },

    async seguimientosVencidos({ cliente = "intellectum", ahora = new Date() } = {}) {
      const eventos = await leer(ARCHIVOS.eventos);
      return eventos
        .filter(
          (e) =>
            e.cliente === cliente &&
            e.tipo === "seguimiento_programado" &&
            e.detalle?.para_fecha &&
            new Date(e.detalle.para_fecha) <= ahora,
        )
        .map((e) => e.detalle);
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

    /**
     * ¿A este número ya le escribimos por WhatsApp tras una llamada?
     *
     * Dapta reintenta su aviso cuando algo falla de nuestro lado, y ese
     * reintento no puede costarle a la persona un segundo mensaje idéntico:
     * escribirle dos veces seguidas desde un número comercial es exactamente lo
     * que la lleva a bloquearlo. Se pregunta por la entrega REAL (el evento solo
     * existe si Meta la aceptó), no por una marca aparte que podría mentir.
     *
     * Veinte horas: cubre de sobra cualquier reintento y trata dos llamadas del
     * mismo día como lo que son, una sola gestión. Al día siguiente, si vuelve a
     * llamar y vuelve a aceptar, vuelve a recibirlo — y eso está bien.
     */
    async yaEscritoTrasLlamada({ cliente = "intellectum", sesion, horas = 20 } = {}) {
      if (!sesion) return false;
      const desde = haceHoras(horas);
      const eventos = await leer(ARCHIVOS.eventos);
      return eventos.some(
        (e) =>
          e.cliente === cliente &&
          e.tipo === "mensaje_entregado" &&
          e.detalle?.motivo === "tras_llamada" &&
          e.detalle?.sesion === sesion &&
          String(e.creado_en ?? "") >= desde,
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

    /** En local no hay tabla de clientes: siempre es el de casa. */
    async fichaDeCliente() {
      return null;
    },

    async clientePorTelefono() {
      return null;
    },

    async sesionesDeBaja({ cliente = "intellectum", canal = "whatsapp" } = {}) {
      const filas = await leer(ARCHIVOS.bajas);
      return new Set(
        filas.filter((b) => b.cliente === cliente && b.canal === canal).map((b) => b.sesion),
      );
    },

    async leadsYaSeguidos({ cliente = "intellectum", dias = 60 } = {}) {
      const desde = haceDias(dias);
      const filas = await leer(ARCHIVOS.eventos);
      return new Set(
        filas
          .filter(
            (e) => e.cliente === cliente && e.tipo === "seguimiento_enviado" && e.creado_en >= desde,
          )
          .map((e) => e.detalle?.lead_id)
          .filter(Boolean),
      );
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
  const { url: base, clave } = credencialesSupabase();

  async function pedir(ruta, opciones = {}) {
    const respuesta = await fetch(`${base}/rest/v1/${ruta}`, {
      signal: AbortSignal.timeout(5_000),
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
      const cliente = meta.cliente ?? "intellectum";
      const cliente_id = await idDe(cliente);

      // ¿Ya existe una ficha reciente de esta misma persona? Se completa esa.
      // El contacto vive escrito de mil maneras ("099...", "+593 99..."), así
      // que no se puede preguntar por igualdad a la base: se traen los leads
      // recientes y se compara la llave normalizada aquí.
      const clave = claveDeContacto(lead.contacto);
      if (clave) {
        try {
          const recientes = await pedir(
            `leads?cliente_id=eq.${cliente_id}` +
              `&creado_en=gte.${encodeURIComponent(haceDias(DIAS_MISMA_PERSONA))}` +
              `&order=creado_en.desc&limit=500`,
          );
          const previo = (recientes ?? []).find((l) => claveDeContacto(l.contacto) === clave);

          if (previo) {
            const cambios = cambiosDeFusion(previo, lead);
            let fusionado = previo;
            if (Object.keys(cambios).length > 0) {
              const filas = await pedir(
                `leads?id=eq.${encodeURIComponent(previo.id)}&cliente_id=eq.${cliente_id}`,
                { method: "PATCH", body: JSON.stringify(cambios) },
              );
              fusionado = filas?.[0] ?? { ...previo, ...cambios };
            }
            await pedir("eventos", {
              method: "POST",
              body: JSON.stringify({
                cliente_id,
                tipo: "lead_fusionado",
                actor: "sistema",
                detalle: { lead_id: previo.id, canal: meta.canal ?? "web", clave },
              }),
            }).catch(() => {});
            return fusionado;
          }
        } catch (err) {
          console.error("[ALMACEN] la fusión por persona falló, se guarda aparte:", err?.message);
        }
      }

      const fila = { cliente_id, canal: meta.canal ?? "web" };
      for (const campo of CAMPOS_LEAD) fila[campo] = lead[campo] ?? "";
      // El cotizador entrega leads que ya nacen con valor en el embudo.
      const valor = Number(lead.valor_estimado);
      if (Number.isFinite(valor) && valor > 0 && valor <= 99_999_999) {
        fila.valor_estimado = Math.round(valor * 100) / 100;
      }
      if (meta.origen) fila.origen = String(meta.origen).slice(0, 500);
      if (meta.sesion) fila.sesion = String(meta.sesion).slice(0, 64);

      const [guardado] = await pedir("leads", { method: "POST", body: JSON.stringify(fila) });
      return guardado;
    },

    /** El lead que esta misma conversación ya dejó, si existe. */
    async leadDeSesion({ cliente = "intellectum", canal, sesion } = {}) {
      if (!sesion) return null;
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `leads?cliente_id=eq.${cliente_id}` +
          `&canal=eq.${encodeURIComponent(canal)}` +
          `&sesion=eq.${encodeURIComponent(String(sesion).slice(0, 64))}` +
          `&order=creado_en.desc&limit=1`,
      );
      return filas?.[0] ?? null;
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
        const condiciones = campos.map((c) => `${c}.ilike.*${aguja}*`);

        // LAS ETIQUETAS SE BUSCAN ENTERAS, y no es un capricho: son jsonb, y
        // Postgres no sabe hacer "contiene un pedazo" dentro de un array sin
        // recorrerlo entero (probado: ilike sobre jsonb devuelve 42883). Con
        // "cs" el índice GIN sí trabaja. A cambio, "clí" no encuentra
        // "clínica": hay que escribir la etiqueta completa.
        //
        // La aguja baja a minúsculas porque las etiquetas se guardan así
        // (api/panel.js las normaliza al escribirlas), y "cs" sí distingue
        // mayúsculas. JSON.stringify escapa lo que haga falta, aunque
        // limpiarBusqueda ya dejó fuera comillas, comas y barras.
        condiciones.push(`etiquetas.cs.${JSON.stringify([aguja.toLowerCase()])}`);

        partes.push(`or=(${encodeURIComponent(condiciones.join(","))})`);
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

    async actualizarLead({
      cliente = "intellectum",
      id,
      estado,
      nota,
      etiquetas,
      valor_estimado,
      motivo_perdida,
    } = {}) {
      const cliente_id = await idDe(cliente);
      const cambios = {};
      if (estado !== undefined) cambios.estado = estado;
      if (nota !== undefined) cambios.nota = nota;
      if (etiquetas !== undefined) cambios.etiquetas = etiquetas;
      if (valor_estimado !== undefined) cambios.valor_estimado = valor_estimado;
      if (motivo_perdida !== undefined) cambios.motivo_perdida = motivo_perdida;
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

    /** El mismo contador durable que el backend de archivo; ver ahí el porqué. */
    async contarEventos({ cliente = "intellectum", tipo, desde, ip, tope = 1000 } = {}) {
      const cliente_id = await idDe(cliente);
      const filtros = [
        `cliente_id=eq.${cliente_id}`,
        `tipo=eq.${encodeURIComponent(tipo)}`,
        desde ? `creado_en=gte.${encodeURIComponent(desde)}` : null,
        ip ? `detalle->>ip=eq.${encodeURIComponent(ip)}` : null,
      ].filter(Boolean);
      const filas = await pedir(`eventos?${filtros.join("&")}&select=id&limit=${tope}`);
      return filas?.length ?? 0;
    },

    async listarEventos({ cliente = "intellectum", limite = 50 } = {}) {
      const cliente_id = await idDe(cliente);
      return await pedir(
        `eventos?cliente_id=eq.${cliente_id}&order=creado_en.desc&limit=${limite}`,
      );
    },

    /**
     * Trae las entregas por páginas. PostgREST corta las respuestas largas, así
     * que se pide de mil en mil hasta que se acaben o hasta el tope. Si se llega
     * al tope se avisa (truncado: true) en vez de dar un promedio a medias como
     * si fuera completo.
     */
    async consumoDeMensajes({ cliente = "intellectum", dias = 30 } = {}) {
      const cliente_id = await idDe(cliente);
      const desde = haceDias(dias);
      const PAGINA = 1000;
      const TOPE = 20_000;

      const filas = [];
      let truncado = false;
      for (let salto = 0; salto < TOPE; salto += PAGINA) {
        const pagina = await pedir(
          `eventos?cliente_id=eq.${cliente_id}&tipo=eq.mensaje_entregado` +
            `&creado_en=gte.${encodeURIComponent(desde)}` +
            `&select=detalle&order=creado_en.desc&limit=${PAGINA}&offset=${salto}`,
        );
        filas.push(...(pagina ?? []));
        if (!pagina || pagina.length < PAGINA) break;
        if (salto + PAGINA >= TOPE) truncado = true;
      }

      return { ...resumirEntregas(filas, { dias, desde }), truncado };
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

    /**
     * Lo que distingue a un cliente de otro: su ficha (lo que su agente sabe)
     * y su plan (lo que su agente puede hacer).
     *
     * Devuelve null —y quien llama usa lo de Intellectum— si el cliente no
     * existe o si la base no contesta. Un agente que responde con la ficha de
     * casa es un problema; un agente que no responde es uno peor.
     */
    async fichaDeCliente({ cliente = "intellectum" } = {}) {
      try {
        const filas = await pedir(
          `clientes?slug=eq.${encodeURIComponent(cliente)}&select=slug,nombre,plan,ficha,activo&limit=1`,
        );
        const fila = filas?.[0];
        if (!fila || fila.activo === false) return null;
        return { slug: fila.slug, nombre: fila.nombre, plan: fila.plan, ficha: fila.ficha || null };
      } catch (err) {
        console.error("[ALMACEN] no se pudo leer la ficha del cliente:", err?.message ?? err);
        return null;
      }
    },

    /**
     * De quién es el número por el que entró este mensaje.
     *
     * La columna whatsapp_phone_id la agrega supabase/multicliente.sql. Si
     * TODAVÍA NO se aplicó, PostgREST responde 400 al pedirla — y entonces
     * esto devuelve null y todo sigue atendiéndose como Intellectum, que es
     * como funcionaba antes. El día que Paul pegue el SQL, empieza a enrutar
     * sin que haya que tocar el código.
     */
    async clientePorTelefono({ phone_number_id } = {}) {
      if (!phone_number_id) return null;
      try {
        const filas = await pedir(
          `clientes?whatsapp_phone_id=eq.${encodeURIComponent(phone_number_id)}` +
            `&select=slug,nombre,plan,ficha,activo&limit=1`,
        );
        const fila = filas?.[0];
        if (!fila || fila.activo === false) return null;
        return { slug: fila.slug, nombre: fila.nombre, plan: fila.plan, ficha: fila.ficha || null };
      } catch (err) {
        console.log("[ALMACEN] sin enrutamiento por número (¿falta multicliente.sql?):", err?.message ?? err);
        return null;
      }
    },

    async leadPorId({ id, cliente = "intellectum" } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `leads?cliente_id=eq.${cliente_id}&id=eq.${encodeURIComponent(id)}&limit=1`,
      );
      return filas?.[0] ?? null;
    },

    /**
     * La cotización que se le dio a este lead, tal como se le dijo. Se guarda
     * en la bitácora al calcularla; el PDF la lee de ahí en vez de recalcular,
     * para que el papel nunca diga algo distinto de lo prometido en el chat.
     */
    async cotizacionDeLead({ lead_id, cliente = "intellectum" } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `eventos?cliente_id=eq.${cliente_id}&tipo=eq.cotizacion_entregada` +
          `&detalle->>lead_id=eq.${encodeURIComponent(lead_id)}` +
          `&select=detalle&order=creado_en.desc&limit=1`,
      );
      return filas?.[0]?.detalle ?? null;
    },

    /**
     * Los seguimientos que la propia persona pidió y ya les llegó la fecha.
     * Pesan más que la regla automática: alguien que dijo "escríbeme el jueves"
     * no es alguien a quien hay que perseguir, es alguien que dio permiso.
     */
    async seguimientosVencidos({ cliente = "intellectum", ahora = new Date() } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `eventos?cliente_id=eq.${cliente_id}&tipo=eq.seguimiento_programado` +
          `&detalle->>para_fecha=lte.${encodeURIComponent(ahora.toISOString())}` +
          `&select=detalle&order=creado_en.desc&limit=500`,
      );
      return (filas ?? []).map((f) => f.detalle).filter(Boolean);
    },

    /**
     * ¿A este número ya le escribimos por WhatsApp tras una llamada?
     *
     * Dapta reintenta su aviso cuando algo falla de nuestro lado, y ese
     * reintento no puede costarle a la persona un segundo mensaje idéntico:
     * escribirle dos veces seguidas desde un número comercial es exactamente lo
     * que la lleva a bloquearlo. Se pregunta por la entrega REAL (el evento solo
     * existe si Meta la aceptó), no por una marca aparte que podría mentir.
     *
     * Veinte horas: cubre de sobra cualquier reintento y trata dos llamadas del
     * mismo día como lo que son, una sola gestión. Al día siguiente, si vuelve a
     * llamar y vuelve a aceptar, vuelve a recibirlo — y eso está bien.
     */
    async yaEscritoTrasLlamada({ cliente = "intellectum", sesion, horas = 20 } = {}) {
      if (!sesion) return false;
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `eventos?cliente_id=eq.${cliente_id}&tipo=eq.mensaje_entregado` +
          `&detalle->>motivo=eq.tras_llamada` +
          `&detalle->>sesion=eq.${encodeURIComponent(sesion)}` +
          `&creado_en=gte.${encodeURIComponent(haceHoras(horas))}&select=id&limit=1`,
      );
      return Boolean(filas?.length);
    },

    /** Quién pidió SALIR. Se devuelve como conjunto para filtrar de un vistazo. */
    async sesionesDeBaja({ cliente = "intellectum", canal = "whatsapp" } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `bajas?cliente_id=eq.${cliente_id}&canal=eq.${encodeURIComponent(canal)}` +
          `&select=sesion&limit=5000`,
      );
      return new Set((filas ?? []).map((f) => f.sesion));
    },

    /**
     * A qué leads ya se les mandó el seguimiento. La ventana de 60 días cubre
     * de sobra el plazo máximo de seguimiento (30) sin traerse la bitácora
     * entera, y el reloj de retención borra lo viejo de todas formas.
     */
    async leadsYaSeguidos({ cliente = "intellectum", dias = 60 } = {}) {
      const cliente_id = await idDe(cliente);
      const filas = await pedir(
        `eventos?cliente_id=eq.${cliente_id}&tipo=eq.seguimiento_enviado` +
          `&creado_en=gte.${encodeURIComponent(haceDias(dias))}&select=detalle&limit=5000`,
      );
      return new Set((filas ?? []).map((f) => f.detalle?.lead_id).filter(Boolean));
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

/**
 * En el archivo local un lead no se reescribe: cada edición añade una versión
 * nueva con el mismo id. Sin esto, editar un lead lo duplicaba en el panel y
 * leadDeSesion podía devolver la versión vieja — o sea, la nota que acabas de
 * escribir desaparecía de la vista. Gana la última escrita, que es el mismo
 * criterio que ya usaban las conversaciones.
 *
 * Contra Supabase no hace falta: allá el UPDATE pisa la fila.
 */
function ultimaVersion(filas) {
  const porId = new Map();
  for (const f of filas) porId.set(f.id, f);
  return [...porId.values()];
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
