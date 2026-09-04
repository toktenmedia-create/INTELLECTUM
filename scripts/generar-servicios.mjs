/**
 * GENERADOR DE LAS PÁGINAS DE SERVICIO
 *
 * Una página por cada cosa que se vende, en vez de seis tarjetas peleando por
 * una sola dirección. Es lo que pidió Paul el 4 sep 2026: mejor posición en
 * buscadores y en respuestas de IA, y más puertas de entrada.
 *
 * POR QUÉ UN GENERADOR Y NO SEIS ARCHIVOS A MANO: el menú y el pie son 110
 * líneas. Escritos seis veces, cualquier cambio en el pie son seis ediciones y
 * la sexta se olvida. Aquí el armazón se escribe una vez y el contenido de cada
 * página es un objeto de la lista de abajo.
 *
 *   npm run paginas
 *
 * Las páginas que salen SÍ se suben a git: Vercel sirve archivos estáticos y no
 * corre nada al desplegar. Si editas una página a mano, el siguiente `npm run
 * paginas` te la pisa: el contenido se cambia AQUÍ.
 *
 * REGLA QUE NO SE ROMPE: nada de lo que diga una página puede estar fuera de
 * lib/ficha.js. Si la página promete algo que IntelliA tiene prohibido decir,
 * el visitante lo descubre en el primer mensaje.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SERVICIOS_EN } from "./servicios-en.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITIO = "https://www.intellectum.ec";

const WA = "https://wa.me/593967518060";
const waTexto = (t) => `${WA}?text=${encodeURIComponent(t)}`;

/* ── El contenido ─────────────────────────────────────────────────────────── */

const SERVICIOS = [
  {
    slug: "agentes-de-ia-whatsapp",
    nav: "Agentes de IA",
    titulo: "Agentes de IA para WhatsApp y para tu sitio web",
    h1a: "Un agente de IA que atiende tu",
    h1b: "WhatsApp y tu web.",
    tituloTag:
      "Agentes de IA para WhatsApp en Ecuador | Intellectum",
    descripcion:
      "Agentes de IA entrenados con la información de tu negocio que responden por WhatsApp y por el chat de tu web las 24 horas, califican interesados y agendan citas. Quito, Ecuador.",
    lead: "El mismo agente en los dos canales, entrenado con la información de tu negocio. Responde a la hora que le escriban, entiende qué necesita cada persona, agenda la cita y deja todo anotado en tu panel. Cuando algo necesita a alguien de tu equipo, avisa y se calla.",
    queEntrada:
      "No es un menú de opciones ni un árbol de botones. Es un agente que conversa, y lo que sabe decir sale de una ficha que se llena con tus datos: tus servicios, tus horarios, tus condiciones, tu forma de hablar.",
    que: [
      "<strong>Responde 24/7</strong> con la información de tu negocio, no con respuestas genéricas de internet.",
      "<strong>Califica a cada interesado</strong>: pregunta lo que hace falta para saber si es tu cliente y con qué urgencia.",
      "<strong>Agenda la cita</strong> mirando las horas libres de tu Google Calendar, y manda la confirmación y el recordatorio.",
      "<strong>Reconoce a quien vuelve</strong>: no le pide otra vez el nombre ni le repite lo que ya conversaron.",
      "<strong>Avisa cuando hace falta una persona</strong> y deja de responder para no estorbar; tu equipo toma la conversación desde el panel y la devuelve cuando termina.",
      "<strong>Deja todo escrito</strong>: cada contacto entra a tu panel con su ficha, su estado y el historial completo.",
    ],
    comoEntrada:
      "WhatsApp funciona con la API oficial de Meta, no con un teléfono conectado a un programa. Eso importa: el número queda a nombre de tu empresa, no se cae porque alguien cerró sesión, y no hay riesgo de que Meta lo bloquee por usar una vía no autorizada.",
    como: [
      "<strong>Diagnóstico.</strong> Miramos qué te preguntan hoy, qué contestas y en qué se te va el tiempo.",
      "<strong>La ficha.</strong> Volcamos tu negocio en un documento: servicios, precios, horarios, condiciones, lo que el agente puede decir y lo que tiene prohibido.",
      "<strong>Conexión.</strong> El número de WhatsApp entra a la API oficial de Meta y el chat se incrusta en tu web. Google Calendar se conecta si vas a agendar.",
      "<strong>Piloto y ajuste.</strong> Sale en vivo con tu equipo mirando, y se corrige con conversaciones reales, no con suposiciones.",
    ],
    necesitas: [
      "Un número de celular que <strong>no esté usándose en la app de WhatsApp</strong>: el que entra a la API deja de abrirse en el teléfono.",
      "Una cuenta de Meta Business a nombre de tu empresa (si no la tienes, se crea contigo).",
      "La información de tu negocio: qué vendes, a qué precio, en qué horarios, con qué condiciones.",
      "Un Google Calendar, solo si quieres que agende.",
    ],
    limites: [
      "No atiende Instagram ni Messenger. Los canales son WhatsApp, el chat de tu web y las llamadas.",
      "No sale a buscar gente. Atiende a quien escribe; no hace prospección en frío.",
      "No cierra la venta solo. Califica, cotiza y agenda; el cierre lo hace tu equipo.",
      "No inventa. Lo que no está en su ficha, no lo dice: lo deriva a una persona.",
    ],
    faq: [
      {
        p: "¿Se puede usar mi número de WhatsApp actual?",
        r: "Sí, pero deja de funcionar en la app del teléfono: un número está en la app o está en la API de Meta, nunca en las dos. Por eso lo habitual es dejar el número de siempre para el uso de tu equipo y meter uno nuevo al agente, o al revés si el número conocido es el que quieres automatizar.",
      },
      {
        p: "¿Cuánto se demora en estar funcionando?",
        r: "La mayoría de proyectos está operativa entre 2 y 6 semanas desde el diagnóstico. Los casos con varias integraciones pueden irse a 8 o 10 semanas.",
      },
      {
        p: "¿Hay que saber de tecnología para operarlo?",
        r: "No. El panel es simple, se entrega con capacitación y el soporte lo da el mismo equipo que lo implementó.",
      },
      {
        p: "¿Qué pasa con los datos de mis clientes?",
        r: "Van cifrados en tránsito y en reposo, el panel está protegido con una clave por negocio y los datos de cada cliente están separados en la base. Se firma NDA cuando la integración lo pide.",
      },
    ],
    schema: {
      name: "Agentes de IA para WhatsApp y chat web",
      description:
        "Agentes de inteligencia artificial entrenados con la información del negocio que atienden WhatsApp y el chat del sitio web 24/7, califican interesados y agendan citas en Google Calendar.",
    },
  },

  {
    slug: "llamadas-con-ia",
    nav: "Llamadas con IA",
    titulo: "Llamadas de voz con IA",
    h1a: "Llamadas con voz de IA para lo que",
    h1b: "el chat no alcanza.",
    tituloTag: "Llamadas de voz con IA en Ecuador | Intellectum",
    descripcion:
      "Llamadas con voz de inteligencia artificial para confirmar citas, recordar visitas y retomar a quien dejó sus datos y no volvió. Se monta sobre el agente que ya tengas.",
    lead: "Hay gente que no lee mensajes y contesta el teléfono. Para ellos hay una voz de IA que llama, dice a qué llama y anota la respuesta. No reemplaza al agente de chat: se monta encima del plan que ya tengas.",
    queEntrada:
      "La voz sirve para momentos concretos, no para reemplazar a tu equipo comercial. Estos son los que resuelve bien:",
    que: [
      "<strong>Confirmar una cita</strong> el día antes, y anotar si la persona confirma, la mueve o la cancela.",
      "<strong>Recordar una visita</strong> agendada, con la hora y el lugar.",
      "<strong>Retomar a quien dejó sus datos</strong> y no volvió a escribir.",
      "<strong>Dejar lo conversado por escrito</strong> en el mismo panel donde está el resto: la llamada no se pierde en la memoria de quien la hizo.",
    ],
    comoEntrada:
      "El alcance y los minutos se definen en la consultoría, porque el costo depende del volumen. Aquí no vas a encontrar una tarifa por minuto: la que te sirva a ti sale de saber cuántas llamadas vas a hacer.",
    como: [
      "<strong>Para qué.</strong> Se define qué llamadas se automatizan y cuáles siguen siendo humanas.",
      "<strong>El guion.</strong> Qué dice la voz, qué preguntas hace y en qué momento pasa la llamada a una persona.",
      "<strong>El enganche.</strong> Se conecta con el agente y con la agenda que ya tienes, para que la llamada sepa de qué cita habla.",
      "<strong>Piloto.</strong> Un grupo pequeño primero, se escuchan las grabaciones y se corrige antes de abrirlo.",
    ],
    necesitas: [
      "Tener ya un plan de agente con nosotros: la voz <strong>se monta encima</strong>, no se vende sola.",
      "Una idea del volumen: cuántas llamadas al mes, más o menos.",
      "Saber qué quieres que pase cuando la persona pide hablar con alguien de verdad.",
    ],
    limites: [
      "No hace prospección en frío ni llama a listas compradas.",
      "No cierra ventas. Confirma, recuerda y retoma; lo demás lo hace tu equipo.",
      "No hay tarifa publicada por minuto: depende del volumen y se cotiza en la consultoría.",
      "No se contrata sin agente: es un complemento del plan, no un producto aparte.",
    ],
    faq: [
      {
        p: "¿Cuánto cuesta el minuto?",
        r: "No publicamos una tarifa por minuto porque cambia con el volumen y con el tipo de llamada. Se toma el caso en la consultoría gratuita y sale un número por escrito. El chat tampoco te va a dar un rango para esto: prefiere no decirte una cifra a decirte una equivocada.",
      },
      {
        p: "¿Puede llamar a números de Ecuador?",
        r: "Sí. El detalle de qué número aparece en la pantalla de quien recibe se define en la consultoría, porque depende de cómo se conecte la línea.",
      },
      {
        p: "¿Se nota que es una IA?",
        r: "La voz es clara y natural, y el agente dice de parte de quién llama. No se hace pasar por una persona: eso, además de ser incorrecto, se descubre solo.",
      },
    ],
    schema: {
      name: "Llamadas de voz con IA",
      description:
        "Llamadas telefónicas con voz de inteligencia artificial para confirmar citas, recordar visitas y retomar interesados. Se implementa sobre un plan de agente existente.",
    },
  },

  {
    slug: "ventas-automatizadas",
    nav: "Ventas automatizadas",
    titulo: "Ventas automatizadas: seguimiento, cotización y recordatorios",
    h1a: "El que preguntó y no volvió",
    h1b: "no se pierde.",
    tituloTag:
      "Ventas automatizadas con IA en Ecuador | Intellectum",
    descripcion:
      "Seguimiento automático por WhatsApp a quien pidió precio y no volvió, cotización al instante y recordatorios de cita. Cada interesado llega a tu equipo ya calificado.",
    lead: "La mayoría de las ventas no se pierden por precio: se pierden porque nadie volvió a escribir. El seguimiento automático retoma a quien pidió un precio y se quedó callado, y le llega a tu equipo solo el que ya está listo para hablar.",
    queEntrada:
      "Todo esto pasa sin que nadie de tu equipo se acuerde de hacerlo, que es justamente el punto:",
    que: [
      "<strong>Seguimiento automático</strong> por WhatsApp a quien pidió precio y no volvió a responder.",
      "<strong>Rango de precio al instante</strong> en la conversación, cuando el plan lo incluye, con las reglas que tú definas.",
      "<strong>Recordatorio de cita</strong> antes de la hora, para que la agenda no se llene de gente que no llega.",
      "<strong>Cada interesado calificado y con contexto</strong>: tu equipo abre la ficha y ve qué preguntó, qué se le respondió y en qué quedó.",
      "<strong>El embudo a la vista</strong> en el panel: los interesados por estado, y la plata que hay en cada columna.",
    ],
    comoEntrada:
      "El seguimiento no es un mensaje masivo. Sale de la conversación que esa persona tuvo, en el momento en que tiene sentido, y se detiene solo si contesta o si pide que no le escriban más.",
    como: [
      "<strong>Las reglas.</strong> Se define a quién se le hace seguimiento, cuándo y cuántas veces. Sin insistir de más: eso quema el número.",
      "<strong>Los precios.</strong> Se cargan tus reglas de cotización: qué entra, qué depende del caso y qué no se cotiza por chat.",
      "<strong>El panel.</strong> Se arman los estados de tu embudo con los nombres que tu equipo ya usa.",
      "<strong>Medición.</strong> Se mira qué mensajes traen respuesta y se ajustan.",
    ],
    necesitas: [
      "El agente de WhatsApp funcionando: el seguimiento viaja por ahí.",
      "Tus reglas de precio, aunque sean rangos: qué se puede decir por chat y qué no.",
      "Los estados por los que pasa un interesado en tu negocio.",
    ],
    limites: [
      "No es envío masivo ni campañas a listas: se le escribe a quien ya conversó contigo.",
      "No cierra la venta. Deja al interesado listo y avisado; el cierre lo hace tu equipo.",
      "No inventa precios. Si algo no está en las reglas, lo deriva a una persona.",
      "El seguimiento automático entra desde cierto plan en adelante, no en el más pequeño.",
    ],
    faq: [
      {
        p: "¿No molesta al cliente que le escriban solos?",
        r: "Depende de cuántas veces y de qué se le diga. Por eso las reglas se definen contigo y el seguimiento se detiene en cuanto la persona contesta o pide que no le escriban. Un seguimiento bien puesto se agradece; uno que insiste cinco veces quema el número.",
      },
      {
        p: "¿La cotización que da el agente es en firme?",
        r: "Es un rango referencial, y el agente lo dice así. El precio exacto sale del diagnóstico. El rango sirve para que la conversación no se muera en «depende».",
      },
      {
        p: "¿Puedo ver qué está haciendo?",
        r: "Sí, en el panel: cada conversación, cada interesado y cada cita, con el historial. También se puede exportar a Excel.",
      },
    ],
    schema: {
      name: "Ventas automatizadas con IA",
      description:
        "Seguimiento automático por WhatsApp, cotización referencial al instante y recordatorios de cita, con panel de interesados y embudo por estados.",
    },
  },

  {
    slug: "automatizacion-a-medida",
    nav: "Automatización a medida",
    titulo: "Automatización a medida entre tus sistemas",
    h1a: "Lo que hoy alguien copia",
    h1b: "de un lado a otro.",
    tituloTag:
      "Automatización a medida con IA en Ecuador | Intellectum",
    descripcion:
      "Conectamos CRM, ERP, hojas de cálculo, correo y pasarelas de pago en flujos que ejecutan tareas repetitivas, validan datos y avisan de las excepciones.",
    lead: "Casi todo negocio tiene a alguien pasando datos de una pantalla a otra. Eso es un proceso, no un trabajo. Se puede automatizar, y lo que gana tu equipo es el tiempo que hoy se va en copiar, pegar y revisar.",
    queEntrada:
      "Esto no se vende por catálogo: cada caso es distinto y por eso se analiza antes de cotizar. Lo que sí se repite es la forma:",
    que: [
      "<strong>Conectar sistemas que hoy no se hablan</strong>: CRM, ERP, hojas de cálculo, correo, pasarelas de pago.",
      "<strong>Ejecutar la tarea repetitiva</strong> completa, no un pedazo: leer, validar, escribir y confirmar.",
      "<strong>Avisar de la excepción</strong>, que es lo único que de verdad necesita a una persona.",
      "<strong>Dejar registro</strong> de qué se hizo y cuándo, para que se pueda auditar y no haya que creer en la palabra del sistema.",
    ],
    comoEntrada:
      "El precio de esto no sale de un rango: sale de mirar el proceso. Por eso el chat no cotiza automatización a medida — toma el caso y agenda la consultoría.",
    como: [
      "<strong>El mapa.</strong> Se sigue el proceso tal como es hoy, con quien lo hace, no con quien lo describe.",
      "<strong>El corte.</strong> Se decide qué se automatiza y qué se queda con una persona. No todo debe automatizarse.",
      "<strong>La construcción.</strong> Se conecta cada sistema por su API y se prueba con datos reales en paralelo al proceso actual.",
      "<strong>El relevo.</strong> Recién cuando el flujo automático coincide con el manual varias veces, se apaga el manual.",
    ],
    necesitas: [
      "Que los sistemas que quieres conectar <strong>tengan API</strong>. Si un sistema no la tiene, se busca otra vía o se dice que no se puede.",
      "Quién es el dueño del proceso: alguien que pueda decir «así es como se hace».",
      "Acceso de prueba a los sistemas, con permisos acotados.",
    ],
    limites: [
      "No se cotiza por chat ni por teléfono: se analiza primero y se cotiza por escrito.",
      "No se prometen integraciones con marcas concretas antes de mirarlas. Google Calendar y la API de WhatsApp sí vienen incluidas; el resto se confirma en la consultoría.",
      "No se automatiza un proceso que nadie puede explicar. Si no está claro a mano, automatizarlo solo lo vuelve más rápido de equivocarse.",
    ],
    faq: [
      {
        p: "¿Cuánto cuesta?",
        r: "Depende del proceso, y por eso no hay rango publicado ni el chat te va a dar uno. Se mira el caso en la consultoría gratuita y sale una cotización por escrito.",
      },
      {
        p: "¿Sirve para un negocio pequeño?",
        r: "Sí, siempre que haya un proceso repetitivo que consuma horas. El tamaño de la empresa importa menos que la cantidad de veces al día que alguien hace lo mismo.",
      },
      {
        p: "¿Y si mi sistema es viejo?",
        r: "Se mira. Si expone una API, se conecta. Si no, a veces hay otra vía y a veces la respuesta honesta es que no se puede; eso se dice en la consultoría, no después de facturar.",
      },
    ],
    schema: {
      name: "Automatización a medida entre sistemas",
      description:
        "Integración de CRM, ERP, hojas de cálculo, correo y pasarelas de pago en flujos automáticos que ejecutan tareas repetitivas, validan datos y notifican excepciones.",
    },
  },

  {
    slug: "sitios-web",
    nav: "Sitios web",
    titulo: "Sitios web y landing pages con agente de IA",
    h1a: "Un sitio que además",
    h1b: "atiende.",
    tituloTag:
      "Diseño de sitios web en Quito, Ecuador | Intellectum",
    descripcion:
      "Sitios web y landing pages rápidos y medibles, con el agente de IA integrado desde el lanzamiento: el visitante encuentra respuesta antes de irse.",
    lead: "Una página bonita que no contesta es un folleto caro. Construimos sitios rápidos, medibles y pensados para que el visitante haga algo — y con el agente adentro desde el primer día, para que quien tenga una duda la resuelva ahí mismo en vez de irse.",
    queEntrada:
      "Es pago único, y el primer mes del Asistente de Recepción viene incluido. Si además quieres WhatsApp, se suma el plan de agente que corresponda.",
    que: [
      "<strong>Rápido de verdad</strong>: la velocidad es lo primero que mira Google y lo primero que nota quien entra desde el celular.",
      "<strong>Con el agente adentro</strong> desde el lanzamiento, no como un añadido de después.",
      "<strong>Medible</strong>: se instala la medición para que sepas de dónde llega la gente y qué hace, en vez de gastar en pauta a ciegas.",
      "<strong>Preparado para buscadores</strong>: direcciones limpias, datos estructurados, mapa del sitio y textos escritos para personas.",
      "<strong>Tuyo</strong>: el dominio se registra a tu nombre y el sitio se te entrega.",
    ],
    comoEntrada:
      "Si ya tienes sitio, no hay que botarlo: se respeta y se le integra la IA encima. Construir de cero es solo para quien no lo tiene o quiere cambiarlo.",
    como: [
      "<strong>Qué tiene que lograr.</strong> Antes de hablar de diseño, para qué es la página y qué debe pasar cuando alguien entra.",
      "<strong>Estructura y textos.</strong> Se define qué va en cada sección y se escribe; los textos son la mitad del trabajo.",
      "<strong>Construcción.</strong> Diseño, desarrollo y el agente conectado.",
      "<strong>Salida y medición.</strong> Se publica, se mide y se corrige con datos reales.",
    ],
    necesitas: [
      "Tu logotipo y tus fotos, si las tienes; si no, se resuelve.",
      "Claro qué vendes y a quién: sin eso no hay texto que funcione.",
      "El dominio, que se registra <strong>a tu nombre</strong> y lo pagas tú, para que la página sea tuya de verdad.",
    ],
    limites: [
      "No se hacen plantillas rellenadas con tu logo.",
      "No se promete una posición en Google: se hace lo que hay que hacer para competir, y la posición la decide Google.",
      "El alojamiento y el dominio de años siguientes corren por tu cuenta.",
    ],
    faq: [
      {
        p: "¿Puedo quedarme con mi sitio actual y solo poner el agente?",
        r: "Sí, y es lo más común. Se respeta el sitio que tienes y se integra la IA sobre él.",
      },
      {
        p: "¿Cuánto tarda?",
        r: "Una landing simple es cuestión de días; un sitio completo entra en el rango normal de 2 a 6 semanas.",
      },
      {
        p: "¿Después puedo editarlo yo?",
        r: "Sí, se entrega con lo necesario para que tu equipo cambie textos e imágenes. Los cambios de estructura conviene hacerlos con nosotros.",
      },
    ],
    schema: {
      name: "Sitios web y landing pages con IA",
      description:
        "Desarrollo de sitios web y landing pages rápidos, medibles y optimizados para buscadores, con agente de inteligencia artificial integrado desde el lanzamiento.",
    },
  },

  {
    slug: "tiendas-en-linea",
    nav: "Tiendas en línea",
    titulo: "Tiendas en línea para Ecuador",
    h1a: "Una tienda que responde",
    h1b: "mientras duermes.",
    tituloTag: "Tiendas en línea con IA en Ecuador | Intellectum",
    descripcion:
      "Tiendas en línea con catálogo, carrito y pagos para Ecuador, con atención automatizada por WhatsApp y recuperación de carritos abandonados.",
    lead: "Vender en línea en Ecuador es más que subir un catálogo: es responder la pregunta que frena la compra, a la hora que la hacen. La tienda se construye con el agente adentro, para que esa pregunta no se quede sin respuesta.",
    queEntrada:
      "Catálogo, carrito y pagos es el mínimo. Lo que cambia el resultado es lo que pasa alrededor de la compra:",
    que: [
      "<strong>Catálogo, carrito y pagos</strong> funcionando con las formas de pago que se usan aquí.",
      "<strong>El agente atendiendo</strong>: tallas, disponibilidad, envíos, tiempos, devoluciones — las preguntas que frenan la compra.",
      "<strong>Recuperación de carritos</strong>: a quien dejó cosas y se fue, se le escribe.",
      "<strong>Estado del pedido por WhatsApp</strong>, que es donde tu cliente va a preguntar de todos modos.",
      "<strong>Medición</strong> de qué se ve, qué se agrega y dónde se cae la compra.",
    ],
    comoEntrada:
      "La tienda se piensa desde el celular, porque es donde se compra en Ecuador. Lo que no funcione en una pantalla de seis pulgadas no funciona.",
    como: [
      "<strong>El catálogo.</strong> Cómo están organizados tus productos hoy y cómo deberían estarlo para que se encuentren.",
      "<strong>Pagos y envíos.</strong> Qué formas de pago aceptas y cómo se calcula el envío.",
      "<strong>Construcción.</strong> Tienda, agente y medición, juntos.",
      "<strong>Apertura y ajuste.</strong> Se abre, se mira dónde se cae la compra y se corrige.",
    ],
    necesitas: [
      "El catálogo: productos, precios, fotos y variantes.",
      "Cómo cobras: cuenta bancaria, pasarela de pagos o las dos.",
      "Cómo envías: quién lo lleva, a qué zonas y en cuánto tiempo.",
      "Tu RUC y las condiciones de venta y devolución, que la tienda tiene que mostrar.",
    ],
    limites: [
      "No se venden productos de terceros ni se administra tu inventario: la tienda es tuya y la operas tú.",
      "La conexión con una pasarela de pagos o con tu sistema de inventario se cotiza como integración aparte.",
      "No se promete volumen de ventas. La tienda quita fricción; el producto y el precio los pones tú.",
    ],
    faq: [
      {
        p: "¿Sirve para vender por WhatsApp?",
        r: "Sí, y es lo normal aquí: la tienda muestra el catálogo y el agente responde y cierra el pedido por WhatsApp, que es donde tu cliente ya está.",
      },
      {
        p: "¿Qué formas de pago se pueden usar?",
        r: "Transferencia, depósito y tarjeta a través de una pasarela de pagos. Cuál se conecta se decide contigo, y esa conexión se cotiza como integración.",
      },
      {
        p: "¿Puedo empezar con pocos productos?",
        r: "Sí. Es más, conviene: se abre con lo que más se vende y se amplía cuando la operación está aceitada.",
      },
    ],
    schema: {
      name: "Tiendas en línea con IA",
      description:
        "Desarrollo de tiendas en línea con catálogo, carrito y pagos para Ecuador, con atención automatizada por WhatsApp y recuperación de carritos abandonados.",
    },
  },
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── Los dos idiomas ──────────────────────────────────────────────────────── */

/**
 * Todo lo que no es contenido del servicio: menú, pie, títulos de sección,
 * botones. El contenido vive en SERVICIOS (español) y SERVICIOS_EN (inglés);
 * esto es el marco que los rodea.
 *
 * Por qué una tabla y no dos plantillas: una plantilla por idioma se separa
 * sola. Alguien arregla el pie en español, no se acuerda del inglés, y a los
 * dos meses las dos versiones del sitio dicen cosas distintas. Con una sola
 * plantilla y dos juegos de textos, un cambio de estructura entra una vez.
 */
const IDIOMAS = {
  es: {
    codigo: "es",
    lang: "es-EC",
    locale: "es_EC",
    inicio: "/",
    servicios: SERVICIOS,
    /* La otra puerta: en las páginas en español, el botón lleva al inglés. */
    otroCodigo: "en",
    otroNombre: "English version",
    otroCorto: "EN",
    // Menú
    menuPrincipal: "Menú principal",
    abrirMenu: "Abrir menú",
    marcaInicio: "Intellectum AI Solutions, inicio",
    nav: { demo: "Pruébalo", servicios: "Servicios", proceso: "Proceso", nosotros: "Nosotros", faq: "FAQ", blog: "Blog" },
    iaChat: "IntelliA · chat en línea",
    ctaNav: "Consultoría gratis",
    waNav: "Hola Intellectum, me interesa una consultoría gratis sobre automatización con IA",
    // Pie
    pieLema:
      "Soluciones de inteligencia artificial y automatización empresarial diseñadas a medida para empresas en Ecuador.",
    pieSoluciones: "Soluciones",
    pieEmpresa: "Empresa",
    pieContacto: "Contacto",
    pieEnlaces: { nosotros: "Nosotros", proceso: "Proceso", faq: "FAQ", blog: "Blog", contacto: "Contacto" },
    privacidad: "Aviso de privacidad",
    condiciones: "Condiciones del servicio",
    chatIntelliA: "Chat con IntelliA",
    derechos: "© 2026 Intellectum AI Solutions. Todos los derechos reservados.",
    hechoEn: "Hecho en",
    conIA: "Powered by IA",
    escribenos: "Escríbenos por WhatsApp",
    waFab: "Hola Intellectum, quiero más info",
    // Página
    ruta: "Ruta de navegación",
    migaInicio: "Inicio",
    migaServicios: "Servicios",
    agendaCta: "Agenda tu consultoría",
    preguntaIa: "Pregúntale a IntelliA",
    hQue: "Qué hace, exactamente",
    hComo: "Cómo se hace",
    hNecesitas: "Qué hace falta de tu lado",
    hLimitesA: "Qué ",
    hLimitesB: "no",
    hLimitesC: " hace",
    limitesEntrada: "Decirlo aquí sale más barato que descubrirlo en la tercera reunión.",
    faqTituloA: "Lo que más",
    faqTituloB: "nos preguntan.",
    faqLeadA: "Si tu duda no está aquí, pregúntasela a ",
    faqLeadB: ": responde a cualquier hora.",
    ctaTituloA: "Media hora y",
    ctaTituloB: "un mapa claro.",
    ctaSub:
      "La consultoría es gratis y no es una llamada de venta: salimos de ahí con qué automatizar primero y qué esperar. Elige la hora que te sirva.",
    ctaMarco: "Elige la hora de tu consultoría",
    ctaO: "¿Prefieres escribir primero?",
    ctaWa: "Escríbenos por WhatsApp",
    ctaChat: "Chatear con IntelliA",
    otras: "Lo demás que hacemos",
    waPagina: (nav) => `Hola Intellectum, vengo de la página de ${nav} y quiero más información`,
    agendaSrc: "/agenda?incrustado=1",
    generada:
      "Generada por scripts/generar-servicios.mjs. No la edites aquí: el\n     contenido vive en ese archivo y el próximo \"npm run paginas\" te la pisa.",
  },

  en: {
    codigo: "en",
    lang: "en",
    locale: "en_US",
    inicio: "/en",
    servicios: SERVICIOS_EN,
    otroCodigo: "es",
    otroNombre: "Versión en español",
    otroCorto: "ES",
    menuPrincipal: "Main menu",
    abrirMenu: "Open menu",
    marcaInicio: "Intellectum AI Solutions, home",
    nav: { demo: "Try it", servicios: "Services", proceso: "Process", nosotros: "About", faq: "FAQ", blog: "Blog" },
    iaChat: "IntelliA · live chat",
    ctaNav: "Free consultation",
    waNav: "Hi Intellectum, I'd like a free consultation about AI automation",
    pieLema:
      "Artificial intelligence and business automation, built to measure for companies in Ecuador.",
    pieSoluciones: "Solutions",
    pieEmpresa: "Company",
    pieContacto: "Contact",
    pieEnlaces: { nosotros: "About", proceso: "Process", faq: "FAQ", blog: "Blog", contacto: "Contact" },
    privacidad: "Privacy notice",
    condiciones: "Terms of service",
    chatIntelliA: "Chat with IntelliA",
    derechos: "© 2026 Intellectum AI Solutions. All rights reserved.",
    hechoEn: "Made in",
    conIA: "Powered by AI",
    escribenos: "Message us on WhatsApp",
    waFab: "Hi Intellectum, I'd like more information",
    ruta: "Breadcrumb",
    migaInicio: "Home",
    migaServicios: "Services",
    agendaCta: "Book your consultation",
    preguntaIa: "Ask IntelliA",
    hQue: "What it does, exactly",
    hComo: "How it's done",
    hNecesitas: "What you need to provide",
    hLimitesA: "What it ",
    hLimitesB: "doesn't",
    hLimitesC: " do",
    limitesEntrada: "Saying it here is cheaper than finding it out in the third meeting.",
    faqTituloA: "What we get",
    faqTituloB: "asked most.",
    faqLeadA: "If your question isn't here, ask ",
    faqLeadB: ": it answers at any hour.",
    ctaTituloA: "Half an hour and",
    ctaTituloB: "a clear map.",
    ctaSub:
      "The consultation is free and it isn't a sales call: you leave it knowing what to automate first and what to expect. Pick a time that suits you.",
    ctaMarco: "Pick the time for your consultation",
    ctaO: "Prefer to write first?",
    ctaWa: "Message us on WhatsApp",
    ctaChat: "Chat with IntelliA",
    otras: "The rest of what we do",
    waPagina: (nav) => `Hi Intellectum, I came from the ${nav} page and I'd like more information`,
    agendaSrc: "/agenda?incrustado=1&amp;lang=en",
    generada:
      "Generated by scripts/generar-servicios.mjs from scripts/servicios-en.mjs.\n     Don't edit it here: the next \"npm run paginas\" overwrites it.",
  },
};

/** La pareja de esta página en el otro idioma, para el enlace y el hreflang. */
function pareja(s, L) {
  return L.codigo === "es"
    ? SERVICIOS_EN.find((o) => o.es === s.slug)
    : SERVICIOS.find((o) => o.slug === s.es);
}

/* ── El armazón ───────────────────────────────────────────────────────────── */

/** Igual que en la portada, pero con rutas absolutas: aquí "#servicios" no
 *  llevaría a ninguna parte porque la sección vive en otra página. El enlace
 *  del idioma no va a la portada del otro idioma: va a ESTA misma página
 *  traducida, que es lo que la persona está mirando. */
function NAV(L, otra) {
  const inicio = L.inicio;
  return `
<header class="nav" id="nav">
  <div class="wrap nav-inner">
    <a href="${inicio}" class="brand" aria-label="${L.marcaInicio}">
      <img src="/logo-nav.webp" alt="" class="brand-logo" width="125" height="90" />
      <span class="brand-text">Intellectum</span>
    </a>

    <nav class="nav-links" aria-label="${L.menuPrincipal}">
      <a href="${inicio}#demo">${L.nav.demo}</a>
      <a href="${inicio}#servicios">${L.nav.servicios}</a>
      <a href="${inicio}#proceso">${L.nav.proceso}</a>
      <a href="${inicio}#nosotros">${L.nav.nosotros}</a>
      <a href="${inicio}#faq">${L.nav.faq}</a>
      <a href="/blog">${L.nav.blog}</a>
      <a href="/chat" class="nav-ia"><span class="ia-dot" aria-hidden="true"></span>IntelliA</a>
      <a href="${otra}" class="nav-lang" lang="${L.otroCodigo}" aria-label="${L.otroNombre}">${L.otroCorto}</a>
    </nav>

    <div class="nav-cta">
      <a href="${waTexto(L.waNav)}"
         class="btn btn-primary" target="_blank" rel="noopener">
        ${L.ctaNav}
        <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
    </div>

    <button class="nav-toggle" id="navToggle" aria-label="${L.abrirMenu}" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
  </div>
</header>

<div class="mobile-menu" id="mobileMenu">
  <a href="${inicio}#demo">${L.nav.demo}</a>
  <a href="${inicio}#servicios">${L.nav.servicios}</a>
  <a href="${inicio}#proceso">${L.nav.proceso}</a>
  <a href="${inicio}#nosotros">${L.nav.nosotros}</a>
  <a href="${inicio}#faq">${L.nav.faq}</a>
  <a href="/blog">${L.nav.blog}</a>
  <a href="/chat" class="mobile-ia"><span class="ia-dot" aria-hidden="true"></span>${L.iaChat}</a>
  <a href="${otra}" lang="${L.otroCodigo}">${L.otroNombre}</a>
  <a href="${WA}" class="btn btn-primary" target="_blank" rel="noopener">
    ${L.ctaNav} →
  </a>
</div>`;
}

const ICONO_FACEBOOK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z"/></svg>`;
const ICONO_INSTAGRAM = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>`;
const ICONO_LINKEDIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z"/></svg>`;
const ICONO_WHATSAPP = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488"/></svg>`;

function PIE(L) {
  const inicio = L.inicio;
  return `
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="cosmos-zona" data-cosmos>
          <canvas class="cosmos" aria-hidden="true"></canvas>
          <a href="${inicio}" aria-label="Intellectum AI Solutions">
            <div class="isotipo">
              <div class="isotipo-giro">
                <div class="isotipo-cuerpo">
                  <img src="/logo-completo.webp" alt="Intellectum AI Solutions" width="612" height="487" loading="lazy" />
                  <div class="isotipo-luz" aria-hidden="true"></div>
                </div>
              </div>
            </div>
          </a>
        </div>
        <p>${L.pieLema}</p>
        <div class="footer-redes">
          <a href="https://www.facebook.com/intellectum.ec" target="_blank" rel="noopener" aria-label="Intellectum en Facebook" title="Facebook">${ICONO_FACEBOOK}</a>
          <a href="https://www.instagram.com/intellectum.ec/" target="_blank" rel="noopener" aria-label="Intellectum en Instagram" title="Instagram">${ICONO_INSTAGRAM}</a>
          <a href="https://www.linkedin.com/company/intellectum-ai-solutions" target="_blank" rel="noopener" aria-label="Intellectum en LinkedIn" title="LinkedIn">${ICONO_LINKEDIN}</a>
        </div>
      </div>
      <div class="footer-col">
        <h4>${L.pieSoluciones}</h4>
        <ul>
${L.servicios.map((s) => `          <li><a href="/${s.slug}">${esc(s.nav)}</a></li>`).join("\n")}
        </ul>
      </div>
      <div class="footer-col">
        <h4>${L.pieEmpresa}</h4>
        <ul>
          <li><a href="${inicio}#nosotros">${L.pieEnlaces.nosotros}</a></li>
          <li><a href="${inicio}#proceso">${L.pieEnlaces.proceso}</a></li>
          <li><a href="${inicio}#faq">${L.pieEnlaces.faq}</a></li>
          <li><a href="/blog">${L.pieEnlaces.blog}</a></li>
          <li><a href="${inicio}#contacto">${L.pieEnlaces.contacto}</a></li>
          <li><a href="/privacidad">${L.privacidad}</a></li>
          <li><a href="/condiciones">${L.condiciones}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>${L.pieContacto}</h4>
        <ul>
          <li><a href="/chat">${L.chatIntelliA}</a></li>
          <li><a href="mailto:info@intellectum.ec">info@intellectum.ec</a></li>
          <li><a href="${WA}" target="_blank" rel="noopener">WhatsApp +593 96 751 8060</a></li>
          <li><a href="tel:+593983120003">+593 98 312 0003</a></li>
        </ul>
      </div>
    </div>

    <div class="footer-bottom">
      <span>${L.derechos} · <a href="/privacidad">${L.privacidad}</a> · <a href="/condiciones">${L.condiciones}</a></span>
      <span>${L.hechoEn} <span style="color: var(--accent);">Ecuador</span> · ${L.conIA}</span>
    </div>

    <div class="footer-legal">
      Intellectum AI Solutions S.A.S. · RUC 1793236353001 · Gaspar de Carvajal S1-10 y Guayaquil, Quito, Pichincha, Ecuador ·
      <a href="tel:+593983120003">+593 98 312 0003</a> ·
      <a href="mailto:info@intellectum.ec">info@intellectum.ec</a>
    </div>
  </div>
</footer>

<a href="${waTexto(L.waFab)}" class="fab-whatsapp" target="_blank" rel="noopener" aria-label="${L.escribenos}">
  ${ICONO_WHATSAPP}
</a>`;
}

/* ── El molde ─────────────────────────────────────────────────────────────── */

function pagina(s, L) {
  const url = `${SITIO}/${s.slug}`;
  const otras = L.servicios.filter((o) => o.slug !== s.slug);
  const par = pareja(s, L);

  /* Las dos direcciones del par, siempre en el mismo orden: el hreflang tiene
     que ser recíproco o Google lo ignora entero. x-default apunta al español
     porque el negocio vende en Ecuador: quien llega sin idioma declarado cae
     donde están los clientes. */
  const urlEs = L.codigo === "es" ? url : `${SITIO}/${par.slug}`;
  const urlEn = L.codigo === "en" ? url : `${SITIO}/${par.slug}`;
  const otraPagina = L.codigo === "es" ? `/${par.slug}` : `/${par.slug}`;

  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: L.migaInicio, item: `${SITIO}${L.inicio === "/" ? "/" : L.inicio}` },
          { "@type": "ListItem", position: 2, name: L.migaServicios, item: `${SITIO}${L.inicio}#servicios` },
          { "@type": "ListItem", position: 3, name: s.titulo, item: url },
        ],
      },
      {
        "@type": "Service",
        "@id": `${url}#servicio`,
        name: s.schema.name,
        description: s.schema.description,
        serviceType: s.schema.name,
        url,
        inLanguage: L.codigo,
        provider: { "@id": `${SITIO}/#organization` },
        areaServed: { "@type": "Country", name: "Ecuador" },
        availableChannel: {
          "@type": "ServiceChannel",
          serviceUrl: `${SITIO}/agenda`,
          servicePhone: "+593983120003",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: L.codigo,
        mainEntity: s.faq.map((f) => ({
          "@type": "Question",
          name: f.p,
          acceptedAnswer: { "@type": "Answer", text: f.r },
        })),
      },
    ],
  };

  return `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8" />
<meta name="facebook-domain-verification" content="9xfwj09xamrs3694cjhthfj1xqqax5" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />

<title>${esc(s.tituloTag)}</title>
<meta name="description" content="${esc(s.descripcion)}" />
<meta name="author" content="Intellectum AI Solutions" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<link rel="alternate" hreflang="es" href="${urlEs}" />
<link rel="alternate" hreflang="en" href="${urlEn}" />
<link rel="alternate" hreflang="x-default" href="${urlEs}" />

<meta property="og:type" content="website" />
<meta property="og:url" content="${url}" />
<meta property="og:site_name" content="Intellectum AI Solutions" />
<meta property="og:title" content="${esc(s.titulo)} · Intellectum AI" />
<meta property="og:description" content="${esc(s.descripcion)}" />
<meta property="og:image" content="${SITIO}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="${L.locale}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(s.titulo)} · Intellectum AI" />
<meta name="twitter:description" content="${esc(s.descripcion)}" />
<meta name="twitter:image" content="${SITIO}/og.png" />

<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
<link rel="manifest" href="/site.webmanifest" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />

<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>

<link rel="stylesheet" href="/estilos.css" />
</head>
<body>

<!-- ${L.generada} -->
${NAV(L, otraPagina)}

<main id="top">

<section class="sv-hero">
  <div class="wrap">
    <nav class="miga" aria-label="${L.ruta}">
      <a href="${L.inicio}">${L.migaInicio}</a>
      <span aria-hidden="true">›</span>
      <a href="${L.inicio}#servicios">${L.migaServicios}</a>
      <span aria-hidden="true">›</span>
      <span>${esc(s.nav)}</span>
    </nav>
    <h1>${esc(s.h1a)}<br><span class="serif-italic">${esc(s.h1b)}</span></h1>
    <p class="section-lead">${s.lead}</p>
    <div class="sv-ctas">
      <a href="/agenda" class="btn btn-primary">
        ${L.agendaCta}
        <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
      <a href="/chat" class="btn btn-secondary">
        <span class="ia-dot" aria-hidden="true"></span>
        ${L.preguntaIa}
      </a>
    </div>
  </div>
</section>

<section class="sv-bloque">
  <div class="wrap">
    <h2 class="reveal">${L.hQue}</h2>
    <p class="sv-entrada reveal">${s.queEntrada}</p>
    <ul class="sv-lista reveal">
${s.que.map((x) => `      <li>${x}</li>`).join("\n")}
    </ul>
  </div>
</section>

<section class="sv-bloque">
  <div class="wrap">
    <h2 class="reveal">${L.hComo}</h2>
    <p class="sv-entrada reveal">${s.comoEntrada}</p>
    <ol class="sv-pasos reveal">
${s.como.map((x) => `      <li>${x}</li>`).join("\n")}
    </ol>
  </div>
</section>

<section class="sv-bloque">
  <div class="wrap">
    <h2 class="reveal">${L.hNecesitas}</h2>
    <ul class="sv-lista reveal">
${s.necesitas.map((x) => `      <li>${x}</li>`).join("\n")}
    </ul>
  </div>
</section>

<section class="sv-bloque">
  <div class="wrap">
    <h2 class="reveal">${L.hLimitesA}<span class="serif-italic">${L.hLimitesB}</span>${L.hLimitesC}</h2>
    <p class="sv-entrada reveal">${L.limitesEntrada}</p>
    <ul class="sv-lista limites reveal">
${s.limites.map((x) => `      <li>${x}</li>`).join("\n")}
    </ul>
  </div>
</section>

<section class="faq" id="faq">
  <div class="wrap">
    <div class="faq-grid">
      <div class="reveal">
        <h2 class="section-title">${L.faqTituloA}<br><span class="serif-italic">${L.faqTituloB}</span></h2>
        <p class="section-lead">${L.faqLeadA}<a href="/chat" style="color:var(--accent);">IntelliA</a>${L.faqLeadB}</p>
      </div>
      <div class="faq-list reveal">
${s.faq
  .map(
    (f) => `        <div class="faq-item">
          <button class="faq-q" aria-expanded="false">
            ${esc(f.p)}
            <span class="plus" aria-hidden="true"></span>
          </button>
          <div class="faq-a"><div class="faq-a-inner">${esc(f.r)}</div></div>
        </div>`,
  )
  .join("\n")}
      </div>
    </div>
  </div>
</section>

<section class="cta" id="contacto">
  <div class="wrap cta-inner">
    <h2 class="reveal">${L.ctaTituloA}<br><span class="serif-italic">${L.ctaTituloB}</span></h2>
    <p class="cta-sub reveal">${L.ctaSub}</p>

    <div class="cta-agenda reveal">
      <iframe id="agendaMarco" src="${L.agendaSrc}" title="${L.ctaMarco}" loading="lazy"></iframe>
    </div>

    <p class="cta-o reveal">${L.ctaO}</p>

    <div class="cta-ctas reveal">
      <a href="${waTexto(L.waPagina(s.nav))}"
         class="btn btn-whatsapp" target="_blank" rel="noopener">
        <span style="display:inline-flex;width:18px;height:18px;">${ICONO_WHATSAPP}</span>
        ${L.ctaWa}
      </a>
      <a href="/chat" class="btn btn-secondary">
        <span class="ia-dot" aria-hidden="true"></span>
        ${L.ctaChat}
      </a>
    </div>
  </div>
</section>

<section class="sv-otras">
  <div class="wrap">
    <h2 class="reveal">${L.otras}</h2>
    <div class="sv-otras-grid">
${otras
  .map(
    (o) => `      <a class="sv-otra reveal" href="/${o.slug}">
        <h3>${esc(o.nav)}</h3>
        <p>${esc(o.schema.description)}</p>
      </a>`,
  )
  .join("\n")}
    </div>
  </div>
</section>

</main>
${PIE(L)}

<script src="/pagina.js" defer></script>

<script>
/* El mismo oyente de la portada: la agenda incrustada avisa cuánto mide y el
   marco la sigue. Se comprueba el origen y se acota el alto. */
(function () {
  "use strict";
  var marco = document.getElementById("agendaMarco");
  if (!marco) return;
  window.addEventListener("message", function (ev) {
    if (ev.origin !== location.origin) return;
    var dato = ev.data;
    if (!dato || dato.agenda !== "alto") return;
    var alto = Number(dato.alto);
    if (!isFinite(alto)) return;
    marco.style.height = Math.max(120, Math.min(1400, Math.ceil(alto))) + "px";
    if (!marco.classList.contains("ajustado")) {
      void marco.offsetHeight;
      marco.classList.add("ajustado");
    }
  });
})();
</script>
<script defer src="/_vercel/insights/script.js"></script>
<script src="/medicion.js" defer></script>
</body>
</html>
`;
}

/* ── Escribir ─────────────────────────────────────────────────────────────── */

/* Antes de escribir nada: que los dos idiomas tengan las mismas seis páginas.
   Si alguien añade un servicio en español y se olvida del inglés, el hreflang
   apuntaría a una dirección que no existe, y eso es peor que no tenerlo. */
for (const s of SERVICIOS) {
  if (!SERVICIOS_EN.some((o) => o.es === s.slug)) {
    console.error(`\n✗ "${s.slug}" no tiene traducción en scripts/servicios-en.mjs`);
    process.exit(1);
  }
}
for (const o of SERVICIOS_EN) {
  if (!SERVICIOS.some((s) => s.slug === o.es)) {
    console.error(`\n✗ "${o.slug}" dice traducir a "${o.es}", que no existe en SERVICIOS`);
    process.exit(1);
  }
}

mkdirSync(RAIZ, { recursive: true });
let escritas = 0;
for (const L of [IDIOMAS.es, IDIOMAS.en]) {
  for (const s of L.servicios) {
    writeFileSync(join(RAIZ, `${s.slug}.html`), pagina(s, L), "utf8");
    console.log(`  /${s.slug}  →  ${s.slug}.html`);
    escritas++;
  }
}
console.log(`\n${escritas} páginas de servicio generadas (${SERVICIOS.length} en español, ${SERVICIOS_EN.length} en inglés).`);

export { SERVICIOS, SERVICIOS_EN };
