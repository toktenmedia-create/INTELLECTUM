/* Comprueba que las etiquetas entran en la búsqueda, en los dos almacenes. */
import fs from "node:fs/promises";

let fallos = 0;
const ok = (b, q) => { if (b) console.log("  ok   " + q); else { fallos++; console.log("  FALLA " + q); } };

/* ── 1. Almacén de archivo ────────────────────────────────────────────── */
process.env.VERCEL = "1";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
await fs.rm("/tmp/intellectum", { recursive: true, force: true });

const { abrirAlmacen } = await import("../lib/almacen.js");
const local = abrirAlmacen();

await local.guardarLead({ nombre: "Ana Vera", empresa: "Óptica Sur", necesidad: "atender pedidos" },
  { cliente: "intellectum", canal: "whatsapp", sesion: "593991111111" });
await local.guardarLead({ nombre: "Beto Luna", empresa: "Panadería Norte", necesidad: "reservas" },
  { cliente: "intellectum", canal: "whatsapp", sesion: "593992222222" });

const todos = await local.listarLeads({ cliente: "intellectum" });
const ana = todos.find((l) => l.nombre === "Ana Vera");
await local.actualizarLead({ id: ana.id, etiquetas: ["referido", "clínica dental"] });

console.log("\nALMACÉN DE ARCHIVO");
let r = await local.buscarLeads({ texto: "referido" });
ok(r.length === 1 && r[0].nombre === "Ana Vera", "la etiqueta entera encuentra el lead");
r = await local.buscarLeads({ texto: "REFERIDO" });
ok(r.length === 1, "no distingue mayúsculas");
r = await local.buscarLeads({ texto: "clínica dental" });
ok(r.length === 1, "etiqueta con espacio y tilde");
r = await local.buscarLeads({ texto: "refe" });
ok(r.length === 0, "un trozo NO encuentra (misma regla que Supabase)");
r = await local.buscarLeads({ texto: "Óptica" });
ok(r.length === 1, "los campos de siempre siguen buscándose por trozo");
r = await local.buscarLeads({ texto: "Panadería" });
ok(r.length === 1 && r[0].nombre === "Beto Luna", "el lead sin etiquetas no se rompe");

await fs.rm("/tmp/intellectum", { recursive: true, force: true });

/* ── 2. Almacén de Supabase: se mira la URL que arma, sin salir a la red ── */
console.log("\nALMACÉN DE SUPABASE (URL construida, sin tocar la base)");
process.env.SUPABASE_URL_INTELLECTUM = "https://falso.supabase.co";
process.env.SUPABASE_SERVICE_KEY_INTELLECTUM = "clave-falsa";

const urls = [];
globalThis.fetch = async (url) => {
  urls.push(String(url));
  const cuerpo = String(url).includes("clientes?") ? [{ id: "cli-1" }] : [];
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
};

const { abrirAlmacen: abrirRemoto } = await import("../lib/almacen.js?v=2");
await abrirRemoto().buscarLeads({ texto: "Referido" });

const consulta = decodeURIComponent(urls.find((u) => u.includes("leads?")) || "");
console.log("  " + (consulta.split("or=")[1] || "(sin or=)").slice(0, 210));
ok(consulta.includes('etiquetas.cs.["referido"]'), 'incluye etiquetas.cs.["referido"] en minúsculas');
ok(consulta.includes("nombre.ilike.*Referido*"), "conserva la búsqueda por trozo en los demás campos");
ok(!consulta.includes('etiquetas.cs.["Referido"]'), "no manda la aguja con mayúsculas");

console.log(fallos ? `\n${fallos} FALLOS\n` : "\nTodo en verde.\n");
process.exit(fallos ? 1 : 0);
