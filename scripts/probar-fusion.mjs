/**
 * PRUEBA OFFLINE — la fusión de leads por persona.
 *
 * Sin red y sin Supabase: usa el backend de archivo apuntado a una carpeta
 * temporal. Comprueba que la misma persona (mismo correo o mismo teléfono,
 * escrito distinto) termina en UNA ficha; que los datos del dueño no se
 * pisan; y que un contacto distinto sigue creando ficha aparte.
 *
 *   node scripts/probar-fusion.mjs
 */
import fs from "node:fs/promises";

// El mismo truco que los demás bancos: con VERCEL=1 el almacén escribe en
// /tmp/intellectum, que se limpia antes de empezar. Nada toca datos/ real.
process.env.VERCEL = "1";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
await fs.rm("/tmp/intellectum", { recursive: true, force: true });

const { abrirAlmacen } = await import("../lib/almacen.js");
const almacen = abrirAlmacen();

let fallos = 0;
function prueba(nombre, condicion) {
  console.log(`  ${condicion ? "ok  " : "FALLO"} ${nombre}`);
  if (!condicion) fallos++;
}

// 1. Mismo correo por dos canales → una sola ficha, completada.
const a = await almacen.guardarLead(
  { nombre: "Ana", contacto: "ana@empresa.ec", empresa: "", necesidad: "cotizó chatbot", urgencia: "media", estado: "nuevo" },
  { canal: "web", sesion: "s_web1" },
);
const b = await almacen.guardarLead(
  { nombre: "", contacto: "ANA@empresa.ec", empresa: "Empresa SA", necesidad: "agendó consultoría", urgencia: "alta", estado: "contactado" },
  { canal: "whatsapp", sesion: "593999000111" },
);
prueba("mismo correo → mismo id", a.id === b.id);
prueba("el nombre previo no se pisa", b.nombre === "Ana");
prueba("la empresa vacía se completa", b.empresa === "Empresa SA");
prueba("la urgencia sube", b.urgencia === "alta");
prueba("contactado gana a nuevo", b.estado === "contactado");

const lista1 = await almacen.listarLeads({});
prueba("hay UNA ficha, no dos", lista1.length === 1);

// 2. El mismo teléfono escrito de tres maneras → una ficha.
const c = await almacen.guardarLead(
  { nombre: "Luis", contacto: "099 887 7665", necesidad: "voz", urgencia: "media" },
  { canal: "web" },
);
const d = await almacen.guardarLead(
  { nombre: "", contacto: "+593998877665", necesidad: "voz y whatsapp", urgencia: "media" },
  { canal: "voz" },
);
prueba("099... y +593 99... son la misma persona", c.id === d.id);

// 3. Una ficha que el dueño CERRÓ no absorbe consultas nuevas: la persona que
// vuelve tras un "ganado" trae una oportunidad nueva, con ficha nueva y
// abierta; y la ficha cerrada conserva su nota y su estado tal cual.
await almacen.actualizarLead({ id: a.id, nota: "cliente clave, llamar el lunes", estado: "ganado" });
const e = await almacen.guardarLead(
  { nombre: "Ana", contacto: "ana@empresa.ec", necesidad: "recotizó", urgencia: "baja", estado: "contactado" },
  { canal: "web", sesion: "s_web2" },
);
prueba("la ficha ganada no absorbe: nace ficha nueva", e.id !== a.id && !e.fue_fusion);
const cerrada = (await almacen.listarLeads({ limite: 50 })).find((l) => l.id === a.id);
prueba("la nota del dueño sigue intacta en la cerrada", cerrada?.nota === "cliente clave, llamar el lunes");
prueba("la cerrada sigue en ganado", cerrada?.estado === "ganado");

// 4. Contacto distinto → ficha aparte. Cuentas: Ana cerrada + Ana nueva +
// Luis + Otro = cuatro fichas.
await almacen.guardarLead({ nombre: "Otro", contacto: "otro@x.com", urgencia: "media" }, { canal: "web" });
const lista2 = await almacen.listarLeads({ limite: 50 });
prueba("cuatro fichas: dos de Ana (cerrada y nueva), Luis y Otro", lista2.length === 4);

// 5. La ficha se muda al canal vigente: leadDeSesion la encuentra donde la
// persona habla AHORA (de esto cuelgan el candado de cotizar y el calificador).
prueba("la fusión trae la marca fue_fusion", d.fue_fusion === true);
prueba("la ficha se mudó al canal vigente", d.canal === "voz");
const porSesionNueva = await almacen.guardarLead(
  { nombre: "", contacto: "099 887 7665", necesidad: "seguimiento", urgencia: "media" },
  { canal: "whatsapp", sesion: "593998877665" },
);
const encontrado = await almacen.leadDeSesion({ canal: "whatsapp", sesion: "593998877665" });
prueba("leadDeSesion encuentra la ficha en el canal nuevo", encontrado?.id === porSesionNueva.id);

// 6. La ficha ABIERTA de Ana sí absorbe su siguiente consulta.
const anaOtraVez = await almacen.guardarLead(
  { nombre: "Ana", contacto: "ana@empresa.ec", necesidad: "más detalles", urgencia: "media" },
  { canal: "web", sesion: "s_web2" },
);
prueba("la ficha abierta de Ana sí fusiona", anaOtraVez.id === e.id && anaOtraVez.fue_fusion === true);

// 7. El resumen con prefijo de cotización no se pisa (el seguimiento cuelga de él).
const r1 = await almacen.guardarLead(
  { nombre: "Rosa", contacto: "rosa@x.ec", resumen: "Cotizó por chat: Chatbot. Rango dado: $900-1200.", urgencia: "media" },
  { canal: "web", sesion: "s_rosa" },
);
const r2 = await almacen.guardarLead(
  { nombre: "Rosa", contacto: "rosa@x.ec", resumen: "Agendó consultoría para el lunes.", urgencia: "media" },
  { canal: "web", sesion: "s_rosa" },
);
prueba("el resumen de cotización sobrevive a la fusión", r2.resumen.startsWith("Cotizó por chat:"));

// 8. La fusión queda en la bitácora.
const eventos = await almacen.listarEventos({ limite: 50 });
prueba("quedó el evento lead_fusionado", eventos.some((ev) => ev.tipo === "lead_fusionado"));

await fs.rm("/tmp/intellectum", { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} FALLOS.`);
process.exit(fallos === 0 ? 0 : 1);
