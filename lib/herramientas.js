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
  crearCita,
  cancelarCita,
  buscarPorCodigo,
  moverCita,
  citasProximas,
  inicioDesdeCodigo,
  invitacionICS,
} from "./calendario.js";
import { esPersistente, dondeSeGuarda } from "./almacen.js";
import { PLANES, HERRAMIENTAS_PRIVADAS, planDe } from "./planes.js";

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
    async ejecutar(entrada, ctx) {
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
      strict: true,
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
      const enviado = await enviarAviso({
        asunto: `Atención requerida (${entrada.motivo})`,
        cuerpo: [
          `Motivo: ${entrada.motivo}`,
          `Urgencia: ${entrada.urgencia}`,
          `Contacto: ${entrada.contacto || "no lo dio"}`,
          `Canal: ${ctx.canal}`,
          "",
          entrada.resumen,
        ].join("\n"),
      });

      return enviado.entregado
        ? "El equipo ya fue avisado. Dile a la persona que alguien la contactará, sin prometer un plazo concreto."
        : "No se pudo avisar automáticamente. Dale el correo info@intellectum.ec y el WhatsApp +593 98 312 0003 para que escriba directo.";
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
      const inicioISO = inicioDesdeCodigo(entrada.codigo);

      if (!inicioISO) {
        return (
          "Ese código no corresponde a ninguna hora disponible. NO agendes nada ni le ofrezcas " +
          "esa hora. Vuelve a llamar a ver_disponibilidad y usa uno de los códigos que te dé."
        );
      }

      const cita = await crearCita({
        inicioISO,
        nombre: entrada.nombre,
        contacto: entrada.contacto,
        // Si la conversación es por WhatsApp, la sesión ES el número de la
        // persona: se guarda para que el recordatorio del día le llegue ahí.
        telefono: ctx.canal === "whatsapp" ? ctx.meta?.sesion || "" : "",
        empresa: entrada.empresa,
        motivo: entrada.motivo,
      });

      if (!cita.ok) {
        return (
          `Esa hora (${cita.etiqueta}) se ocupó mientras conversaban. Discúlpate en una línea, ` +
          `llama otra vez a ver_disponibilidad y ofrécele las nuevas opciones.`
        );
      }

      // El lead se guarda igual: una cita agendada es el mejor lead que hay.
      let guardado = null;
      try {
        guardado = await ctx.almacen.guardarLead(
          {
            nombre: entrada.nombre,
            contacto: entrada.contacto,
            empresa: entrada.empresa,
            necesidad: entrada.motivo,
            urgencia: "alta",
            // Quien agenda ya cruzó la línea de "nuevo": el panel lo recibe
            // como contactado. Ganado/perdido siguen siendo del dueño.
            estado: "contactado",
            resumen: `Agendó consultoría para ${cita.etiqueta}.`,
          },
          { ...ctx.meta, cliente: ctx.cliente, canal: ctx.canal },
        );
      } catch (err) {
        console.error("[CITA] no se pudo guardar el lead:", err?.message ?? err);
      }

      // Avisar al equipo y confirmarle a la persona. Ninguno de los dos puede
      // tumbar la cita: el evento ya está en el calendario.
      const [aviso, confirmacion] = await Promise.allSettled([
        enviarAviso({
          asunto: `Cita agendada: ${entrada.nombre}${entrada.empresa ? ` — ${entrada.empresa}` : ""}`,
          cuerpo: [
            `${cita.etiqueta} (hora de Ecuador)`,
            ``,
            `Nombre: ${entrada.nombre}`,
            `Contacto: ${entrada.contacto}`,
            `Empresa: ${entrada.empresa || "no indicada"}`,
            ``,
            `Quiere resolver: ${entrada.motivo}`,
            ``,
            cita.enlace ? `En el calendario: ${cita.enlace}` : "",
          ].join("\n"),
        }),
        enviarConfirmacionCita({
          para: entrada.contacto,
          nombre: entrada.nombre,
          cuando: cita.etiqueta,
          codigo: cita.codigo,
          cambio: "nueva",
          ics: invitacionICS({
            inicioISO: cita.inicio,
            finISO: cita.fin,
            nombre: entrada.nombre,
            id: cita.id,
          }),
        }),
      ]);

      const correoLlego = confirmacion.status === "fulfilled" && confirmacion.value?.entregado;
      if (confirmacion.status === "rejected") {
        console.error("[CITA] falló la confirmación:", confirmacion.reason?.message);
      }
      if (aviso.status === "rejected") {
        console.error("[CITA] falló el aviso al equipo:", aviso.reason?.message);
      }

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
        await avisarCambioDeCita(cita, "cancelada", cita.etiqueta);
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

      await avisarCambioDeCita(movida, "movida", cita.etiqueta);
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
    estado: "en_construccion",
    resumen_comercial: "Deja programado el recordatorio y lo ejecuta solo.",
    fase: 6,
  },
  reconocer_contacto: {
    ambito: "publico",
    estado: "en_construccion",
    resumen_comercial: "Reconoce a quien ya escribió antes y retoma donde quedó.",
    fase: 3,
  },
  enviar_documento: {
    ambito: "publico",
    estado: "en_construccion",
    requiere_confirmacion: true,
    resumen_comercial: "Envía ficha técnica o cotización, con tu visto bueno.",
    fase: 6,
  },
};

/**
 * Las herramientas que se le entregan al modelo en esta conversación.
 * Filtra por ámbito, por plan contratado y por estar realmente construidas.
 */
export function herramientasPara({ ambito = "publico", plan = "plataforma" } = {}) {
  const permitidas =
    ambito === "privado" ? HERRAMIENTAS_PRIVADAS : (PLANES[plan] ?? PLANES.plataforma).herramientas;

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
      if (h.estado === "listo") listas.push(linea);
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
async function avisarCambioDeCita(cita, cambio, etiquetaAnterior) {
  const titulo = cambio === "cancelada" ? "Cita cancelada" : "Cita movida";

  await Promise.allSettled([
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
