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

// 3. La nota del dueño y el estado "ganado" no se tocan.
await almacen.actualizarLead({ id: a.id, nota: "cliente clave, llamar el lunes", estado: "ganado" });
const e = await almacen.guardarLead(
  { nombre: "Ana", contacto: "ana@empresa.ec", necesidad: "recotizó", urgencia: "baja", estado: "contactado" },
  { canal: "web" },
);
prueba("la nota del dueño sigue intacta", e.nota === "cliente clave, llamar el lunes");
prueba("ganado no se degrada a contactado", e.estado === "ganado");
prueba("la urgencia no baja", e.urgencia === "alta");

// 4. Contacto distinto → ficha aparte.
await almacen.guardarLead({ nombre: "Otro", contacto: "otro@x.com", urgencia: "media" }, { canal: "web" });
const lista2 = await almacen.listarLeads({});
prueba("tres personas = tres fichas", lista2.length === 3);

// 5. La fusión queda en la bitácora.
const eventos = await almacen.listarEventos({ limite: 50 });
prueba("quedó el evento lead_fusionado", eventos.some((ev) => ev.tipo === "lead_fusionado"));

await fs.rm("/tmp/intellectum", { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} FALLOS.`);
process.exit(fallos === 0 ? 0 : 1);
