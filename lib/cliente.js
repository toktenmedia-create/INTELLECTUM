/**
 * DE QUIÉN ES ESTA COPIA.
 *
 * El mismo código atiende a varios negocios. La forma de saber cuál es este
 * NO es preguntárselo a la base en cada llamada: es una variable de entorno
 * que se pone una sola vez al publicar la copia. Vercel puede publicar este
 * mismo repositorio varias veces con configuraciones distintas, así que cada
 * negocio tiene su despliegue, su número de WhatsApp, su correo y su llave —
 * y todos comparten la misma base, que ya separa los datos por cliente.
 *
 * SIN NINGUNA VARIABLE PUESTA, todo esto devuelve exactamente lo que decía el
 * código antes de existir este archivo: Intellectum. Eso es deliberado. La
 * copia que ya está en producción no cambia de comportamiento por este cambio,
 * y una variable mal escrita degrada a "como siempre", nunca a un negocio
 * equivocado.
 *
 * Qué va aquí y qué NO:
 *   - Aquí: la identidad pública que el agente reparte y que aparece en los
 *     mensajes fijos (los que se escriben sin pasar por el modelo).
 *   - En la ficha del cliente (columna `ficha` de la tabla clientes): todo lo
 *     que el agente tiene que SABER — qué vende, sus precios, sus horarios.
 *   - En las variables de infraestructura de cada despliegue: los secretos
 *     (META_TOKEN, GOOGLE_CALENDAR_ID, AGENTE_PRIVADO_TOKEN...). Esos no se
 *     leen aquí; los lee cada módulo donde se usan.
 */

/** El slug del negocio dueño de esta copia. Es la clave de la tabla clientes. */
export const CLIENTE = (process.env.CLIENTE_SLUG ?? "").trim() || "intellectum";

/** Un texto de variable de entorno, o el respaldo si viene vacío. */
function texto(nombre, respaldo) {
  const valor = (process.env[nombre] ?? "").trim();
  return valor || respaldo;
}

/**
 * Un nombre presentable sacado del slug: "ferreteria-tornillo" → "Ferreteria
 * Tornillo".
 *
 * Es el último recurso para el NOMBRE del negocio, y existe porque el nombre
 * no admite ninguna de las dos salidas de siempre. Dejarlo vacío rompe frases
 * enteras ("Eres el asistente virtual de ", la firma del correo, el .ics), y
 * caer en "Intellectum AI Solutions" es exactamente lo que esta etapa vino a
 * impedir: una copia mal publicada se presentaría ante los clientes de otro
 * negocio como si fuera Intellectum. Con esto queda feo pero suyo, se nota al
 * primer vistazo que falta configurarlo, y nunca dice el nombre de nadie más.
 */
function nombreDesdeSlug(slug) {
  return String(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Igual que texto(), pero el respaldo de casa SOLO vale para casa.
 *
 * Es la diferencia entre un dato de estilo y un dato de contacto. Que la copia
 * de una ferretería sin configurar llame "IntelliA" a su agente es feo; que le
 * dé a sus clientes el correo y el WhatsApp de Intellectum es mandarle la
 * gente a otra empresa. Cuando el dato es de contacto y la copia es de otro,
 * antes que decir algo ajeno se prefiere no decir nada, y quien lo lee más
 * abajo se encarga de armar la frase sin ese pedazo.
 */
function contacto(nombre, respaldoDeCasa) {
  return texto(nombre, esIntellectum() ? respaldoDeCasa : "");
}

/**
 * La identidad pública del negocio. Se usa en el prompt del agente y en los
 * mensajes fijos: la baja, la disculpa por un tropiezo, el aviso de tope.
 * Los valores de respaldo son los de Intellectum, que es de quien es la copia
 * que hoy está publicada.
 */
export const NEGOCIO = {
  get slug() {
    return CLIENTE;
  },
  /** Razón social o nombre comercial completo. */
  get nombre() {
    return texto("NEGOCIO_NOMBRE", esIntellectum() ? "Intellectum AI Solutions" : nombreDesdeSlug(CLIENTE));
  },
  /** Cómo se le nombra en una frase corriente ("el equipo de X"). */
  get nombreCorto() {
    return texto("NEGOCIO_NOMBRE_CORTO", esIntellectum() ? "Intellectum" : NEGOCIO.nombre);
  },
  /**
   * Cómo se llama el asistente. "IntelliA" es el de Intellectum y solo suyo:
   * aparecería en el PRODID del .ics y en los correos de otro negocio. Si el
   * cliente no le puso nombre, el asistente se llama como el negocio, que es
   * justo lo que aconseja la plantilla de alta.
   */
  get agente() {
    return texto("NEGOCIO_AGENTE", esIntellectum() ? "IntelliA" : NEGOCIO.nombreCorto);
  },
  /** El correo que el agente reparte cuando hay que hablar con una persona. */
  get correo() {
    return contacto("NEGOCIO_CORREO", "info@intellectum.ec");
  },
  /** El WhatsApp humano que se da como salida, en formato legible. */
  get whatsapp() {
    return contacto("NEGOCIO_WHATSAPP", "+593 98 312 0003");
  },
  /**
   * El WhatsApp donde atiende el propio agente, en formato legible. Se usa
   * cuando el chat de la web se apaga por el tope del día: ese otro canal
   * sigue vivo, y mandar ahí a la persona es mejor que dejarla sin salida.
   */
  get whatsappBot() {
    return contacto("NEGOCIO_WHATSAPP_BOT", "+593 96 751 8060");
  },
  /** El dominio, sin protocolo, para decir dónde ocurre la conversación. */
  get web() {
    return contacto("NEGOCIO_WEB", "intellectum.ec");
  },
  /**
   * Cómo se llama lo que se ofrece al cierre.
   *
   * "Consultoría gratuita de 30 minutos" es lo que vende Intellectum, no lo
   * que vende una ferretería: ahí el cierre es una visita, una cotización o
   * una llamada. Sin configurar, la copia ajena dice "cita", que es neutro y
   * verdadero en cualquier negocio; la de casa sigue diciendo lo de siempre.
   */
  get cita() {
    return texto("NEGOCIO_CITA", esIntellectum() ? "consultoría gratuita de 30 minutos" : "cita");
  },
  /**
   * El sustantivo corto de esa misma cita, para las frases donde no cabe el
   * nombre largo: "tu consultoría del martes", "tu visita del martes".
   */
  get evento() {
    return texto("NEGOCIO_EVENTO", esIntellectum() ? "consultoría" : "cita");
  },
  /**
   * La frase que explica qué se lleva la persona de esa cita. Aparece en la
   * página de agendamiento, debajo del título.
   *
   * Es una promesa comercial, así que solo la hace quien la puede cumplir:
   * "salimos de ahí con un mapa de qué automatizar" es lo que ofrece
   * Intellectum, y una ferretería que no la configure no promete nada.
   */
  get citaDescripcion() {
    return texto(
      "NEGOCIO_CITA_DESCRIPCION",
      esIntellectum()
        ? "Salimos de ahí con un mapa claro de qué se puede automatizar en tu empresa y cuánto costaría."
        : "",
    );
  },
  /**
   * La presentación del asistente en la portada del chat.
   *
   * La de casa nombra lo que Intellectum vende ("qué proceso te consume más
   * tiempo... la inteligencia artificial"). Una copia que no escriba la suya
   * usa una neutra que sirve a cualquier negocio, en vez de ofrecer en nombre
   * de la ferretería un servicio que la ferretería no presta.
   */
  get chatIntro() {
    return texto(
      "NEGOCIO_CHAT_INTRO",
      esIntellectum()
        ? "Cuéntame qué proceso te consume más tiempo y te muestro cómo la inteligencia artificial puede resolverlo. Respondo al instante, las 24 horas."
        : "Cuéntame en qué te puedo ayudar. Respondo al instante, las 24 horas.",
    );
  },
  /**
   * Las preguntas sugeridas que la página del chat ofrece de entrada.
   *
   * Se configuran separadas por "|". Son del rubro de cada negocio: "¿qué
   * procesos puedo automatizar con IA?" es una pregunta que en una ferretería
   * no significa nada. Sin configurar, la copia ajena no muestra ninguna, que
   * es mejor que sugerir las de otro sector.
   */
  get chips() {
    const crudo = texto(
      "NEGOCIO_CHIPS",
      esIntellectum()
        ? [
            "¿Qué procesos de mi empresa puedo automatizar con IA?",
            "Quiero un chatbot que atienda WhatsApp por mí",
            "¿Qué incluye cada plan y cuánto cuesta?",
            "¿Cómo es el proceso de trabajo y cuánto tarda?",
          ].join("|")
        : "",
    );
    return crudo
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 6);
  },
  /**
   * A qué se dedica el negocio, en dos o tres palabras, para las frases donde
   * el agente reencauza la charla ("yo te puedo ayudar con..."). Vacío en una
   * copia sin configurar: quien lo use arma la frase con el nombre del negocio.
   */
  get rubro() {
    return texto("NEGOCIO_RUBRO", esIntellectum() ? "automatización e IA" : "");
  },
  /**
   * Cómo se llama a quien manda en el negocio. Solo lo ve el agente privado,
   * al que únicamente entra el dueño de esta copia: llamar "Paul" al dueño de
   * la ferretería es un error visible desde el primer mensaje del panel.
   */
  get dueno() {
    return texto("NEGOCIO_DUENO", esIntellectum() ? "Paul" : "el dueño");
  },
  /**
   * Cómo se titula la cita en un calendario. Va aparte del nombre largo
   * porque en la lista de un calendario no cabe "consultoría gratuita de 30
   * minutos": ahí manda lo corto.
   */
  get citaTitulo() {
    const evento = NEGOCIO.evento;
    return texto("NEGOCIO_CITA_TITULO", esIntellectum() ? "Consultoría gratuita" : evento.charAt(0).toUpperCase() + evento.slice(1));
  },
  /**
   * Las mismas dos frases, en inglés, para /agenda?lang=en.
   *
   * Van aparte y no traducidas al vuelo porque son texto comercial: quien
   * publica una copia escribe la suya o no escribe ninguna. Si esta copia no
   * las declara, la página en inglés se queda con sus propias palabras
   * neutras ("Book your appointment") y no promete nada, que es la misma
   * regla del resto: antes que decir algo ajeno, no decir nada.
   *
   * Sin esto, la versión en inglés le pegaba la frase EN ESPAÑOL debajo de la
   * inglesa —la misma promesa dos veces, la segunda en otro idioma— y el
   * rótulo volvía al español a media página.
   */
  get citaTituloEn() {
    return texto("NEGOCIO_CITA_TITULO_EN", esIntellectum() ? "Free consultation" : "");
  },
  get citaDescripcionEn() {
    return texto(
      "NEGOCIO_CITA_DESCRIPCION_EN",
      esIntellectum()
        ? "You leave with a clear map of what can be automated in your company and what it would cost."
        : "",
    );
  },
  /** La dirección completa del sitio de esta copia, sin barra final. */
  get sitio() {
    return contacto("SITIO_URL", "https://www.intellectum.ec").replace(/\/+$/, "");
  },
  /** El mismo sitio sin protocolo, para escribirlo dentro de una frase. */
  get dominio() {
    return NEGOCIO.sitio.replace(/^https?:\/\//, "");
  },
  /**
   * El logotipo que se pinta en las páginas web de esta copia.
   *
   * Regla de contacto y no de estilo: una ferretería sin logo configurado
   * prefiere no mostrar ninguno —y que se lea su nombre en texto— antes que
   * encabezar con el de Intellectum la página donde sus clientes dejan el
   * correo y el teléfono. Ojo, no es el del PDF: la cotización usa logo.png,
   * que es cuadrado, y esto es el logotipo apaisado de la barra.
   */
  get logo() {
    return contacto("NEGOCIO_LOGO_URL", "/logo-nav.webp");
  },
  /** El enlace de WhatsApp al número del agente, listo para un botón. */
  get enlaceWhatsapp() {
    const digitos = NEGOCIO.whatsappBot.replace(/\D/g, "");
    return digitos ? `https://wa.me/${digitos}` : "";
  },
  /**
   * Los datos legales que van al pie de una cotización.
   *
   * Estos tres NO caen en los de Intellectum cuando la copia es de otro: un
   * RUC ajeno en la cotización de una ferretería no es un detalle de marca,
   * es un documento equivocado. Si el cliente no los configura, no salen.
   */
  get razonSocial() {
    return texto("NEGOCIO_RAZON_SOCIAL", esIntellectum() ? "Intellectum AI Solutions S.A.S." : NEGOCIO.nombre);
  },
  get ruc() {
    return texto("NEGOCIO_RUC", esIntellectum() ? "RUC 1793236353001" : "");
  },
  get ciudad() {
    return texto("NEGOCIO_CIUDAD", esIntellectum() ? "Quito, Ecuador" : "");
  },
  /**
   * La línea que dice qué se lleva la persona de la cita. Es promesa
   * comercial, no dato: la de Intellectum solo vale para Intellectum, y quien
   * no configure la suya simplemente no promete nada.
   */
  get promesaCita() {
    return texto(
      "NEGOCIO_PROMESA_CITA",
      esIntellectum() ? "Son 30 minutos y salimos de ahí con un mapa de qué automatizar primero." : "",
    );
  },
  /**
   * El píxel de Meta de ESTE negocio. Regla de contacto: la copia de otro
   * negocio sin píxel propio no mide nada, antes que mandarle las visitas de
   * sus clientes al Business Manager de Intellectum. medicion.js lo lee por
   * /api/negocio y, si viene vacío, duerme.
   */
  get pixel() {
    return contacto("NEGOCIO_PIXEL_ID", "1420043423319842");
  },
  /**
   * Dónde está publicado el aviso de privacidad de este negocio, y sus
   * condiciones. El de casa nombra a Intellectum como responsable del
   * tratamiento, así que en una copia ajena NO se enlaza: un aviso que
   * nombra a otra empresa es peor que ningún enlace. El chat y la burbuja
   * ocultan el enlace cuando esto viene vacío.
   */
  get avisoPrivacidad() {
    return contacto("NEGOCIO_AVISO_URL", "/privacidad");
  },
  get condiciones() {
    return contacto("NEGOCIO_CONDICIONES_URL", "/condiciones");
  },
  /**
   * Cómo trata el agente a la gente: "tu" (lo de casa y lo normal en Ecuador)
   * o "usted" (clínicas, estudios jurídicos, funerarias). Es un dato de
   * estilo, así que la copia ajena hereda el tuteo si no dice nada.
   */
  get trato() {
    return (texto("NEGOCIO_TRATO", "tu") || "tu").toLowerCase() === "usted" ? "usted" : "tu";
  },
};

/**
 * ¿Le toca a ESTA copia atender los mensajes de ese cliente?
 *
 * Cada copia responde SOLO por su propio negocio. Antes la copia de casa
 * "repartía": aceptaba los mensajes de cualquier slug, pero los contestaba con
 * el número, el token y las plantillas de Intellectum, o sea que el cliente de
 * una ferretería recibía la respuesta desde el WhatsApp de otra empresa. Un
 * número que no es de esta copia es un error de configuración (el webhook de
 * ese número tiene que apuntar a SU copia), y callarse y gritarlo en el
 * registro es la única respuesta correcta.
 *
 * @param {string|undefined|null} dueño  slug al que enruta el número, o nada
 *   si el número no está registrado (lo normal mientras haya un solo cliente).
 */
export function atiendeAlSlug(dueño) {
  return !dueño || dueño === CLIENTE;
}

/**
 * ¿Esta copia atiende a alguien distinto de Intellectum? Sirve para que un
 * módulo decida si un texto clavado a Intellectum todavía es correcto o si
 * hay que callarse en vez de decir algo que no es de este negocio.
 */
export function esIntellectum() {
  return CLIENTE === "intellectum";
}

/**
 * "escríbenos a X o llámanos al Y", con las vías que este negocio tenga
 * configuradas. Devuelve cadena vacía si no tiene ninguna, y entonces a quien
 * la llama le toca cerrar la frase de otro modo: mandar a la gente a un correo
 * inventado es peor que no darle salida.
 */
export function comoEscribirnos() {
  const n = NEGOCIO;
  const vias = [];
  if (n.correo) vias.push(`escríbenos a ${n.correo}`);
  if (n.whatsapp) vias.push(`llámanos al ${n.whatsapp}`);
  return vias.join(" o ");
}

/**
 * LA IDENTIDAD QUE PUEDE VIAJAR AL NAVEGADOR.
 *
 * Las páginas (agenda, chat) son archivos estáticos idénticos en cada copia:
 * no leen variables de entorno y no tienen forma de saber de quién son. Esto
 * es lo que el servidor les cuenta para que dejen de hablar como Intellectum.
 *
 * Va TODO lo público y NADA más: ni claves, ni el slug de otros clientes, ni
 * nada de la base. Lo que sale por aquí lo puede leer cualquiera que abra la
 * página, así que la lista se mantiene corta a propósito.
 */
export function identidadPublica() {
  const n = NEGOCIO;
  return {
    nombre: n.nombre,
    nombreCorto: n.nombreCorto,
    agente: n.agente,
    correo: n.correo,
    whatsapp: n.whatsapp,
    whatsappBot: n.whatsappBot,
    enlaceWhatsapp: n.enlaceWhatsapp,
    sitio: n.sitio,
    dominio: n.dominio,
    web: n.web,
    logo: n.logo,
    cita: n.cita,
    evento: n.evento,
    citaTitulo: n.citaTitulo,
    citaTituloEn: n.citaTituloEn,
    citaDescripcionEn: n.citaDescripcionEn,
    citaDescripcion: n.citaDescripcion,
    chips: n.chips,
    chatIntro: n.chatIntro,
    pixel: n.pixel,
    avisoPrivacidad: n.avisoPrivacidad,
    condiciones: n.condiciones,
  };
}

/** Las líneas de un pie de correo, sin los huecos de lo que no está puesto. */
export function pieDeFirma() {
  const n = NEGOCIO;
  const linea = [n.correo, n.whatsappBot, n.dominio].filter(Boolean).join(" · ");
  return [n.nombre, linea].filter(Boolean);
}

/**
 * Los datos de contacto que esta copia NO tiene puestos.
 *
 * No son adorno: son los tres huecos que el agente calla en vez de rellenar
 * con los de Intellectum (ver contacto() arriba). Una copia sin ellos atiende,
 * pero cuando hay que decir "escríbenos a…" no dice nada. Por eso los reporta
 * también estado_del_sistema: el dueño le pregunta a su agente privado qué
 * falta y esto es, casi siempre, lo que falta.
 *
 * En la copia de la casa siempre está todo: los valores por defecto SON los
 * suyos, así que devuelve lista vacía.
 */
export function datosQueFaltan() {
  if (esIntellectum()) return [];
  return [
    // El nombre no se puede quedar vacío (rompería media frase del agente), así
    // que se saca del slug y NO se puede detectar mirando si está en blanco:
    // se mira la variable directamente. Antes el aviso no lo vigilaba y decía
    // que "esos datos se omiten", tranquilizando, mientras el nombre sí se
    // estaba rellenando solo.
    ["NEGOCIO_NOMBRE", (process.env.NEGOCIO_NOMBRE ?? "").trim()],
    ["NEGOCIO_CORREO", NEGOCIO.correo],
    ["NEGOCIO_WHATSAPP", NEGOCIO.whatsapp],
    ["SITIO_URL", NEGOCIO.sitio],
  ]
    .filter(([, valor]) => !valor)
    .map(([nombre]) => nombre);
}

/**
 * Lo mismo, dicho una vez al arrancar: un despliegue a medio configurar se
 * descubre mucho mejor en el registro del primer minuto que en el primer
 * correo que sale mudo.
 */
function revisarConfiguracion() {
  const faltan = datosQueFaltan();
  if (faltan.length) {
    console.warn(
      `[CLIENTE] la copia de "${CLIENTE}" no tiene ${faltan.join(", ")}: ` +
        "los de contacto se omiten en los mensajes en vez de rellenarse con los de " +
        "Intellectum, y el nombre, si falta, se saca del identificador del cliente.",
    );
  }
}
revisarConfiguracion();
