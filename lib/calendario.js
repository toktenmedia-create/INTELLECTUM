/**
 * LA AGENDA — Google Calendar.
 *
 * Habla con Google por HTTP puro, sin la librería oficial, por la misma razón
 * que lib/almacen.js habla con Supabase a mano: este código tiene que poder
 * mudarse a Cloudflare Workers sin reescribirse. Se firma con WebCrypto, que
 * existe igual en Node 20+ y en Workers.
 *
 * CÓMO SE CONECTA (sin pantallas de permisos de Google):
 * Se usa una CUENTA DE SERVICIO y se le comparte el calendario, en vez del
 * típico "inicia sesión con Google". No es un atajo: una app que pide permisos
 * de calendario a terceros necesita que Google la revise y apruebe, igual de
 * lento que el trámite de Meta. Compartir un calendario, en cambio, es un clic
 * del dueño y se revoca igual de rápido.
 *
 * DOS CALENDARIOS, A PROPÓSITO:
 *   - CALENDARIO_CITAS      → donde se escriben las citas. Uno dedicado.
 *   - CALENDARIOS_OCUPACION → todos los que hay que mirar para no pisar algo
 *                             ya reservado, incluido el personal.
 * El personal se comparte solo como "ver disponibilidad", así que Google
 * devuelve las horas ocupadas pero jamás de qué se trata cada evento. Se evita
 * el choque de citas sin que este código pueda leer la vida privada de nadie.
 *
 * Si faltan las variables, agendaConfigurada() devuelve false y el asistente
 * simplemente no ofrece agendar. Nunca promete una agenda que no existe.
 */

const ZONA = "America/Guayaquil";
const DESFASE = "-05:00"; // Ecuador continental no cambia de hora nunca.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const ALCANCE = "https://www.googleapis.com/auth/calendar";

/** Reglas de la agenda. Salen de la ficha; si cambian allá, cámbialas aquí. */
export const REGLAS_AGENDA = {
  duracionMinutos: 30, // la consultoría gratuita
  aperturaHora: 9, // 09:00
  cierreHora: 17, // 17:00 — última cita empieza 16:30
  diasHabiles: [1, 2, 3, 4, 5], // lunes a viernes; sábado es solo con cita previa
  pasoMinutos: 30,
  anticipacionMinimaMinutos: 120, // no se agenda para dentro de una hora
  horizonteDias: 14, // hasta dónde mirar hacia adelante
  maximoOpciones: 6, // cuántas horas ofrecerle a la persona
};

/** ¿Hay con qué hablarle a Google? */
export function agendaConfigurada() {
  return Boolean(
    process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && calendarioCitas(),
  );
}

function calendarioCitas() {
  return process.env.GOOGLE_CALENDAR_ID || "";
}

function calendariosOcupacion() {
  const extra = String(process.env.GOOGLE_CALENDARS_OCUPACION || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return [...new Set([calendarioCitas(), ...extra])].filter(Boolean);
}

// ─── autenticación ───────────────────────────────────────────────────────────

let tokenEnCache = null; // { valor, expira }

async function token() {
  if (tokenEnCache && tokenEnCache.expira > Date.now() + 60_000) return tokenEnCache.valor;

  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = base64url(
    JSON.stringify({
      iss: process.env.GOOGLE_SA_EMAIL,
      scope: ALCANCE,
      aud: TOKEN_URL,
      iat: ahora,
      exp: ahora + 3600,
    }),
  );

  const firma = await firmar(`${cabecera}.${cuerpo}`, process.env.GOOGLE_SA_PRIVATE_KEY);
  const jwt = `${cabecera}.${cuerpo}.${firma}`;

  const respuesta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Google no dio token (${respuesta.status}): ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  tokenEnCache = {
    valor: datos.access_token,
    expira: Date.now() + (datos.expires_in ?? 3600) * 1000,
  };
  return tokenEnCache.valor;
}

async function firmar(texto, clavePem) {
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    pemADer(clavePem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    clave,
    new TextEncoder().encode(texto),
  );
  return base64urlDesdeBytes(new Uint8Array(firma));
}

/**
 * La clave llega como una sola línea con "\n" escritos literalmente, porque así
 * es como sobrevive dentro de una variable de entorno. Hay que devolvérselos.
 */
function pemADer(pem) {
  const limpio = String(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

const base64url = (texto) => base64urlDesdeBytes(new TextEncoder().encode(texto));

function base64urlDesdeBytes(bytes) {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── horas libres ────────────────────────────────────────────────────────────

/**
 * Devuelve las próximas horas libres, ya cruzadas contra lo que Google dice
 * que está ocupado.
 *
 * @returns {Promise<Array<{inicio: string, fin: string, etiqueta: string}>>}
 */
/**
 * @param {object} opciones
 * @param {number} [opciones.maximo]       cuántas horas devolver en total
 * @param {number} [opciones.diasMaximos]  cuántos días distintos como mucho
 *
 * Los dos parámetros existen porque el chat y la página necesitan cosas
 * opuestas. En una conversación, seis horas repartidas en seis días son fáciles
 * de leer en voz alta y dan sensación de disponibilidad. En una página, eso se
 * ve vacío: quien mira un calendario quiere ver POCOS días con opciones de
 * verdad, no una hora suelta por día durante dos semanas.
 */
export async function horariosLibres({
  maximo = REGLAS_AGENDA.maximoOpciones,
  diasMaximos = 0,
} = {}) {
  const candidatos = candidatosDeAgenda();
  if (candidatos.length === 0) return [];

  const desde = candidatos[0].inicio;
  const hasta = candidatos[candidatos.length - 1].fin;

  const [ocupados, feriados] = await Promise.all([
    franjasOcupadas(desde, hasta),
    diasFeriados(desde, hasta),
  ]);

  let libres = candidatos.filter(
    (slot) => !feriados.has(diaEnEcuador(slot.inicio)) && !chocaCon(slot, ocupados),
  );

  // Recortar a los primeros N días ANTES de repartir: si se recortara después,
  // el reparto ya habría gastado el cupo picoteando de catorce días distintos.
  if (diasMaximos > 0) {
    const dias = [];
    for (const slot of libres) {
      const dia = diaEnEcuador(slot.inicio);
      if (!dias.includes(dia)) dias.push(dia);
      if (dias.length >= diasMaximos) break;
    }
    libres = libres.filter((slot) => dias.includes(diaEnEcuador(slot.inicio)));
  }

  const repartidos =
    diasMaximos > 0 ? repartirDentroDelDia(libres, maximo, diasMaximos) : repartirEntreDias(libres, maximo);

  return repartidos.map((slot) => ({
    codigo: codigoDeSlot(slot.inicio),
    inicio: slot.inicio,
    fin: slot.fin,
    etiqueta: etiquetaHumana(slot.inicio),
  }));
}

/**
 * Reparte las horas de cada día a lo ancho de la jornada, no las primeras
 * seguidas.
 *
 * Sin esto, una página con seis huecos por día muestra 09:00, 09:30, 10:00,
 * 10:30, 11:00 y 11:30: pura mañana. Quien solo puede por la tarde concluye,
 * con razón, que no hay hueco para él. Tomando una de cada N se ve la jornada
 * entera y la agenda parece —y es— lo que de verdad está libre.
 */
function repartirDentroDelDia(libres, maximo, diasMaximos) {
  const porDia = new Map();
  for (const slot of libres) {
    const dia = diaEnEcuador(slot.inicio);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(slot);
  }

  const dias = [...porDia.values()].slice(0, diasMaximos);
  const porCadaDia = Math.max(1, Math.floor(maximo / Math.max(1, dias.length)));
  const elegidos = [];

  for (const delDia of dias) {
    if (delDia.length <= porCadaDia) {
      elegidos.push(...delDia);
      continue;
    }
    // Una de cada N, incluyendo siempre la primera y la última del día.
    const paso = (delDia.length - 1) / (porCadaDia - 1);
    for (let i = 0; i < porCadaDia; i++) {
      elegidos.push(delDia[Math.round(i * paso)]);
    }
  }

  return elegidos.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
}

/**
 * Reparte las opciones entre días distintos en vez de dar las primeras seguidas.
 *
 * POR QUÉ EXISTE: tomar las 6 primeras horas libres devolvía siempre 6 horas
 * del MISMO día (09:00, 09:30, 10:00...). El asistente solo veía ese día, así
 * que a quien pedía otro le contestaba "solo tengo el lunes" — falso, porque
 * la agenda mira dos semanas. Cada persona que no podía ese día se perdía.
 *
 * Reparte en rondas: primero la hora más temprana de cada día, luego la
 * segunda de cada día, y así. Con el máximo por defecto se acaban ofreciendo
 * horas de varios días, que es lo que permite decir "tengo el lunes, el
 * miércoles o el jueves".
 */
function repartirEntreDias(libres, maximo) {
  const porDia = new Map();
  for (const slot of libres) {
    const dia = diaEnEcuador(slot.inicio);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(slot);
  }

  const dias = [...porDia.values()];
  const elegidos = [];
  for (let ronda = 0; elegidos.length < maximo; ronda++) {
    let hubo = false;
    for (const delDia of dias) {
      if (ronda >= delDia.length) continue;
      elegidos.push(delDia[ronda]);
      hubo = true;
      if (elegidos.length >= maximo) break;
    }
    if (!hubo) break; // no queda nada por repartir
  }

  // Cronológico otra vez: el asistente las lee en orden y no confunde a nadie.
  return elegidos.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
}

/** Todas las horas que la regla permite, sin mirar todavía el calendario. */
function candidatosDeAgenda() {
  const slots = [];
  const desde = new Date(Date.now() + REGLAS_AGENDA.anticipacionMinimaMinutos * 60_000);

  for (let d = 0; d < REGLAS_AGENDA.horizonteDias; d++) {
    const dia = new Date(Date.now() + d * 86_400_000);
    const { anio, mes, diaMes, diaSemana } = partesEnEcuador(dia);
    if (!REGLAS_AGENDA.diasHabiles.includes(diaSemana)) continue;

    const ultimoInicio = REGLAS_AGENDA.cierreHora * 60 - REGLAS_AGENDA.duracionMinutos;
    for (
      let minutos = REGLAS_AGENDA.aperturaHora * 60;
      minutos <= ultimoInicio;
      minutos += REGLAS_AGENDA.pasoMinutos
    ) {
      const inicio = fechaEcuador(anio, mes, diaMes, Math.floor(minutos / 60), minutos % 60);
      if (new Date(inicio) < desde) continue;
      const fin = new Date(new Date(inicio).getTime() + REGLAS_AGENDA.duracionMinutos * 60_000);
      slots.push({ inicio, fin: fin.toISOString() });
    }
  }

  return slots;
}

/**
 * El código corto de una hora: "1708-1430" es el 17 de agosto a las 14:30.
 *
 * Existe porque pedirle al modelo que copie una fecha completa
 * ("2026-08-17T19:30:00.000Z") lo hacía tropezar de verdad: fallaba la llamada,
 * intentaba corregirse, y sus propios intentos de corrección terminaban
 * escritos dentro de los otros campos y de ahí en el correo al cliente.
 *
 * Nueve caracteres se copian bien. Y como el código se vuelve a calcular desde
 * la agenda, no hace falta recordar qué se ofreció en el mensaje anterior: si
 * el código no corresponde a una hora realmente libre, no resuelve y no se
 * agenda nada.
 */
export function codigoDeSlot(iso) {
  const { mes, diaMes } = partesEnEcuador(new Date(iso));
  const dd = (n) => String(n).padStart(2, "0");
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${dd(diaMes)}${dd(mes)}-${hora.replace(":", "")}`;
}

/** Devuelve el instante exacto de un código, o null si no es una hora ofrecible. */
export function inicioDesdeCodigo(codigo) {
  const limpio = String(codigo ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(limpio)) return null;
  return candidatosDeAgenda().find((s) => codigoDeSlot(s.inicio) === limpio)?.inicio ?? null;
}

/** Le pregunta a Google qué franjas están tomadas, sin ver de qué se tratan. */
async function franjasOcupadas(desdeISO, hastaISO) {
  const respuesta = await fetch(`${API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: new Date(desdeISO).toISOString(),
      timeMax: new Date(hastaISO).toISOString(),
      timeZone: ZONA,
      items: calendariosOcupacion().map((id) => ({ id })),
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Google falló al consultar ocupación (${respuesta.status}): ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  const franjas = [];

  for (const [id, calendario] of Object.entries(datos.calendars ?? {})) {
    // Un calendario que no se pudo leer es peligroso: si lo ignoramos en
    // silencio, ese calendario deja de contar y se pisan citas reales.
    if (calendario.errors?.length) {
      throw new Error(
        `No se pudo leer el calendario ${id}: ${calendario.errors.map((e) => e.reason).join(", ")}. ` +
          `Revisa que esté compartido con ${process.env.GOOGLE_SA_EMAIL}.`,
      );
    }
    for (const b of calendario.busy ?? []) {
      franjas.push({ inicio: new Date(b.start).getTime(), fin: new Date(b.end).getTime() });
    }
  }

  return franjas;
}

/**
 * Los feriados nacionales, del calendario oficial de Google para Ecuador.
 *
 * Hace falta preguntarlos aparte porque los feriados vienen marcados como
 * "libre", no como "ocupado": si solo miráramos la ocupación, la agenda
 * ofrecería con toda naturalidad una cita el 10 de agosto. La ficha dice que
 * los feriados no se atienden, y esto es lo que lo hace cierto.
 *
 * Si el calendario no se puede leer, se avisa y se sigue. Ofrecer un feriado
 * es un error molesto pero reversible; dejar la agenda muda por no poder leer
 * la lista de feriados sería peor.
 */
async function diasFeriados(desdeISO, hastaISO) {
  const calendario =
    process.env.GOOGLE_CALENDAR_FERIADOS || "es.ec#holiday@group.v.calendar.google.com";
  if (calendario === "ninguno") return new Set();

  try {
    const parametros = new URLSearchParams({
      timeMin: new Date(desdeISO).toISOString(),
      timeMax: new Date(hastaISO).toISOString(),
      singleEvents: "true",
      maxResults: "50",
    });

    const respuesta = await fetch(
      `${API}/calendars/${encodeURIComponent(calendario)}/events?${parametros}`,
      { headers: { Authorization: `Bearer ${await token()}` } },
    );

    if (!respuesta.ok) throw new Error(`${respuesta.status}: ${await respuesta.text()}`);

    const datos = await respuesta.json();
    const dias = new Set();

    for (const evento of datos.items ?? []) {
      // Los feriados son eventos de día completo: traen "date", no "dateTime".
      const inicio = evento.start?.date;
      const fin = evento.end?.date; // exclusivo, según el formato de Google
      if (!inicio) continue;

      for (let d = new Date(`${inicio}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
        const clave = d.toISOString().slice(0, 10);
        if (fin && clave >= fin) break;
        dias.add(clave);
        if (!fin) break;
      }
    }

    return dias;
  } catch (err) {
    console.error("[AGENDA] no se pudieron leer los feriados:", err?.message ?? err);
    return new Set();
  }
}

/** "2026-08-10" — el día en que cae ese instante, visto desde Ecuador. */
function diaEnEcuador(iso) {
  const { anio, mes, diaMes } = partesEnEcuador(new Date(iso));
  const dd = (n) => String(n).padStart(2, "0");
  return `${anio}-${dd(mes)}-${dd(diaMes)}`;
}

function chocaCon(slot, ocupados) {
  const desde = new Date(slot.inicio).getTime();
  const hasta = new Date(slot.fin).getTime();
  return ocupados.some((o) => desde < o.fin && hasta > o.inicio);
}

// ─── reservar ────────────────────────────────────────────────────────────────

/**
 * Crea la cita. Vuelve a comprobar la disponibilidad justo antes de escribir:
 * entre que el asistente ofreció la hora y la persona la aceptó pueden pasar
 * varios minutos, y en ese rato alguien más pudo tomarla.
 */
/**
 * El código que se le da a la persona para mover o cancelar su cita.
 *
 * Sin alfabeto confuso: no hay O ni 0, ni I ni 1. La gente lo va a leer de un
 * correo y lo va a teclear en un chat, y "¿es un cero o una o?" es exactamente
 * el tipo de fricción que hace que en vez de reagendar solos te escriban a ti.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function nuevoCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

/**
 * Busca una cita futura por su código.
 *
 * El código va guardado como propiedad privada del evento, no en el texto, y
 * la búsqueda se hace por esa propiedad. Así el agente público jamás recorre
 * la lista de citas: o tiene el código de una, o no ve ninguna. Es la misma
 * regla de siempre — un visitante solo puede tocar lo suyo.
 */
export async function buscarPorCodigo(codigo) {
  const limpio = String(codigo ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(limpio)) return null;

  const parametros = new URLSearchParams({
    privateExtendedProperty: `codigo=${limpio}`,
    timeMin: new Date().toISOString(),
    singleEvents: "true",
    maxResults: "5",
  });

  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events?${parametros}`,
    { headers: { Authorization: `Bearer ${await token()}` } },
  );

  if (!respuesta.ok) {
    throw new Error(`No se pudo buscar la cita (${respuesta.status}): ${await respuesta.text()}`);
  }

  const evento = (await respuesta.json()).items?.[0];
  if (!evento) return null;

  return {
    id: evento.id,
    codigo: limpio,
    inicio: evento.start?.dateTime,
    fin: evento.end?.dateTime,
    etiqueta: etiquetaHumana(evento.start?.dateTime),
    contacto: evento.extendedProperties?.private?.contacto ?? "",
    nombre: evento.extendedProperties?.private?.nombre ?? "",
    secuencia: Number(evento.extendedProperties?.private?.secuencia ?? 0),
  };
}

/** Mueve una cita ya existente a otra hora, conservando su código. */
export async function moverCita(cita, nuevoInicioISO) {
  const inicio = new Date(nuevoInicioISO);
  const fin = new Date(inicio.getTime() + REGLAS_AGENDA.duracionMinutos * 60_000);
  const slot = { inicio: inicio.toISOString(), fin: fin.toISOString() };

  const ocupados = (await franjasOcupadas(slot.inicio, slot.fin)).filter(
    // La propia cita no cuenta como choque consigo misma.
    (o) => !(o.inicio === new Date(cita.inicio).getTime() && o.fin === new Date(cita.fin).getTime()),
  );
  if (chocaCon(slot, ocupados)) {
    return { ok: false, motivo: "ocupado", etiqueta: etiquetaHumana(slot.inicio) };
  }

  const secuencia = cita.secuencia + 1;

  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events/${encodeURIComponent(cita.id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: slot.inicio, timeZone: ZONA },
        end: { dateTime: slot.fin, timeZone: ZONA },
        extendedProperties: { private: { secuencia: String(secuencia), recordada: "" } },
      }),
    },
  );

  if (!respuesta.ok) {
    throw new Error(`No se pudo mover la cita (${respuesta.status}): ${await respuesta.text()}`);
  }

  return {
    ok: true,
    ...cita,
    inicio: slot.inicio,
    fin: slot.fin,
    secuencia,
    etiqueta: etiquetaHumana(slot.inicio),
  };
}

export async function crearCita({ inicioISO, nombre, contacto, telefono, empresa, motivo }) {
  const inicio = new Date(inicioISO);
  if (Number.isNaN(inicio.getTime())) throw new Error("La hora de inicio no es una fecha válida.");

  const fin = new Date(inicio.getTime() + REGLAS_AGENDA.duracionMinutos * 60_000);
  const slot = { inicio: inicio.toISOString(), fin: fin.toISOString() };

  const ocupados = await franjasOcupadas(slot.inicio, slot.fin);
  if (chocaCon(slot, ocupados)) {
    return { ok: false, motivo: "ocupado", etiqueta: etiquetaHumana(slot.inicio) };
  }

  const codigo = nuevoCodigo();

  const cuerpo = {
    summary: `Consultoría — ${nombre || "sin nombre"}${empresa ? ` (${empresa})` : ""}`,
    description: [
      `Agendada por IntelliA desde intellectum.ec.`,
      ``,
      `Nombre: ${nombre || "no indicado"}`,
      `Contacto: ${contacto || "no indicado"}`,
      `Empresa: ${empresa || "no indicada"}`,
      ``,
      `Lo que quiere resolver:`,
      motivo || "no indicado",
    ].join("\n"),
    start: { dateTime: slot.inicio, timeZone: ZONA },
    end: { dateTime: slot.fin, timeZone: ZONA },
    // Sin "attendees" a propósito: una cuenta de servicio no puede invitar a
    // nadie sin delegación de dominio, y el intento hace fallar toda la
    // petición. La invitación al prospecto se manda por correo, con su .ics.
    reminders: { useDefault: true },
    // Guardado como propiedad privada y no en el texto: así se puede buscar la
    // cita por código sin recorrer la lista de citas de nadie más.
    extendedProperties: {
      private: {
        codigo,
        contacto: contacto || "",
        // El número de WhatsApp si la cita se agendó por ese canal: es lo que
        // permite que el recordatorio del día llegue por WhatsApp y no solo
        // por correo.
        telefono: telefono || "",
        nombre: nombre || "",
        secuencia: "0",
        recordada: "",
      },
    },
  };

  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    },
  );

  if (!respuesta.ok) {
    throw new Error(`Google no pudo crear la cita (${respuesta.status}): ${await respuesta.text()}`);
  }

  const evento = await respuesta.json();

  // LA CARRERA. Entre "revisé que estaba libre" y "creé el evento" pasan unos
  // segundos, y dos personas eligiendo la misma hora caben en ellos: Google no
  // rechaza eventos superpuestos, así que ambas creaciones "triunfan". El
  // arreglo es optimista: crear primero y comprobar después. Si en la franja
  // quedó otro evento creado ANTES que el nuestro, el nuestro sobra — se borra
  // y se le dice a la persona que la hora se ocupó. Los dos lados de la
  // carrera hacen esta misma comprobación y siempre sobrevive exactamente uno.
  // Si la comprobación en sí falla, la cita queda: mejor un choque rarísimo
  // que borrarle la hora a alguien por un tropiezo de red.
  try {
    if (await laGanoOtro(evento, slot)) {
      await cancelarCita(evento.id).catch((err) =>
        console.error("[CITA] choque detectado pero no se pudo retirar la copia:", err?.message),
      );
      return { ok: false, motivo: "ocupado", etiqueta: etiquetaHumana(slot.inicio) };
    }
  } catch (err) {
    console.error("[CITA] no se pudo comprobar el choque:", err?.message ?? err);
  }

  return {
    ok: true,
    id: evento.id,
    codigo,
    nombre,
    contacto,
    telefono: telefono || "",
    secuencia: 0,
    inicio: slot.inicio,
    fin: slot.fin,
    etiqueta: etiquetaHumana(slot.inicio),
    enlace: evento.htmlLink ?? null,
  };
}

/**
 * ¿Hay en la franja un evento más antiguo que el nuestro? El desempate es por
 * fecha de creación (y por id si nacieron en el mismo instante): un criterio
 * que los dos lados de la carrera calculan igual sin hablarse.
 */
async function laGanoOtro(nuestro, slot) {
  const url =
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events` +
    `?timeMin=${encodeURIComponent(slot.inicio)}&timeMax=${encodeURIComponent(slot.fin)}` +
    `&singleEvents=true&showDeleted=false&maxResults=10`;
  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!respuesta.ok) {
    throw new Error(`Google no pudo listar la franja (${respuesta.status})`);
  }
  const { items = [] } = await respuesta.json();

  return items.some((e) => {
    if (e.id === nuestro.id || e.status === "cancelled") return false;
    if (!e.start?.dateTime || !e.end?.dateTime) return false; // los de día entero no compiten
    const creadoOtro = `${e.created ?? ""}|${e.id}`;
    const creadoNuestro = `${nuestro.created ?? ""}|${nuestro.id}`;
    return creadoOtro < creadoNuestro;
  });
}

/** Cancela una cita ya creada. */
export async function cancelarCita(idEvento) {
  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events/${encodeURIComponent(idEvento)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
  );
  // 410 = ya estaba cancelada. Para quien llama, es el mismo resultado.
  if (!respuesta.ok && respuesta.status !== 410) {
    throw new Error(`No se pudo cancelar (${respuesta.status}): ${await respuesta.text()}`);
  }
  return { ok: true };
}

// ─── invitación para el prospecto ────────────────────────────────────────────

/**
 * Un .ics para que la persona la agregue a su propio calendario de un clic.
 * Se manda adjunto en el correo de confirmación.
 */
/**
 * @param {object} cita
 * @param {boolean} [cita.cancelada]  si va, el calendario de la persona borra el evento
 *
 * El UID y la SECUENCIA son lo que convierte un segundo .ics en una
 * actualización y no en una cita duplicada. Mismo UID = mismo evento; secuencia
 * más alta = esta versión manda. Sin eso, mover una cita le dejaría dos en el
 * calendario y llegaría a la hora vieja.
 */
export function invitacionICS({ inicioISO, finISO, nombre, id, secuencia = 0, cancelada = false }) {
  const sello = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Intellectum AI Solutions//IntelliA//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelada ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${id || Date.now()}@intellectum.ec`,
    `SEQUENCE:${secuencia}`,
    `DTSTAMP:${sello(new Date().toISOString())}`,
    `DTSTART:${sello(inicioISO)}`,
    `DTEND:${sello(finISO)}`,
    "SUMMARY:Consultoría gratuita — Intellectum AI Solutions",
    `DESCRIPTION:Consultoría de 30 minutos con el equipo de Intellectum.${nombre ? ` Reservada por ${escaparICS(nombre)}.` : ""}`,
    "ORGANIZER;CN=Intellectum AI Solutions:mailto:info@intellectum.ec",
    `STATUS:${cancelada ? "CANCELLED" : "CONFIRMED"}`,
    ...(cancelada
      ? []
      : [
          "BEGIN:VALARM",
          "TRIGGER:-PT30M",
          "ACTION:DISPLAY",
          "DESCRIPTION:Tu consultoría con Intellectum empieza en 30 minutos",
          "END:VALARM",
        ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Las citas desde ahora hacia adelante, para que el panel muestre la agenda
 * que viene sin abrir Google Calendar.
 */
export async function citasProximas({ dias = 14 } = {}) {
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + dias * 86_400_000);

  const parametros = new URLSearchParams({
    timeMin: ahora.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events?${parametros}`,
    { headers: { Authorization: `Bearer ${await token()}` } },
  );

  if (!respuesta.ok) {
    throw new Error(`No se pudieron leer las citas próximas (${respuesta.status})`);
  }

  return ((await respuesta.json()).items ?? [])
    .filter((e) => e.start?.dateTime && e.status !== "cancelled")
    .map((e) => ({
      id: e.id,
      inicio: e.start.dateTime,
      etiqueta: etiquetaHumana(e.start.dateTime),
      titulo: e.summary ?? "",
      codigo: e.extendedProperties?.private?.codigo ?? "",
      contacto: e.extendedProperties?.private?.contacto ?? "",
      telefono: e.extendedProperties?.private?.telefono ?? "",
      nombre: e.extendedProperties?.private?.nombre ?? "",
    }));
}

/**
 * Las citas de hoy que todavía no recibieron su recordatorio.
 *
 * La marca vive en el propio evento, no en una lista aparte: si el aviso diario
 * corre dos veces, nadie recibe el correo dos veces.
 */
export async function citasDeHoySinRecordar() {
  const ahora = new Date();
  const { anio, mes, diaMes } = partesEnEcuador(ahora);
  const dd = (n) => String(n).padStart(2, "0");
  const desde = new Date(`${anio}-${dd(mes)}-${dd(diaMes)}T00:00:00${DESFASE}`);
  const hasta = new Date(`${anio}-${dd(mes)}-${dd(diaMes)}T23:59:59${DESFASE}`);

  const parametros = new URLSearchParams({
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const respuesta = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events?${parametros}`,
    { headers: { Authorization: `Bearer ${await token()}` } },
  );

  if (!respuesta.ok) {
    throw new Error(`No se pudieron leer las citas de hoy (${respuesta.status})`);
  }

  return (await respuesta.json()).items
    .filter((e) => e.start?.dateTime && new Date(e.start.dateTime) > ahora)
    .map((e) => ({
      id: e.id,
      inicio: e.start.dateTime,
      etiqueta: etiquetaHumana(e.start.dateTime),
      titulo: e.summary ?? "",
      codigo: e.extendedProperties?.private?.codigo ?? "",
      contacto: e.extendedProperties?.private?.contacto ?? "",
      telefono: e.extendedProperties?.private?.telefono ?? "",
      nombre: e.extendedProperties?.private?.nombre ?? "",
      recordada: Boolean(e.extendedProperties?.private?.recordada),
    }));
}

export async function marcarRecordada(idEvento) {
  await fetch(
    `${API}/calendars/${encodeURIComponent(calendarioCitas())}/events/${encodeURIComponent(idEvento)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ extendedProperties: { private: { recordada: "1" } } }),
    },
  );
}

const escaparICS = (t) => String(t).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

// ─── fechas ──────────────────────────────────────────────────────────────────

/** Qué día y hora es en Ecuador, sin importar dónde corra el servidor. */
function partesEnEcuador(fecha) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);

  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const anio = Number(valor("year"));
  const mes = Number(valor("month"));
  const diaMes = Number(valor("day"));

  // El día de la semana se calcula, no se lee de un texto traducido: según la
  // versión de ICU, "short" puede venir como "Mon" o como "Mon.", y esa sola
  // diferencia dejaría la agenda sin ningún día hábil y sin dar error.
  const dd = (n) => String(n).padStart(2, "0");
  const diaSemana = new Date(`${anio}-${dd(mes)}-${dd(diaMes)}T12:00:00Z`).getUTCDay();

  return { anio, mes, diaMes, diaSemana };
}

/** Arma un instante exacto a partir de una hora local de Ecuador. */
function fechaEcuador(anio, mes, dia, hora, minuto) {
  const dd = (n) => String(n).padStart(2, "0");
  return new Date(
    `${anio}-${dd(mes)}-${dd(dia)}T${dd(hora)}:${dd(minuto)}:00${DESFASE}`,
  ).toISOString();
}

/** "el martes 19 de agosto a las 10:30" — para que el asistente lo diga tal cual. */
export function etiquetaHumana(iso) {
  const texto = new Intl.DateTimeFormat("es-EC", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

  return texto.replace(/,/g, "").replace(/\s+/g, " ").trim();
}
