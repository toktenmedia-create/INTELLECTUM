/**
 * LAS MANOS DE LOS AGENTES.
 *
 * Un solo catálogo con todo lo que un agente puede hacer. Cada herramienta dice:
 *   - ambito: "publico"  → la puede usar el agente que atiende a desconocidos.
 *             "privado"  → solo el agente al que le hablas tú, ya identificado.
 *   - estado: "listo"    → está construida y probada; se le entrega al modelo.
 *             "en_construccion" → está en el plan pero NO se le entrega al
 *                                 modelo todavía. Existe aquí para que el
 *                                 catálogo comercial sepa distinguir lo que ya
 *                                 se puede vender de lo que no.
 *   - requiere_confirmacion → el agente la prepara pero no la ejecuta: queda
 *             esperando tu visto bueno. Es la regla para todo lo irreversible.
 *
 * REGLA QUE NO SE NEGOCIA: ninguna herramienta de ámbito "publico" puede leer
 * datos de otras conversaciones. Un visitante solo puede tocar lo suyo. Todo lo
 * que consulta información acumulada vive en "privado".
 */

import { FICHA } from "./ficha.js";
import { entregarLead, enviarAviso, enviarConfirmacionCita } from "./leads.js";
import {
  agendaConfigurada,
  horariosLibres,
  cancelarCita,
  buscarPorCodigo,
  moverCita,
  citasProximas,
  inicioDesdeCodigo,
  invitacionICS,
} from "./calendario.js";
import { agendarConsultoria } from "./agendar.js";
import { esPersistente, dondeSeGuarda } from "./almacen.js";
import { avisarEquipoWhatsApp, normalizarTelefono } from "./mensajeria.js";
import { RESUMEN_COTIZACION } from "./seguimiento.js";
import { enviarDocumentoWhatsApp } from "./mensajeria.js";
import { enviarCotizacionPorCorreo } from "./leads.js";
import { enlaceDeCotizacion, referenciaDe, nombreDeArchivo } from "./documento.js";
import { PRECIOS, rango, dolares } from "./precios.js";
import { PLANES, HERRAMIENTAS_PRIVADAS, planDe } from "./planes.js";

/**
 * Cuánto dura "la misma oportunidad" para no partir un lead en dos.
 * Igual que el hilo de conversación: pasado un mes, quien vuelve trae un caso
 * nuevo y se registra aparte.
 */
const DIAS_MISMA_OPORTUNIDAD = 30;

/**
 * Limpia los campos del lead antes de guardarlo.
 *
 * POR QUÉ EXISTE: el esquema exige todos los campos, así que cuando el modelo
 * no sabe uno tiene que mandar algo igual. Casi siempre manda cadena vacía,
 * como se le pide, pero se le han visto restos de formato interno colándose
 * como valor ("</antml3" quedó guardado como nombre de empresa el 22 ago 2026).
 * Un CRM con basura adentro deja de ser confiable, y confiar en que el modelo
 * se porte bien no es una defensa: se limpia aquí, del lado del servidor.
 *
 * Solo descarta lo que NINGÚN humano escribiría en ese campo. No corrige
 * ortografía ni normaliza nada: el dato del cliente se respeta como vino.
 */
const BASURA =
  /^(?:[\s<>/\\|_\-–—.]*|<\/?[a-z][^>]*>?|(?:[^\s]*antml[^\s]*)|n\/?a|null|undefined|none|vac[ií]o|no (?:lo )?(?:dio|indic[oó]|especific[oó]))\.?$/i;

/**
 * La escalera comercial, de menor a mayor. El orden importa: es lo que
 * permite subir a alguien un peldaño sin escribir la tabla de casos a mano.
 */
const ESCALERA = ["asistente", "recepcionista", "asesor", "jefe_ventas"];

/** Sube un peldaño; en el último se queda donde está. */
const subirPeldano = (clave) =>
  ESCALERA[Math.min(ESCALERA.indexOf(clave) + 1, ESCALERA.length - 1)];

/** Nunca por debajo del mínimo que exige lo que pidió el cliente. */
const alMenos = (clave, minimo) =>
  ESCALERA.indexOf(clave) >= ESCALERA.indexOf(minimo) ? clave : minimo;

/**
 * Traduce las respuestas del visitante a un rango de la matriz de precios.
 *
 * Reglas de negocio: la voz nunca va sola (se monta sobre el Asesor Comercial
 * o superior); más de 40 consultas diarias suben un peldaño, porque el tope de
 * conversaciones del plan chico no las aguanta; cada integración mencionada
 * suma su rango a la implementación; un proyecto web que además quiere
 * WhatsApp o voz cotiza web MÁS plan de agente, porque el Asistente de
 * Recepción incluido en la web no cubre esos canales. El valor_estimado del
 * lead es la implementación mínima más seis mensualidades: una vara
 * conservadora y uniforme para comparar oportunidades, no una promesa.
 */
export function calcularCotizacion({
  objetivo,
  quiere_whatsapp = false,
  quiere_llamadas = false,
  integraciones = 0,
  volumen_diario,
}) {
  // Tolerante a tipos: sin modo estricto el modelo puede mandar "true" o "2".
  const si = (v) => v === true || v === "true";
  const n = Math.min(Math.max(0, Math.round(Number(integraciones) || 0)), 5);
  const extra = [n * PRECIOS.integracion_extra[0], n * PRECIOS.integracion_extra[1]];
  const notaExtra = n > 0 ? ` (incluye ${n > 1 ? `${n} integraciones` : "1 integración"})` : "";

  const proyecto = PRECIOS.proyectos[objetivo];
  const quiereVoz = si(quiere_llamadas);
  const quiereWhatsapp = si(quiere_whatsapp);

  // Proyecto web sin canales extra: pago único, y toda web nace con el
  // Asistente de Recepción adentro. Si además pidió WhatsApp o voz, se sigue
  // de largo: la web se suma al plan de agente más abajo.
  if (proyecto && !quiereWhatsapp && !quiereVoz) {
    const total = [proyecto.rango[0] + extra[0], proyecto.rango[1] + extra[1]];
    return {
      concepto: proyecto.nombre + notaExtra,
      resumen: rango(total),
      valor_estimado: total[0],
      // Las piezas sueltas, además del texto: el PDF de la cotización las
      // necesita separadas para maquetarlas, no como una frase.
      implementacion: total,
      mensualidad: 0,
      conversaciones_incluidas: 0,
      integraciones: n,
      detalle:
        `${proyecto.nombre}: ${rango(total)}, pago único${notaExtra}. ` +
        "Incluye el Asistente de Recepción integrado con su primer mes de servicio: la web " +
        "nace atendiendo sola.",
    };
  }

  // Plan de agente según lo que pidió, sobre la escalera de cuatro peldaños.
  let clave =
    objetivo === "procesos_internos"
      ? "jefe_ventas"
      : quiereWhatsapp || objetivo === "citas_y_agenda"
        ? "recepcionista"
        : "asistente";

  // Más de 40 consultas al día no caben en el tope del plan que le tocaría.
  if (volumen_diario === "mas_de_40") clave = subirPeldano(clave);

  // La voz no se monta sobre los dos planes de entrada: sin cotizador ni
  // seguimiento, el agente de voz no tiene dónde dejar lo que levanta.
  if (quiereVoz) clave = alMenos(clave, "asesor");

  const plan = PRECIOS.planes[clave];

  const base = proyecto
    ? [proyecto.rango[0] + plan.implementacion[0], proyecto.rango[1] + plan.implementacion[1]]
    : plan.implementacion;
  let impl = [base[0] + extra[0], base[1] + extra[1]];
  let mensual = plan.mensualidad;
  let concepto = (proyecto ? `${proyecto.nombre} + ` : "") + plan.nombre + notaExtra;
  if (quiereVoz) {
    impl = [impl[0] + PRECIOS.modulo_voz.implementacion[0], impl[1] + PRECIOS.modulo_voz.implementacion[1]];
    mensual += PRECIOS.modulo_voz.mensualidad;
    concepto += " + Módulo de voz";
  }

  return {
    concepto,
    resumen: `${rango(impl)} + ${dolares(mensual)}/mes`,
    valor_estimado: impl[0] + 6 * mensual,
    implementacion: impl,
    mensualidad: mensual,
    conversaciones_incluidas: plan.conversaciones_incluidas,
    minutos_incluidos: quiereVoz ? PRECIOS.modulo_voz.minutos_incluidos : 0,
    excedente_por_100: PRECIOS.excedente_por_100,
    integraciones: n,
    plan_nombre: plan.nombre,
    detalle:
      `${concepto}: implementación única ${rango(impl)}, más ${dolares(mensual)} mensuales ` +
      `con hasta ${plan.conversaciones_incluidas} conversaciones incluidas` +
      (quiereVoz ? ` y ${PRECIOS.modulo_voz.minutos_incluidos} minutos de voz` : "") +
      `. Excedente: ${dolares(PRECIOS.excedente_por_100)} por cada 100 conversaciones adicionales.`,
  };
}

export function limpiarLead(entrada) {
  const limpio = { ...entrada };
  for (const [campo, valor] of Object.entries(limpio)) {
    if (typeof valor !== "string") continue;
    const podado = valor.trim();
    // Solo se descarta cuando el valor ENTERO es basura. Un dato real que por
    // casualidad lleve un signo raro adentro se guarda tal cual: preferimos un
    // campo con una rareza a perder el dato que el cliente sí dio.
    limpio[campo] = BASURA.test(podado) ? "" : podado;
  }
  return limpio;
}

export const HERRAMIENTAS = {
  // ───────────────────────────────────────────────────────────────────────────
  // PÚBLICAS — las usa el agente que atiende
  // ───────────────────────────────────────────────────────────────────────────

  guardar_lead: {
    ambito: "publico",
    estado: "listo",
    resumen_comercial: "Captura el contacto y lo entrega calificado.",
    definicion: {
      name: "guardar_lead",
      description:
        "Registra a un prospecto interesado para que el equipo lo contacte. " +
        "Si la conversación pasó por la herramienta cotizar, NO la uses: cotizar ya " +
        "registró a la persona. " +
        "Úsala UNA sola vez por conversación y solo cuando ya tengas su nombre y un medio " +
        "de contacto real (email o teléfono). Nunca inventes datos: si no sabes algo, " +
        "envía una cadena vacía en ese campo.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre de la persona. Vacío si no lo dio." },
          contacto: {
            type: "string",
            description: "Email o número de teléfono tal como lo escribió la persona.",
          },
          empresa: { type: "string", description: "Nombre de su empresa. Vacío si no lo dio." },
          sector: {
            type: "string",
            description: "A qué se dedica la empresa (clínica, retail, inmobiliaria, etc.).",
          },
          cargo: {
            type: "string",
            description: "Rol de la persona: dueño, gerente, operaciones, TI...",
          },
          necesidad: {
            type: "string",
            description: "El proceso concreto que quiere automatizar y por qué le duele hoy.",
          },
          tamano_empresa: {
            type: "string",
            description: "Tamaño aproximado del equipo o volumen de atención, si lo mencionó.",
          },
          urgencia: {
            type: "string",
            enum: ["alta", "media", "baja", "no_indicada"],
            description:
              "alta = quiere resolverlo ya o este mes; media = próximos meses; baja = solo explorando.",
          },
          resumen: {
            type: "string",
            description: "Dos o tres líneas para que el equipo entienda la conversación sin leerla.",
          },
        },
        required: [
          "nombre",
          "contacto",
          "empresa",
          "sector",
          "cargo",
          "necesidad",
          "tamano_empresa",
          "urgencia",
          "resumen",
        ],
        additionalProperties: false,
      },
    },
    async ejecutar(entradaCruda, ctx) {
      const entrada = limpiarLead(entradaCruda);

      // Dos destinos: el almacén (para que el panel y el agente privado lo vean)
      // y las salidas de siempre (log, correo, webhook). Si el almacén falla, la
      // entrega por correo igual ocurre: nunca se pierde un lead por un fallo
      // de base de datos.
      let guardado = null;
      try {
        guardado = await ctx.almacen.guardarLead(entrada, {
          ...ctx.meta,
          cliente: ctx.cliente,
          canal: ctx.canal,
        });
      } catch (err) {
        console.error("[HERRAMIENTA] no se pudo guardar en el almacén:", err?.message ?? err);
      }

      const entrega = await entregarLead(entrada, { canal: ctx.canal, ...ctx.meta });

      return (
        `Lead registrado correctamente${guardado ? ` (id ${guardado.id})` : ""}. ` +
        `Entregas: ${JSON.stringify(entrega)}. ` +
        `Confirma a la persona que el equipo la contactará.`
      );
    },
  },

  cotizar: {
    ambito: "publico",
    estado: "listo",
    resumen_comercial: "Da un rango de precio serio al instante y registra el lead con su valor.",
    fase: 2,
    definicion: {
      name: "cotizar",
      description:
        "Calcula el rango de precio referencial de un proyecto y registra a la persona " +
        "como lead con ese valor. Úsala cuando pregunten precio o pidan cotización, pero " +
        "SOLO después de tener: qué quiere resolver, por qué canales, qué sistemas usa, " +
        "el volumen aproximado, y su nombre y contacto (explica que la cotización queda " +
        "registrada a su nombre para que el equipo le dé seguimiento). " +
        "Las cifras que devuelve son las ÚNICAS que puedes decir: jamás des " +
        "números de memoria. Esta herramienta ya registra a la persona: NO llames " +
        "también a guardar_lead.",
      // Sin strict a propósito: con él, la gramática combinada de todas las
      // herramientas del plan supera el límite de la API ("Schema is too
      // complex"). La validación tolerante vive en calcularCotizacion.
      input_schema: {
        type: "object",
        properties: {
          objetivo: {
            type: "string",
            enum: [
              "atencion_clientes",
              "citas_y_agenda",
              "pedidos_y_ventas",
              "procesos_internos",
              "landing",
              "sitio_web",
              "tienda_online",
              "otro",
            ],
            description: "Qué quiere resolver. landing/sitio_web/tienda_online son proyectos web.",
          },
          quiere_whatsapp: {
            type: "boolean",
            description: "true si quiere atender por WhatsApp (el chat web siempre va incluido).",
          },
          quiere_llamadas: {
            type: "boolean",
            description: "true si además quiere que un agente conteste llamadas de voz.",
          },
          integraciones: {
            type: "number",
            description:
              "Cuántos sistemas EXTERNOS habría que conectar. Google Calendar NO cuenta: " +
              "ya viene incluido, es la agenda de casa. Sí cuentan: ERP, CRM, hoja de " +
              "cálculo, agenda que no sea Google, pasarela de pagos, sistema propio. " +
              "0 si no mencionó ninguno; nómbralos en detalle.",
          },
          volumen_diario: {
            type: "string",
            enum: ["menos_de_10", "entre_10_y_40", "mas_de_40", "no_sabe"],
            description: "Consultas o pedidos que recibe al día, según la persona.",
          },
          nombre: { type: "string", description: "Nombre de la persona." },
          contacto: { type: "string", description: "Email o teléfono, tal como lo escribió." },
          detalle: {
            type: "string",
            description: "Una línea con lo que necesita, con sus propias palabras.",
          },
        },
        required: [
          "objetivo",
          "quiere_whatsapp",
          "quiere_llamadas",
          "integraciones",
          "volumen_diario",
          "nombre",
          "contacto",
          "detalle",
        ],
        additionalProperties: false,
      },
    },
    async ejecutar(entradaCruda, ctx) {
      const entrada = limpiarLead(entradaCruda);

      // Sin contacto real no hay cifra: es la regla del cotizador. Un correo o
      // un teléfono; lo demás se rebota para que el asistente lo pida bien.
      const contacto = String(entrada.contacto ?? "").trim();
      const esCorreo = contacto.includes("@") && contacto.includes(".");
      const esTelefono = normalizarTelefono(contacto) !== null;
      if (!entrada.nombre || (!esCorreo && !esTelefono)) {
        return (
          "Falta un contacto válido (email o teléfono) o el nombre. NO des ninguna " +
          "cifra todavía: pídele ese dato explicando que la cotización queda registrada " +
          "a su nombre y así el equipo puede darle seguimiento, y vuelve a llamar a " +
          "esta herramienta."
        );
      }

      const cotizacion = calcularCotizacion(entrada);

      // Una cotización por conversación: si esta sesión ya dejó un lead (por
      // una cotización anterior o por guardar_lead), se actualiza su valor en
      // vez de crear otra fila y mandar otro correo al equipo.
      //
      // Pero solo mientras siga siendo la MISMA conversación. En WhatsApp la
      // sesión es el número de la persona, o sea que dura para siempre: quien
      // vuelve meses después con otro proyecto trae una oportunidad nueva y
      // merece su propia fila, no que se le pise la anterior. La ventana es la
      // misma con la que caduca el hilo de charla (DIAS_HILO_VIVO en almacen).
      let existente = null;
      try {
        const previo = await ctx.almacen.leadDeSesion?.({
          cliente: ctx.cliente,
          canal: ctx.canal,
          sesion: ctx.meta?.sesion,
        });
        const edad = (Date.now() - new Date(previo?.creado_en ?? "").getTime()) / 86_400_000;
        if (previo && Number.isFinite(edad) && edad <= DIAS_MISMA_OPORTUNIDAD) existente = previo;
      } catch (err) {
        console.error("[HERRAMIENTA] sin lead de sesión:", err?.message ?? err);
      }
      if (existente) {
        // El campo `nota` es del dueño y aquí no se toca: pisarle su apunte
        // con un "Recotizó por chat..." costaba información humana que no se
        // recupera. La recotización queda como evento cotizacion_entregada —
        // el panel la muestra igual y el PDF pasa a leer la cifra más reciente.
        await ctx.almacen
          .actualizarLead({
            cliente: ctx.cliente,
            id: existente.id,
            valor_estimado: cotizacion.valor_estimado,
          })
          .catch((err) =>
            console.error("[HERRAMIENTA] no se pudo recotizar el lead:", err?.message ?? err),
          );
        try {
          await ctx.almacen.registrarEvento({
            tipo: "cotizacion_entregada",
            actor: "agente_publico",
            cliente: ctx.cliente,
            detalle: {
              lead_id: existente.id,
              canal: ctx.canal,
              sesion: ctx.meta?.sesion ?? null,
              recotizacion: true,
              concepto: cotizacion.concepto,
              resumen: cotizacion.resumen,
              implementacion: cotizacion.implementacion,
              mensualidad: cotizacion.mensualidad,
              conversaciones_incluidas: cotizacion.conversaciones_incluidas,
              minutos_incluidos: cotizacion.minutos_incluidos ?? 0,
              excedente_por_100: cotizacion.excedente_por_100 ?? 0,
              integraciones: cotizacion.integraciones ?? 0,
              necesidad: entrada.detalle || entrada.objetivo,
            },
          });
        } catch (err) {
          console.error("[HERRAMIENTA] la recotización quedó sin evento:", err?.message ?? err);
        }
        return (
          `Cotización recalculada (lead ${existente.id} actualizado): ${cotizacion.detalle}\n` +
          "Preséntala así: di el rango TAL CUAL, aclara que es referencial y sin IVA, y " +
          "que el número exacto sale del diagnóstico en la consultoría gratuita de 30 " +
          "minutos. Cierra ofreciendo agendarla. La persona ya estaba registrada: no " +
          "llames a guardar_lead ni prometas descuentos."
        );
      }

      // La persona queda registrada con el valor de su cotización: es el lead
      // más calificado que existe, porque ya sabe el rango y sigue interesado.
      const lead = {
        nombre: entrada.nombre,
        contacto,
        empresa: "",
        sector: "",
        cargo: "",
        necesidad: entrada.detalle || entrada.objetivo,
        tamano_empresa: "",
        urgencia: "no_indicada",
        // El prefijo NO es decorativo: lib/seguimiento.js lee de aquí qué se
        // le cotizó a la persona para el hueco {{2}} de la plantilla.
        resumen: `${RESUMEN_COTIZACION}${cotizacion.concepto}. Rango dado: ${cotizacion.resumen}.`,
        valor_estimado: cotizacion.valor_estimado,
      };
      let guardado = null;
      try {
        guardado = await ctx.almacen.guardarLead(lead, {
          ...ctx.meta,
          cliente: ctx.cliente,
          canal: ctx.canal,
        });
      } catch (err) {
        console.error("[HERRAMIENTA] cotización sin almacén:", err?.message ?? err);
      }

      // La cotización queda guardada ENTERA y atada a su lead. No es
      // estadística: es lo que lee el PDF cuando la persona lo pide. Si solo
      // se guardara la frase, el papel tendría que adivinar los números; y si
      // se recalculara al vuelo, un cambio de tarifas haría que el PDF dijera
      // algo distinto de lo que se le prometió en el chat.
      if (guardado?.id) {
        try {
          await ctx.almacen.registrarEvento({
            tipo: "cotizacion_entregada",
            actor: "agente_publico",
            cliente: ctx.cliente,
            detalle: {
              lead_id: guardado.id,
              canal: ctx.canal,
              sesion: ctx.meta?.sesion ?? null,
              concepto: cotizacion.concepto,
              resumen: cotizacion.resumen,
              implementacion: cotizacion.implementacion,
              mensualidad: cotizacion.mensualidad,
              conversaciones_incluidas: cotizacion.conversaciones_incluidas,
              minutos_incluidos: cotizacion.minutos_incluidos ?? 0,
              excedente_por_100: cotizacion.excedente_por_100 ?? 0,
              integraciones: cotizacion.integraciones ?? 0,
              necesidad: lead.necesidad,
            },
          });
        } catch (err) {
          console.error("[HERRAMIENTA] cotización sin bitácora:", err?.message ?? err);
        }
      }

      await entregarLead(lead, { canal: ctx.canal, ...ctx.meta }).catch((err) =>
        console.error("[HERRAMIENTA] cotización sin correo:", err?.message ?? err),
      );

      return (
        `Cotización calculada${guardado ? ` (lead ${guardado.id})` : ""}: ${cotizacion.detalle}\n` +
        "Preséntala así: di el rango TAL CUAL, aclara que es referencial y sin IVA, y " +
        "que el número exacto sale del diagnóstico en la consultoría gratuita de 30 " +
        "minutos. Cierra ofreciendo agendarla. La persona ya quedó registrada: no " +
        "llames a guardar_lead ni prometas descuentos."
      );
    },
  },

  escalar_a_humano: {
    ambito: "publico",
    estado: "listo",
    resumen_comercial: "Avisa al dueño en el momento, cuando el caso lo amerita.",
    definicion: {
      name: "escalar_a_humano",
      description:
        "Avisa de inmediato al equipo cuando la conversación necesita una persona: " +
        "un reclamo formal, un tema legal o contractual, prensa, una propuesta de alianza, " +
        "una oportunidad claramente grande, o alguien que pide hablar con un humano. " +
        "No la uses para preguntas normales que puedes responder tú.",
      // Sin strict a propósito: la API tiene un presupuesto de gramática para
      // el CONJUNTO de herramientas estrictas, y con las 6 del plan lo supera
      // ("Schema is too complex"). Se sacrifica aquí porque el resultado solo
      // alimenta un correo interno: ejecutar tolera cualquier entrada.
      input_schema: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            enum: [
              "pide_hablar_con_persona",
              "reclamo",
              "legal_o_contractual",
              "prensa",
              "alianza_o_proveeduria",
              "oportunidad_grande",
            ],
            description: "Por qué necesita una persona.",
          },
          urgencia: {
            type: "string",
            enum: ["alta", "normal"],
            description: "alta solo si esperar unas horas causaría un daño real.",
          },
          contacto: {
            type: "string",
            description: "Cómo ubicar a la persona. Cadena vacía si no lo dio.",
          },
          resumen: {
            type: "string",
            description: "Qué pasó, en dos o tres líneas, para que el equipo entre en contexto.",
          },
        },
        required: ["motivo", "urgencia", "contacto", "resumen"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      // Sin validación estricta el modelo podría omitir o inventar campos:
      // se normaliza aquí para que el correo al equipo siempre salga legible.
      const motivo = String(entrada.motivo || "no_indicado").slice(0, 100);
      const urgencia = entrada.urgencia === "alta" ? "alta" : "normal";
      const enviado = await enviarAviso({
        asunto: `Atención requerida (${motivo})`,
        cuerpo: [
          `Motivo: ${motivo}`,
          `Urgencia: ${urgencia}`,
          `Contacto: ${entrada.contacto || "no lo dio"}`,
          `Canal: ${ctx.canal}`,
          "",
          String(entrada.resumen || "(sin resumen)"),
        ].join("\n"),
      });

      return enviado.entregado
        ? "El equipo ya fue avisado. Dile a la persona que alguien la contactará, sin prometer un plazo concreto."
        : "No se pudo avisar automáticamente. Dale el correo info@intellectum.ec y el teléfono +593 98 312 0003 para que llame y escriba directo.";
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVADAS — solo para el agente al que le hablas tú
  // ───────────────────────────────────────────────────────────────────────────

  resumen_de_leads: {
    ambito: "privado",
    estado: "listo",
    resumen_comercial: "Responde por los números del negocio sin abrir el panel.",
    definicion: {
      name: "resumen_de_leads",
      description:
        "Devuelve los leads de un periodo con su desglose por urgencia y por sector. " +
        "Úsala siempre que te pregunten cuántos, cuáles o cómo viene el mes: nunca " +
        "respondas con un número de memoria.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          // Sin minimum/maximum: con validación estricta el esquema no los
          // admite en un entero. El rango se impone abajo, al ejecutar, que
          // además es donde de verdad hay que defenderse.
          dias: {
            type: "integer",
            description:
              "Cuántos días hacia atrás mirar, entre 1 y 365. 7 para la semana, 30 para el mes.",
          },
        },
        required: ["dias"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      const dias = Math.min(365, Math.max(1, Math.trunc(Number(entrada.dias) || 30)));
      entrada = { ...entrada, dias };
      const desde = new Date(Date.now() - dias * 86400000).toISOString();
      const leads = await ctx.almacen.listarLeads({ cliente: ctx.cliente, desde, limite: 500 });

      if (leads.length === 0) {
        return (
          `No hay ningún lead guardado en los últimos ${entrada.dias} días. ` +
          `${avisoDePersistencia()} Dilo tal cual: cero es cero, no lo maquilles.`
        );
      }

      return JSON.stringify({
        periodo_dias: entrada.dias,
        total: leads.length,
        por_urgencia: contar(leads, "urgencia"),
        por_sector: contar(leads, "sector"),
        por_canal: contar(leads, "canal"),
        ultimos: leads.slice(0, 5).map((l) => ({
          nombre: l.nombre,
          empresa: l.empresa,
          urgencia: l.urgencia,
          necesidad: l.necesidad,
          creado_en: l.creado_en,
        })),
        nota_fiabilidad: avisoDePersistencia(),
      });
    },
  },

  buscar_leads: {
    ambito: "privado",
    estado: "listo",
    resumen_comercial: "Encuentra un contacto por nombre, empresa o necesidad.",
    definicion: {
      name: "buscar_leads",
      description:
        "Busca leads por texto (nombre, empresa, sector o necesidad) y opcionalmente " +
        "filtra por urgencia. Úsala cuando pregunten por alguien en concreto o por un " +
        "grupo: 'los urgentes', 'los de clínicas', 'el de la inmobiliaria'.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          texto: {
            type: "string",
            description: "Qué buscar. Cadena vacía para traer todos y filtrar solo por urgencia.",
          },
          urgencia: {
            type: "string",
            enum: ["alta", "media", "baja", "no_indicada", "cualquiera"],
            description: "Filtro por urgencia. 'cualquiera' para no filtrar.",
          },
        },
        required: ["texto", "urgencia"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      const leads = await ctx.almacen.buscarLeads({
        cliente: ctx.cliente,
        texto: entrada.texto,
        urgencia: entrada.urgencia === "cualquiera" ? null : entrada.urgencia,
        limite: 20,
      });

      if (leads.length === 0) {
        return `Ningún lead coincide con esa búsqueda. ${avisoDePersistencia()}`;
      }

      return JSON.stringify({
        encontrados: leads.length,
        leads: leads.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          empresa: l.empresa,
          sector: l.sector,
          cargo: l.cargo,
          contacto: l.contacto,
          urgencia: l.urgencia,
          necesidad: l.necesidad,
          resumen: l.resumen,
          canal: l.canal,
          creado_en: l.creado_en,
        })),
      });
    },
  },

  revisar_ficha: {
    ambito: "privado",
    estado: "listo",
    resumen_comercial: "Dice qué le falta saber al agente para responder mejor.",
    definicion: {
      name: "revisar_ficha",
      description:
        "Revisa la ficha del cliente y devuelve qué campos siguen sin completar. " +
        "Úsala cuando pregunten qué falta configurar, por qué el agente no sabe algo, " +
        "o qué hay pendiente.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    async ejecutar(_entrada, _ctx) {
      const pendientes = [];
      for (const linea of FICHA.split("\n")) {
        if (!linea.includes("[PENDIENTE]")) continue;
        const campo = linea.split(":")[0].trim();
        const pista = linea.includes("(") ? linea.slice(linea.indexOf("(")) : "";
        pendientes.push(`${campo} ${pista}`.trim());
      }

      const servicios = (FICHA.match(/^- servicio:/gm) || []).length;

      return JSON.stringify({
        campos_pendientes: pendientes,
        cuantos_pendientes: pendientes.length,
        servicios_en_catalogo: servicios,
        nota:
          pendientes.length > 0
            ? "Mientras un campo diga PENDIENTE, el agente lo trata como 'no lo sé' y deriva al equipo."
            : "La ficha está completa.",
      });
    },
  },

  estado_del_sistema: {
    ambito: "privado",
    estado: "listo",
    resumen_comercial: "Reporta qué está encendido y qué falta conectar.",
    definicion: {
      name: "estado_del_sistema",
      description:
        "Reporta qué partes del sistema están configuradas y funcionando y cuáles no. " +
        "Úsala cuando pregunten cómo va todo, qué falta, por qué algo no funciona, o si " +
        "WhatsApp ya está activo.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    async ejecutar(_entrada, ctx) {
      // Solo se reporta si una variable EXISTE. Su valor jamás se imprime.
      const hay = (nombre) => Boolean(process.env[nombre]);

      const plan = planDe(ctx.plan);

      return JSON.stringify({
        cerebro: {
          modelo: ctx.modelo,
          api_key_de_claude: hay("ANTHROPIC_API_KEY") ? "definida" : "FALTA",
        },
        datos: {
          donde: dondeSeGuarda(),
          persistente: esPersistente(),
          advertencia: esPersistente()
            ? null
            : "Sin base de datos real: lo guardado puede desaparecer. Los conteos no son confiables.",
        },
        canales: {
          web: "activo",
          whatsapp:
            hay("META_TOKEN") && hay("META_PHONE_NUMBER_ID") && hay("META_APP_SECRET")
              ? "configurado"
              : "dormido (faltan las variables de Meta)",
        },
        salida_de_leads: {
          correo: hay("RESEND_API_KEY") && hay("LEADS_EMAIL") ? "activo" : "no configurado",
          webhook: hay("LEADS_WEBHOOK_URL") ? "activo" : "no configurado",
          registro: "siempre activo",
        },
        plan_del_cliente: {
          clave: ctx.plan,
          nombre: plan.nombre,
          herramientas_activas: herramientasPara({ ambito: "publico", plan: ctx.plan }).map(
            (h) => h.name,
          ),
        },
      });
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // AGENDA — Google Calendar. Se apagan solas si faltan las credenciales.
  // ───────────────────────────────────────────────────────────────────────────

  ver_disponibilidad: {
    ambito: "publico",
    estado: agendaConfigurada() ? "listo" : "en_construccion",
    resumen_comercial: "Consulta horarios libres en la agenda real.",
    fase: 5,
    definicion: {
      name: "ver_disponibilidad",
      description:
        "Consulta las próximas horas libres reales para la consultoría gratuita de 30 minutos. " +
        "Úsala en cuanto la persona muestre interés en agendar, ANTES de proponer cualquier hora: " +
        "nunca inventes horarios ni digas 'tengo libre el martes' sin haberla llamado. " +
        "Te devuelve cada hora con un código exacto que después debes pasarle a agendar_cita.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    async ejecutar(_entrada, ctx) {
      const libres = await horariosLibres();

      if (libres.length === 0) {
        return (
          "No hay horas libres en los próximos días. NO inventes ninguna: dile a la persona " +
          "que la agenda está llena esta semana y ofrécele tomar sus datos con guardar_lead " +
          "para que el equipo le proponga un horario."
        );
      }

      await ctx.almacen
        .registrarEvento?.({
          tipo: "consulta_disponibilidad",
          cliente: ctx.cliente,
          detalle: { opciones: libres.length },
        })
        .catch(() => {});

      return (
        "Horas libres. Ofrécele DOS O TRES, no la lista completa, y dile el día y la hora " +
        "tal como están escritos aquí. Cuando elija, pásale a agendar_cita el código:\n" +
        libres.map((h) => `- ${h.etiqueta}  →  código ${h.codigo}`).join("\n")
      );
    },
  },

  agendar_cita: {
    ambito: "publico",
    estado: agendaConfigurada() ? "listo" : "en_construccion",
    resumen_comercial: "Reserva la cita y manda la confirmación.",
    fase: 5,
    definicion: {
      name: "agendar_cita",
      description:
        "Reserva la consultoría gratuita de 30 minutos en la agenda real y le envía a la persona " +
        "la confirmación con la invitación para su calendario. Llámala SOLO cuando la persona ya " +
        "eligió una de las horas que te devolvió ver_disponibilidad y ya te dio su nombre y su " +
        "correo.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          codigo: {
            type: "string",
            description:
              "El código de la hora elegida, de ver_disponibilidad. Nueve caracteres, así: 1708-1430",
          },
          nombre: { type: "string", description: "Nombre de la persona." },
          contacto: {
            type: "string",
            description: "Su correo electrónico. Hace falta para mandarle la confirmación.",
          },
          empresa: { type: "string", description: "Su empresa. Vacío si no la dijo." },
          motivo: {
            type: "string",
            description: "En una o dos líneas, qué quiere resolver. Sirve para preparar la reunión.",
          },
        },
        required: ["codigo", "nombre", "contacto", "empresa", "motivo"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      // Un solo camino para agendar: el mismo lib/agendar.js que usa la página
      // /agenda. Antes esta herramienta tenía su propia copia de la secuencia
      // (crear la cita, guardar el lead, avisar, confirmar) y ya había
      // divergido de la otra puerta — dos códigos haciendo "lo mismo" es un
      // desacuerdo esperando fecha.
      const resultado = await agendarConsultoria({
        codigo: entrada.codigo,
        nombre: entrada.nombre,
        contacto: entrada.contacto,
        // Si la conversación es por WhatsApp, la sesión ES el número de la
        // persona: se guarda para que el recordatorio del día le llegue ahí.
        telefono: ctx.canal === "whatsapp" ? ctx.meta?.sesion || "" : "",
        empresa: entrada.empresa,
        motivo: entrada.motivo,
        almacen: ctx.almacen,
        cliente: ctx.cliente,
        canal: ctx.canal,
        meta: ctx.meta,
        origen: ctx.canal === "whatsapp" ? "IntelliA por WhatsApp" : "IntelliA por el chat web",
      });

      if (!resultado.ok && resultado.motivo === "hora_invalida") {
        return (
          "Ese código no corresponde a ninguna hora disponible. NO agendes nada ni le ofrezcas " +
          "esa hora. Vuelve a llamar a ver_disponibilidad y usa uno de los códigos que te dé."
        );
      }

      if (!resultado.ok) {
        return (
          `Esa hora (${resultado.cita?.etiqueta ?? "la elegida"}) se ocupó mientras conversaban. ` +
          `Discúlpate en una línea, llama otra vez a ver_disponibilidad y ofrécele las nuevas opciones.`
        );
      }

      const { cita, lead: guardado, correoLlego } = resultado;

      return (
        `Cita confirmada para ${cita.etiqueta}${guardado ? ` (lead ${guardado.id})` : ""}. ` +
        (correoLlego
          ? `Ya le llegó el correo con la invitación y con su código ${cita.codigo} para ` +
            `moverla o cancelarla. Confírmale día y hora en una línea; el código está en el ` +
            `correo, no hace falta que se lo repitas. `
          : `OJO: el correo de confirmación no salió. Dile la fecha y la hora en tu respuesta, ` +
            `pídele que la anote, y dale su código para cambios: ${cita.codigo}. `)
      );
    },
  },

  reagendar_cita: {
    ambito: "publico",
    estado: agendaConfigurada() ? "listo" : "en_construccion",
    resumen_comercial: "Mueve o cancela una cita ya tomada.",
    fase: 5,
    definicion: {
      name: "reagendar_cita",
      description:
        "Mueve o cancela una cita que la persona ya tenía. Necesita el código de seis " +
        "caracteres que le llegó en su correo de confirmación. Si no lo tiene, NO uses esta " +
        "herramienta: pídeselo, y si de verdad no lo encuentra usa escalar_a_humano. " +
        "Para mover, primero llama a ver_disponibilidad y deja que elija la hora nueva.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          codigo: {
            type: "string",
            description: "El código de su cita, seis caracteres. Ejemplo: K7M3PQ",
          },
          accion: {
            type: "string",
            enum: ["mover", "cancelar"],
            description: "Qué quiere hacer con su cita.",
          },
          nueva_hora: {
            type: "string",
            description:
              "Solo si accion es mover: el código de la hora nueva, de ver_disponibilidad " +
              "(así: 1808-0930). Cadena vacía si va a cancelar.",
          },
        },
        required: ["codigo", "accion", "nueva_hora"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      const cita = await buscarPorCodigo(entrada.codigo);

      if (!cita) {
        return (
          "No hay ninguna cita futura con ese código. NO inventes ni supongas cuál es: " +
          "pídele que revise el código en el correo de confirmación, tal como está escrito. " +
          "Si insiste en que no lo encuentra, usa escalar_a_humano."
        );
      }

      if (entrada.accion === "cancelar") {
        await cancelarCita(cita.id);
        await avisarCambioDeCita(cita, "cancelada", cita.etiqueta, ctx);
        return (
          `Cita del ${cita.etiqueta} cancelada. Confírmaselo con amabilidad, sin insistir en ` +
          `reagendar, y déjale claro que puede volver a escribir cuando quiera.`
        );
      }

      const nuevoInicio = inicioDesdeCodigo(entrada.nueva_hora);
      if (!nuevoInicio) {
        return (
          "Esa hora nueva no está disponible. Llama a ver_disponibilidad y ofrécele las horas " +
          "que te devuelva. La cita original sigue en pie: no le digas que se movió."
        );
      }

      const movida = await moverCita(cita, nuevoInicio);
      if (!movida.ok) {
        return (
          `Esa hora se ocupó recién. La cita del ${cita.etiqueta} sigue en pie. Discúlpate en ` +
          `una línea, vuelve a llamar a ver_disponibilidad y ofrécele otras.`
        );
      }

      await avisarCambioDeCita(movida, "movida", cita.etiqueta, ctx);
      return (
        `Cita movida de ${cita.etiqueta} a ${movida.etiqueta}. Ya le salió el correo con la ` +
        `invitación nueva, que reemplaza a la anterior en su calendario. Confírmaselo en una línea.`
      );
    },
  },

  ver_citas: {
    ambito: "privado",
    estado: agendaConfigurada() ? "listo" : "en_construccion",
    resumen_comercial: "Le dice al dueño qué citas vienen, sin abrir el calendario.",
    definicion: {
      name: "ver_citas",
      description:
        "Devuelve las citas agendadas desde ahora hacia adelante, con fecha, nombre, " +
        "contacto y código. Úsala SIEMPRE que el dueño pregunte por citas, agenda o " +
        "reuniones: nunca respondas de memoria.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          dias: {
            type: "integer",
            description:
              "Cuántos días hacia adelante mirar, entre 1 y 60. 1 para hoy, 7 para la semana; usa 14 si no te especifican.",
          },
        },
        required: ["dias"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada) {
      const dias = Math.min(60, Math.max(1, Math.trunc(Number(entrada.dias) || 14)));
      const citas = await citasProximas({ dias });

      if (citas.length === 0) {
        return `No hay ninguna cita agendada en los próximos ${dias} días. Dilo tal cual.`;
      }

      return JSON.stringify({
        periodo_dias: dias,
        total: citas.length,
        citas: citas.map((c) => ({
          cuando: c.etiqueta,
          nombre: c.nombre || c.titulo || "sin nombre",
          contacto: c.contacto || null,
          telefono: c.telefono || null,
          codigo: c.codigo || null,
        })),
      });
    },
  },

  ver_conversaciones: {
    ambito: "privado",
    estado: "listo",
    resumen_comercial: "Resume qué está conversando el asistente con los clientes.",
    definicion: {
      name: "ver_conversaciones",
      description:
        "Devuelve las conversaciones recientes del asistente público: canal, sesión " +
        "(el número de WhatsApp si vino de ahí), cuántos mensajes lleva y el último. " +
        "Úsala cuando el dueño pregunte qué se está conversando, si alguien escribió " +
        "o cómo quedó una charla con un cliente.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          limite: {
            type: "integer",
            description: "Cuántas conversaciones traer, entre 1 y 50. Usa 20 si no te especifican.",
          },
        },
        required: ["limite"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      const limite = Math.min(50, Math.max(1, Math.trunc(Number(entrada.limite) || 20)));
      const filas = await ctx.almacen.listarConversaciones({ cliente: ctx.cliente, limite });

      if (filas.length === 0) {
        return "No hay ninguna conversación guardada ahora mismo. Dilo tal cual.";
      }

      return JSON.stringify({
        total: filas.length,
        conversaciones: filas.map((f) => {
          const mensajes = Array.isArray(f.mensajes) ? f.mensajes : [];
          const ultimo = mensajes[mensajes.length - 1];
          return {
            canal: f.canal,
            sesion: f.sesion,
            mensajes: mensajes.length,
            ultimo: typeof ultimo?.content === "string" ? ultimo.content.slice(0, 200) : "",
            actualizado_en: f.actualizado_en,
          };
        }),
      });
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EN CONSTRUCCIÓN — declaradas para el catálogo comercial, NO entregadas al
  // modelo. Se activan cambiando estado a "listo" cuando se construyan.
  // ───────────────────────────────────────────────────────────────────────────

  programar_seguimiento: {
    ambito: "publico",
    estado: "listo",
    resumen_comercial: "Se compromete a volver a escribir en la fecha que pidió el cliente, y cumple.",
    // Sin strict: la gramática combinada ya está al tope con cuatro estrictas.
    // El esquema es de dos campos a propósito, por lo mismo.
    definicion: {
      name: "programar_seguimiento",
      description:
        "Anota que hay que volver a escribirle a esta persona por WhatsApp en unos días. " +
        "Úsala SOLO cuando ella lo pida o lo acepte ('escríbeme la próxima semana', " +
        "'déjame pensarlo y me avisas'). Nunca por tu cuenta. Requiere haber cotizado " +
        "antes en esta conversación.",
      input_schema: {
        type: "object",
        properties: {
          dias: {
            type: "number",
            description: "En cuántos días escribirle. Entre 1 y 30. Si dijo 'la próxima semana', 7.",
          },
          motivo: {
            type: "string",
            description: "Qué dijo la persona, en pocas palabras. Ej: 'quiere consultarlo con su socio'.",
          },
        },
        required: ["dias", "motivo"],
        additionalProperties: false,
      },
    },
    async ejecutar(entrada, ctx) {
      // El canal importa: lo que se programa se manda por WhatsApp con una
      // plantilla de Meta. A quien llegó por la web no se le puede escribir
      // primero por ahí, y prometérselo sería mentir.
      if (ctx.canal !== "whatsapp") {
        return (
          "Por el chat de la web no se puede escribir primero después. Dile que le " +
          "queda registrado y que el equipo le da seguimiento, u ofrécele agendar ya."
        );
      }

      let lead = null;
      try {
        lead = await ctx.almacen.leadDeSesion?.({
          cliente: ctx.cliente, canal: ctx.canal, sesion: ctx.meta?.sesion,
        });
      } catch (err) {
        console.error("[HERRAMIENTA] seguimiento sin lead:", err?.message ?? err);
      }
      if (!lead?.id) {
        return "Todavía no hay contacto registrado. Cotiza primero y después ofrécele el seguimiento.";
      }

      const dias = Math.min(Math.max(1, Math.round(Number(entrada.dias) || 0)), 30);
      const motivo = String(entrada.motivo ?? "").slice(0, 200);
      const paraFecha = new Date(Date.now() + dias * 86_400_000).toISOString();

      try {
        await ctx.almacen.registrarEvento({
          tipo: "seguimiento_programado",
          actor: "agente_publico",
          cliente: ctx.cliente,
          detalle: {
            canal: "whatsapp",
            lead_id: lead.id,
            sesion: ctx.meta?.sesion ?? null,
            para_fecha: paraFecha,
            dias,
            motivo,
          },
        });
      } catch (err) {
        console.error("[HERRAMIENTA] no se pudo programar:", err?.message ?? err);
        return "No se pudo dejar programado. NO se lo prometas: ofrécele que él escriba cuando quiera.";
      }

      // Sin fecha exacta a propósito: el envío salta fines de semana, así que
      // un "te escribo el sábado 30" sería una promesa que el sistema rompe.
      // "La próxima semana" es verdad siempre.
      return (
        `Seguimiento anotado (en ${dias} día(s) aprox.). Confírmaselo en términos ` +
        `aproximados —"la próxima semana", "en unos días"—, NUNCA con una fecha ` +
        `exacta, y sigue la conversación con naturalidad.`
      );
    },
  },
  // Construida y funcionando, pero NO es una herramienta que el modelo llame:
  // vive en lib/memoria.js y se le entrega ya resuelta en el system, antes de
  // que abra la boca. Por eso "automatica" y no "listo" — si dijera "listo",
  // herramientasPara() intentaría pasarle al modelo una definición que no
  // existe. Para el catálogo comercial cuenta como entregada.
  reconocer_contacto: {
    ambito: "publico",
    estado: "automatica",
    resumen_comercial: "Reconoce a quien ya escribió antes y retoma donde quedó.",
  },
  enviar_documento: {
    ambito: "publico",
    estado: "listo",
    resumen_comercial: "Manda la cotización en PDF, con la marca y los datos de contacto.",
    // Sin requiere_confirmacion a propósito. El papel no dice NADA que el
    // agente no haya dicho ya en voz alta en el mismo chat, y va únicamente al
    // contacto que la propia persona dejó. Pedirle permiso al dueño para cada
    // envío convertiría un "claro, te lo mando" en un "te lo mandan cuando lo
    // aprueben", que es peor que no ofrecerlo.
    //
    // Sin strict tampoco: ya hay cuatro herramientas estrictas y la gramática
    // combinada de todas se le indigesta a la API (ver el comentario de
    // escalar_a_humano).
    definicion: {
      name: "enviar_documento",
      description:
        "Manda a la persona SU cotización en PDF, con la marca de Intellectum y los " +
        "datos de contacto. Úsala solo si ya cotizaste en esta conversación y la " +
        "persona quiere el documento (lo pidió, o dijo que sí cuando se lo ofreciste). " +
        "Va sola al contacto que ella misma dejó: no hace falta pedirle la dirección " +
        "otra vez, y NO se puede mandar a otro lado.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    async ejecutar(_entrada, ctx) {
      let lead = null;
      try {
        lead = await ctx.almacen.leadDeSesion?.({
          cliente: ctx.cliente,
          canal: ctx.canal,
          sesion: ctx.meta?.sesion,
        });
      } catch (err) {
        console.error("[HERRAMIENTA] documento sin lead:", err?.message ?? err);
      }
      if (!lead?.id) {
        return (
          "Todavía no hay ninguna cotización registrada en esta conversación. " +
          "Cotiza primero con la herramienta cotizar y después ofrécele el PDF."
        );
      }

      const cotizacion = await ctx.almacen.cotizacionDeLead?.({
        cliente: ctx.cliente,
        lead_id: lead.id,
      });
      if (!cotizacion) {
        return (
          "El contacto está registrado pero sin cotización guardada, así que no hay " +
          "PDF que mandar. Ofrécele la consultoría gratuita en su lugar."
        );
      }

      const referencia = referenciaDe(lead.id);
      const bitacora = { almacen: ctx.almacen, cliente: ctx.cliente };

      // Por WhatsApp va el archivo mismo; Meta lo va a buscar al enlace firmado.
      if (ctx.canal === "whatsapp") {
        const { entregado } = await enviarDocumentoWhatsApp({
          para: ctx.meta?.sesion,
          enlace: enlaceDeCotizacion(lead.id),
          nombreArchivo: nombreDeArchivo(referencia),
          pie: `Tu cotización de ${cotizacion.concepto}. Los valores son referenciales y sin IVA.`,
          bitacora,
          motivo: "cotizacion_pdf",
        });
        return entregado
          ? `Cotización enviada por WhatsApp (referencia ${referencia}). Dilo con naturalidad y ofrece agendar la consultoría.`
          : "No se pudo mandar el documento por WhatsApp. Dilo sin dramatismo y ofrece mandárselo por correo.";
      }

      // Por la web va por correo, adjunto: así se reenvía al socio o al jefe.
      const correo = String(lead.contacto ?? "");
      if (!correo.includes("@")) {
        return (
          "La persona dejó un teléfono, no un correo, y por el chat de la web no se " +
          "puede adjuntar un archivo. Pídele un correo para mandárselo."
        );
      }

      try {
        const { construirCotizacionPDF } = await import("./cotizacion-pdf.js");
        const pdf = await construirCotizacionPDF({
          cotizacion,
          persona: { nombre: lead.nombre, empresa: lead.empresa, necesidad: lead.necesidad },
          fecha: new Date(lead.creado_en ?? Date.now()),
          referencia,
        });
        const { entregado } = await enviarCotizacionPorCorreo({
          para: correo,
          nombre: lead.nombre,
          pdf,
          referencia,
          concepto: cotizacion.concepto,
          resumen: cotizacion.resumen,
        });
        return entregado
          ? `Cotización enviada a ${correo} (referencia ${referencia}). Dilo con naturalidad y ofrece agendar la consultoría.`
          : "El correo no salió. Dilo con honestidad y ofrece el contacto directo del equipo.";
      } catch (err) {
        console.error("[HERRAMIENTA] no se pudo armar/enviar el PDF:", err?.message ?? err);
        return "No se pudo generar el documento. Dilo sin dramatismo y ofrece el contacto del equipo.";
      }
    },
  },
};

/**
 * Las herramientas que se le entregan al modelo en esta conversación.
 * Filtra por ámbito, por plan contratado y por estar realmente construidas.
 */
export function herramientasPara({ ambito = "publico", plan } = {}) {
  const permitidas = ambito === "privado" ? HERRAMIENTAS_PRIVADAS : planDe(plan).herramientas;

  return permitidas
    .map((nombre) => HERRAMIENTAS[nombre])
    .filter((h) => h && h.estado === "listo" && h.ambito === ambito)
    .map((h) => h.definicion);
}

/** Busca una herramienta por nombre, validando que corresponda al ámbito. */
export function buscarHerramienta(nombre, ambito) {
  const herramienta = HERRAMIENTAS[nombre];
  if (!herramienta) return null;
  if (herramienta.ambito !== ambito) return null; // cinturón de seguridad
  if (herramienta.estado !== "listo") return null;
  return herramienta;
}

/**
 * Para la conversación comercial: qué incluye cada plan HOY y qué queda
 * pendiente. Sirve para armar la propuesta sin prometer lo que no existe.
 */
export function loQueSeEntregaHoy() {
  const salida = {};

  for (const [clave, plan] of Object.entries(PLANES)) {
    const listas = [];
    const enObra = [];

    for (const nombre of plan.herramientas) {
      const h = HERRAMIENTAS[nombre];
      if (!h) continue;
      const linea = { nombre, descripcion: h.resumen_comercial };
      if (h.estado === "listo" || h.estado === "automatica") listas.push(linea);
      else enObra.push({ ...linea, fase: h.fase });
    }

    if (plan.agente_privado) {
      for (const nombre of HERRAMIENTAS_PRIVADAS) {
        const h = HERRAMIENTAS[nombre];
        if (h?.estado === "listo") {
          listas.push({ nombre, descripcion: h.resumen_comercial, privada: true });
        }
      }
    }

    salida[clave] = {
      nombre: plan.nombre,
      promesa: plan.promesa,
      entregable_hoy: listas,
      en_construccion: enObra,
      canales: plan.canales,
      agente_privado: plan.agente_privado,
    };
  }

  return salida;
}

// ─── auxiliares ──────────────────────────────────────────────────────────────

/**
 * Avisa del cambio a los dos lados: al equipo y a la persona.
 *
 * Ninguno de los dos correos puede tumbar la operación — la cita ya se movió o
 * ya se canceló en el calendario, y fallar al avisar no la devuelve atrás.
 */
async function avisarCambioDeCita(cita, cambio, etiquetaAnterior, ctx = null) {
  const titulo = cambio === "cancelada" ? "Cita cancelada" : "Cita movida";

  await Promise.allSettled([
    // El WhatsApp del dueño, además del correo: una cita que se cae es de las
    // pocas cosas que ameritan vibrar en el bolsillo.
    avisarEquipoWhatsApp({
      texto:
        cambio === "cancelada"
          ? `${cita.nombre || "Un cliente"} canceló su cita del ${etiquetaAnterior}. La hora ya quedó libre en el calendario. Contacto: ${cita.contacto || "no indicado"}.`
          : `${cita.nombre || "Un cliente"} movió su cita del ${etiquetaAnterior} al ${cita.etiqueta}. Contacto: ${cita.contacto || "no indicado"}.`,
      bitacora: ctx?.almacen ? { almacen: ctx.almacen, cliente: ctx.cliente } : null,
    }),
    enviarAviso({
      asunto: `${titulo}: ${cita.nombre || "sin nombre"}`,
      cuerpo: [
        cambio === "cancelada"
          ? `Se canceló la cita del ${etiquetaAnterior}.`
          : `Se movió del ${etiquetaAnterior} al ${cita.etiqueta}.`,
        ``,
        `Nombre: ${cita.nombre || "no indicado"}`,
        `Contacto: ${cita.contacto || "no indicado"}`,
        `Lo hizo la persona sola, desde el chat.`,
      ].join("\n"),
    }),
    enviarConfirmacionCita({
      para: cita.contacto,
      nombre: cita.nombre,
      cuando: cambio === "cancelada" ? etiquetaAnterior : cita.etiqueta,
      codigo: cita.codigo,
      cambio,
      ics: invitacionICS({
        inicioISO: cita.inicio,
        finISO: cita.fin,
        nombre: cita.nombre,
        id: cita.id,
        secuencia: cita.secuencia ?? 1,
        cancelada: cambio === "cancelada",
      }),
    }),
  ]).then((r) =>
    r.filter((x) => x.status === "rejected").forEach((x) =>
      console.error("[CITA] aviso de cambio falló:", x.reason?.message),
    ),
  );
}

function contar(lista, campo) {
  const cuenta = {};
  for (const item of lista) {
    const clave = (item[campo] || "sin_dato").toString().toLowerCase().trim();
    cuenta[clave] = (cuenta[clave] || 0) + 1;
  }
  return cuenta;
}

function avisoDePersistencia() {
  return esPersistente()
    ? ""
    : "OJO: todavía no hay base de datos real, los datos se guardan en un archivo temporal. " +
        "Avísale que este número puede estar incompleto.";
}
