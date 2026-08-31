/**
 * EL BANCO DE PRUEBAS DE LA COPIA POR CLIENTE.
 *
 *   node scripts/probar-multicliente.mjs
 *
 * Comprueba lo único que de verdad importa del modelo madre: que una copia
 * configurada para otro negocio se comporte como ESE negocio, y que sin
 * configurar nada todo siga siendo exactamente Intellectum.
 *
 * Corre offline contra el almacén de archivo en /tmp. No toca datos/, ni la
 * base real, ni manda nada por la red.
 */

import { rm } from "node:fs/promises";

process.env.VERCEL = "1";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.RESEND_API_KEY;

const CARPETA = "/tmp/intellectum";
await rm(CARPETA, { recursive: true, force: true });

let fallos = 0;
function prueba(nombre, condicion) {
  console.log(`  ${condicion ? "ok  " : "FALLO"} ${nombre}`);
  if (!condicion) fallos += 1;
}

// ── 1. Sin variables, todo es Intellectum como siempre ───────────────────────
console.log("\nSin configurar nada (la copia que hoy está publicada):");
{
  const { CLIENTE, NEGOCIO, esIntellectum } = await import("../lib/cliente.js");
  prueba("el dueño de la copia es intellectum", CLIENTE === "intellectum");
  prueba("el negocio se llama Intellectum AI Solutions", NEGOCIO.nombre === "Intellectum AI Solutions");
  prueba("el agente se llama IntelliA", NEGOCIO.agente === "IntelliA");
  prueba("el correo es el de Intellectum", NEGOCIO.correo === "info@intellectum.ec");
  prueba("esIntellectum() dice que sí", esIntellectum() === true);

  const { construirSystem } = await import("../lib/prompt.js");
  const bloques = construirSystem({ canal: "web" });
  const texto = bloques.map((b) => b.text).join("\n");
  prueba("el prompt se presenta como IntelliA de Intellectum", /Eres IntelliA, el asistente virtual de Intellectum AI Solutions/.test(texto));
  prueba("el prompt reparte el correo de Intellectum", texto.includes("info@intellectum.ec"));
}

// ── 2. Con las variables de otro negocio, la copia ES ese negocio ────────────
// Se importan los módulos con una marca en la ruta para saltarse la caché de
// módulos de Node: lib/cliente.js lee el entorno al cargarse.
console.log("\nConfigurada como una ferretería:");
{
  process.env.CLIENTE_SLUG = "ferreteria-tornillo";
  process.env.NEGOCIO_NOMBRE = "Ferretería El Tornillo";
  process.env.NEGOCIO_NOMBRE_CORTO = "El Tornillo";
  process.env.NEGOCIO_AGENTE = "Tornillito";
  process.env.NEGOCIO_CORREO = "ventas@eltornillo.ec";
  process.env.NEGOCIO_WHATSAPP = "+593 99 111 2233";
  process.env.NEGOCIO_WEB = "eltornillo.ec";
  process.env.NEGOCIO_CITA = "visita técnica gratuita";

  const { CLIENTE, NEGOCIO, esIntellectum } = await import("../lib/cliente.js?copia=2");
  prueba("el dueño de la copia es la ferretería", CLIENTE === "ferreteria-tornillo");
  prueba("el negocio se llama Ferretería El Tornillo", NEGOCIO.nombre === "Ferretería El Tornillo");
  prueba("el agente se llama Tornillito", NEGOCIO.agente === "Tornillito");
  prueba("esIntellectum() dice que no", esIntellectum() === false);

  const { construirSystem } = await import("../lib/prompt.js?copia=2");
  const bloques = construirSystem({ canal: "web", ficha: "Vendemos herramientas y materiales de construcción en Quito." });
  const texto = bloques.map((b) => b.text).join("\n");

  prueba("el prompt se presenta como Tornillito de la ferretería", /Eres Tornillito, el asistente virtual de Ferretería El Tornillo/.test(texto));
  prueba("el prompt usa la ficha de la ferretería", texto.includes("herramientas y materiales de construcción"));
  prueba("el prompt ofrece la visita técnica, no la consultoría", texto.includes("visita técnica gratuita"));
  prueba("el prompt nombra el sitio de la ferretería", texto.includes("eltornillo.ec"));
  prueba("el prompt reparte el correo de la ferretería", texto.includes("ventas@eltornillo.ec"));
  prueba("el prompt reparte el teléfono de la ferretería", texto.includes("+593 99 111 2233"));

  // LO MÁS IMPORTANTE DE TODA LA ETAPA: ni rastro del negocio de la casa.
  prueba("NO aparece la palabra Intellectum por ningún lado", !/intellectum/i.test(texto));
  prueba("NO aparece el correo de Intellectum", !texto.includes("info@intellectum.ec"));
  prueba("NO aparece el WhatsApp de Intellectum", !texto.includes("98 312 0003"));
  prueba("NO aparece el nombre IntelliA", !/IntelliA/.test(texto));

}

// ── 3. El almacén, en un PROCESO APARTE ──────────────────────────────────────
// Cada copia es un despliegue distinto con su propio entorno, así que la única
// prueba fiel es un proceso hijo: recargar un módulo dentro del mismo proceso
// no recarga sus dependencias, y lib/cliente.js lee el entorno al cargarse.
console.log("\nEl almacén de la copia de la ferretería (proceso aparte):");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    import { abrirAlmacen } from "../lib/almacen.js";
    const almacen = abrirAlmacen();
    const lead = await almacen.guardarLead(
      { nombre: "Doña Rosa", contacto: "rosa@ejemplo.com", necesidad: "Cotizar cemento" },
      { canal: "web", sesion: "web-1" },
    );
    const suyos = await almacen.listarLeads({});
    const ajenos = await almacen.listarLeads({ cliente: "intellectum" });
    const editadoAjeno = await almacen.actualizarLead({ cliente: "intellectum", id: lead.id, estado: "ganado" });
    console.log(JSON.stringify({
      dueno: lead?.cliente,
      loVeSuDueno: suyos.some((l) => l.id === lead.id),
      loVeIntellectum: ajenos.some((l) => l.id === lead.id),
      editableDesdeFuera: editadoAjeno !== null,
    }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    env: {
      ...process.env,
      CLIENTE_SLUG: "ferreteria-tornillo",
      NEGOCIO_NOMBRE: "Ferretería El Tornillo",
    },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());
  prueba("el lead se guarda a nombre de la ferretería", r.dueno === "ferreteria-tornillo");
  prueba("la ferretería ve su propio lead", r.loVeSuDueno === true);
  prueba("Intellectum NO ve el lead de la ferretería", r.loVeIntellectum === false);
  prueba("nadie edita el lead de otro negocio con el id adivinado", r.editableDesdeFuera === false);
}

// ── 4. TODO LO QUE SALE DEL SISTEMA, en un proceso aparte ───────────────────
// Los correos, el .ics, el PDF y los mensajes fijos son lo que de verdad ve el
// cliente de un cliente. Aquí se genera cada uno con la copia de la ferretería
// SIN configurar ni un dato de contacto —el peor caso— y se comprueba lo mismo
// en todos: que no aparezca Intellectum por ningún lado, y que la frase quede
// bien escrita aunque falte el dato en vez de quedar coja o con un hueco.
console.log("\nLo que le llega a la gente desde una copia ajena (proceso aparte):");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    const { NEGOCIO, comoEscribirnos } = await import("../lib/cliente.js");
    const { construirSystem } = await import("../lib/prompt.js");
    const { invitacionICS } = await import("../lib/calendario.js");
    const { textoDeCita, correoDeCita } = await import("../lib/correo-cita.js");
    const { textoDeHorarios, correoDeHorarios } = await import("../lib/correo-horarios.js");
    const { nombreDeArchivo } = await import("../lib/documento.js");

    const cita = { inicioISO: "2026-09-04T21:00:00.000Z", finISO: "2026-09-04T21:30:00.000Z", nombre: "Rosa", id: "abc" };
    const horarios = [{ etiqueta: "jueves 16:00", codigo: "X1", dia: "jueves", hora: "16:00" }];

    console.log(JSON.stringify({
      prompt: construirSystem({ canal: "web" }).map((b) => b.text).join("\\n"),
      promptConFicha: construirSystem({ canal: "web", ficha: "Vendemos tornillos." }).map((b) => b.text).join("\\n"),
      ics: invitacionICS(cita),
      correoTexto: textoDeCita({ nombre: "Rosa", cuando: "jueves 4 de septiembre 16:00", codigo: "AB12", cambio: "nueva" }),
      correoHtml: correoDeCita({ nombre: "Rosa", cuando: "jueves 4 de septiembre 16:00", codigo: "AB12", cambio: "nueva" }),
      horariosTexto: textoDeHorarios({ nombre: "Rosa", horarios }),
      horariosHtml: correoDeHorarios({ nombre: "Rosa", horarios }),
      archivo: nombreDeArchivo("ZZ99"),
      razonSocial: NEGOCIO.razonSocial,
      ruc: NEGOCIO.ruc,
      ciudad: NEGOCIO.ciudad,
      vias: comoEscribirnos(),
    }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    // A propósito: SOLO el slug y el nombre. Ni correo, ni WhatsApp, ni sitio.
    env: {
      PATH: process.env.PATH,
      VERCEL: "1",
      CLIENTE_SLUG: "ferreteria-tornillo",
      NEGOCIO_NOMBRE: "Ferretería El Tornillo",
      NEGOCIO_NOMBRE_CORTO: "El Tornillo",
      NEGOCIO_AGENTE: "Tornillito",
      NEGOCIO_EVENTO: "visita",
      NEGOCIO_CITA: "visita técnica gratuita",
    },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());

  const rastro = /intellectum|intellia|98 ?312 ?0003|96 ?751 ?8060|1793236353001/i;
  const limpio = (nombre, texto) => prueba(`${nombre}: ni rastro de Intellectum`, !rastro.test(texto));

  // LO MÁS IMPORTANTE: sin ficha, el agente NO hereda la de casa.
  prueba("sin ficha, el agente NO recibe la ficha de Intellectum", !/Intellectum/i.test(r.prompt));
  prueba("sin ficha, el agente sabe que no sabe", /no tienes el catálogo/.test(r.prompt));
  prueba("sin ficha, el agente se presenta como el negocio suyo", /Eres Tornillito, el asistente virtual de Ferretería El Tornillo/.test(r.prompt));
  prueba("con ficha propia, usa la suya", r.promptConFicha.includes("Vendemos tornillos."));
  limpio("el prompt", r.prompt);

  limpio("la invitación .ics", r.ics);
  prueba("el .ics lo titula la ferretería", r.ics.includes("SUMMARY:Visita — Ferretería El Tornillo"));
  prueba("sin correo, el .ics omite el ORGANIZER en vez de dejarlo vacío", !/ORGANIZER/.test(r.ics));
  prueba("el UID del .ics no queda cojo", /UID:abc@ferreteria-tornillo/.test(r.ics));

  limpio("el correo de la cita (texto)", r.correoTexto);
  limpio("el correo de la cita (HTML)", r.correoHtml);
  prueba("el correo nombra la visita, no la consultoría", /tu visita quedó agendada/i.test(r.correoTexto));
  prueba("el correo no manda a nadie a un enlace relativo roto", !/^\s+\/chat/m.test(r.correoTexto));
  prueba("sin sitio, el correo dice que respondan en vez de dar un enlace", /Responde a este correo/.test(r.correoTexto));
  prueba("el correo firma con la ferretería", r.correoTexto.includes("Ferretería El Tornillo"));
  prueba("el correo no deja separadores sueltos", !/^\s*·|·\s*$/m.test(r.correoTexto));

  limpio("el correo de horarios (texto)", r.horariosTexto);
  limpio("el correo de horarios (HTML)", r.horariosHtml);

  prueba("el PDF se llama como la ferretería", r.archivo === "Cotizacion-ElTornillo-ZZ99.pdf");
  prueba("la razón social NO es la S.A.S. de Intellectum", r.razonSocial === "Ferretería El Tornillo");
  prueba("el RUC de Intellectum NO viaja en la cotización ajena", r.ruc === "");
  prueba("la ciudad tampoco se hereda", r.ciudad === "");
  prueba("sin contacto configurado, no se inventa ninguno", r.vias === "");
}

// ── 4bis. La copia BIEN configurada: todo suyo, nada de casa ────────────────
console.log("\nLa copia de la ferretería con todos sus datos puestos:");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    const { invitacionICS } = await import("../lib/calendario.js");
    const { textoDeCita } = await import("../lib/correo-cita.js");
    const { textoDeHorarios } = await import("../lib/correo-horarios.js");
    const { enlaceDeCotizacion } = await import("../lib/documento.js");
    console.log(JSON.stringify({
      ics: invitacionICS({ inicioISO: "2026-09-04T21:00:00.000Z", finISO: "2026-09-04T21:30:00.000Z", nombre: "Rosa", id: "abc" }),
      correo: textoDeCita({ nombre: "Rosa", cuando: "jueves 16:00", codigo: "AB12", cambio: "nueva" }),
      horarios: textoDeHorarios({ nombre: "Rosa", horarios: [{ etiqueta: "jueves 16:00", codigo: "X1" }] }),
      enlace: enlaceDeCotizacion("lead-1"),
    }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      VERCEL: "1",
      CRON_SECRET: "para-firmar",
      CLIENTE_SLUG: "ferreteria-tornillo",
      NEGOCIO_NOMBRE: "Ferretería El Tornillo",
      NEGOCIO_NOMBRE_CORTO: "El Tornillo",
      NEGOCIO_AGENTE: "Tornillito",
      NEGOCIO_EVENTO: "visita",
      NEGOCIO_CITA: "visita técnica gratuita",
      NEGOCIO_CORREO: "ventas@eltornillo.ec",
      NEGOCIO_WHATSAPP: "+593 99 111 2233",
      NEGOCIO_WHATSAPP_BOT: "+593 99 111 2244",
      SITIO_URL: "https://eltornillo.ec",
    },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());
  const rastro = /intellectum|intellia|98 ?312 ?0003|96 ?751 ?8060/i;

  prueba("el .ics lo organiza la ferretería", r.ics.includes("ORGANIZER;CN=Ferretería El Tornillo:mailto:ventas@eltornillo.ec"));
  prueba("el .ics lo produce su propio agente", r.ics.includes("PRODID:-//Ferretería El Tornillo//Tornillito//ES"));
  prueba("el UID lleva su dominio", r.ics.includes("@eltornillo.ec"));
  prueba("el .ics: ni rastro de Intellectum", !rastro.test(r.ics));

  prueba("el correo enlaza a SU sitio", r.correo.includes("https://eltornillo.ec/chat"));
  prueba("el correo firma con su correo y su dominio", r.correo.includes("ventas@eltornillo.ec · eltornillo.ec"));
  prueba("el correo: ni rastro de Intellectum", !rastro.test(r.correo));
  prueba("los horarios enlazan a SU agenda", r.horarios.includes("https://eltornillo.ec/agenda"));
  prueba("los horarios: ni rastro de Intellectum", !rastro.test(r.horarios));
  prueba("el enlace firmado del PDF sale de su dominio", r.enlace.startsWith("https://eltornillo.ec/api/documento?"));
}

// ── 5. Las plantillas de WhatsApp son de quien las tiene aprobadas ──────────
// El texto de las plantillas vive en Meta y nombra a Intellectum. Ninguna
// copia ajena puede mandarlas: o tiene las suyas, o ese mensaje no sale.
console.log("\nLas plantillas de WhatsApp:");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    const m = await import("../lib/mensajeria.js");
    const salidas = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opciones) => {
      salidas.push(JSON.parse(opciones.body));
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.x" }] }), text: async () => "" };
    };
    const recordatorio = await m.enviarRecordatorioWhatsApp({ para: "0991234567", nombre: "Rosa", cuando: "hoy 16:00", codigo: "AB12" });
    const aviso = await m.avisarEquipoWhatsApp({ texto: "algo pasó" });
    globalThis.fetch = original;
    console.log(JSON.stringify({ recordatorio, aviso, salidas }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      VERCEL: "1",
      CLIENTE_SLUG: "ferreteria-tornillo",
      NEGOCIO_NOMBRE: "Ferretería El Tornillo",
      META_TOKEN: "falso",
      META_PHONE_NUMBER_ID: "000",
    },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());
  prueba("no manda la plantilla de Intellectum como recordatorio", r.recordatorio.entregado === false);
  prueba("no manda el aviso interno al WhatsApp de Intellectum", r.aviso.entregado === false);
  prueba("de hecho no sale NI UNA petición a Meta", r.salidas.length === 0);
}

// ── 5bis. El respaldo semanal no se lleva la base de los demás ──────────────
// Es el correo que sale solo cada domingo con una foto de la base adjunta. Sin
// filtro por cliente, el respaldo de un negocio le entregaba los leads y las
// conversaciones de todos los otros, y encima por correo.
console.log("\nEl respaldo semanal:");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    const { abrirAlmacen } = await import("../lib/almacen.js");
    const almacen = abrirAlmacen();
    // Un lead de la ferretería (esta copia) y otro escrito a nombre de casa.
    await almacen.guardarLead({ nombre: "Doña Rosa", contacto: "rosa@ejemplo.com" }, { canal: "web", sesion: "s1" });
    await almacen.registrarEvento({ tipo: "prueba_ajena", actor: "test", cliente: "intellectum" });
    await almacen.registrarEvento({ tipo: "prueba_propia", actor: "test" });
    const foto = await almacen.respaldo();
    console.log(JSON.stringify({
      leads: foto.leads.map((l) => l.cliente),
      tipos: foto.eventos.map((e) => e.tipo),
      clientesEnEventos: [...new Set(foto.eventos.map((e) => e.cliente))],
    }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    env: {
      PATH: process.env.PATH,
      VERCEL: "1",
      CLIENTE_SLUG: "ferreteria-tornillo",
      NEGOCIO_NOMBRE: "Ferretería El Tornillo",
    },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());
  prueba("el respaldo solo trae leads suyos", r.leads.every((c) => c === "ferreteria-tornillo"));
  prueba("el respaldo no se lleva eventos de otro negocio", !r.tipos.includes("prueba_ajena"));
  prueba("y sí trae los suyos", r.tipos.includes("prueba_propia"));
  prueba("ningún otro cliente aparece en la foto", r.clientesEnEventos.every((c) => c === "ferreteria-tornillo"));
}

// ── 6. NO REGRESIÓN: la copia de casa sigue diciendo lo mismo de siempre ────
// Todo lo de arriba solo vale si Intellectum no cambió. Esta sección compara
// palabra por palabra lo que sale hoy con lo que salía antes del multicliente.
console.log("\nLa copia de Intellectum, sin ninguna variable puesta:");
{
  const { execFileSync } = await import("node:child_process");
  const guion = `
    const { invitacionICS } = await import("../lib/calendario.js");
    const { textoDeCita } = await import("../lib/correo-cita.js");
    const { textoDeHorarios } = await import("../lib/correo-horarios.js");
    const { nombreDeArchivo } = await import("../lib/documento.js");
    const { comoEscribirnos } = await import("../lib/cliente.js");
    console.log(JSON.stringify({
      ics: invitacionICS({ inicioISO: "2026-09-04T21:00:00.000Z", finISO: "2026-09-04T21:30:00.000Z", nombre: "Rosa", id: "abc" }),
      correo: textoDeCita({ nombre: "Rosa", cuando: "jueves 4 de septiembre 16:00", codigo: "AB12", cambio: "nueva" }),
      horarios: textoDeHorarios({ nombre: "Rosa", horarios: [{ etiqueta: "jueves 16:00", codigo: "X1" }] }),
      archivo: nombreDeArchivo("ZZ99"),
      vias: comoEscribirnos(),
    }));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "--eval", guion], {
    cwd: new URL("./", import.meta.url).pathname,
    env: { PATH: process.env.PATH, VERCEL: "1" },
    encoding: "utf8",
  });
  const r = JSON.parse(salida.trim().split("\n").pop());

  prueba("el .ics sigue siendo el de IntelliA", r.ics.includes("PRODID:-//Intellectum AI Solutions//IntelliA//ES"));
  prueba("el .ics sigue organizándolo info@intellectum.ec", r.ics.includes("ORGANIZER;CN=Intellectum AI Solutions:mailto:info@intellectum.ec"));
  prueba("el .ics sigue titulándose igual", r.ics.includes("SUMMARY:Consultoría gratuita — Intellectum AI Solutions"));
  prueba("el UID sigue en intellectum.ec", r.ics.includes("@intellectum.ec"));

  prueba("el correo sigue diciendo TU CONSULTORÍA QUEDÓ AGENDADA", r.correo.includes("TU CONSULTORÍA QUEDÓ AGENDADA"));
  prueba("el correo sigue enlazando a www.intellectum.ec", r.correo.includes("https://www.intellectum.ec/chat"));
  prueba("el correo sigue firmando igual", r.correo.includes("Intellectum AI Solutions\ninfo@intellectum.ec · www.intellectum.ec"));
  prueba("el correo sigue dando el WhatsApp del bot", r.correo.includes("WhatsApp +593 96 751 8060"));
  prueba("los horarios siguen firmando igual", r.horarios.includes("Intellectum AI Solutions · info@intellectum.ec · +593 96 751 8060"));
  prueba("el PDF sigue llamándose como siempre", r.archivo === "Cotizacion-Intellectum-ZZ99.pdf");
  prueba("las vías de contacto siguen siendo las de casa", r.vias === "escríbenos a info@intellectum.ec o llámanos al +593 98 312 0003");
}

// ── 3. El plan por defecto es el más pequeño, no el más grande ───────────────
console.log("\nLos seguros:");
{
  const { PLAN_POR_DEFECTO, planDe } = await import("../lib/planes.js");
  prueba("un cliente sin plan estrena con el plan más pequeño", PLAN_POR_DEFECTO === "asistente");
  const plan = planDe(null);
  prueba("y ese plan NO trae el cotizador", !(plan?.herramientas ?? []).includes("cotizar"));
}

await rm(CARPETA, { recursive: true, force: true });

console.log("");
if (fallos) {
  console.error(`${fallos} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("Todo en verde.");
