/**
 * SERVIDOR DE PRUEBA PARA MIRAR EL PANEL con datos de mentira.
 *
 *   node scripts/dev-prueba.mjs        (clave del panel: prueba-local)
 *
 * Almacén de archivo en /tmp/intellectum, clave fija, sin base real, sin
 * correos y sin WhatsApp: nada de lo que se haga aquí toca producción.
 * Siembra unos leads y conversaciones inventados para ver el embudo y el
 * traspaso con contenido realista.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";

process.env.VERCEL = "1"; // el almacén de archivo se va a /tmp/intellectum
process.env.AGENTE_PRIVADO_TOKEN = "prueba-local";
delete process.env.SUPABASE_URL_INTELLECTUM;
delete process.env.SUPABASE_SERVICE_KEY_INTELLECTUM;
delete process.env.RESEND_API_KEY;
delete process.env.META_TOKEN;
delete process.env.GOOGLE_CALENDAR_ID;

const CARPETA = "/tmp/intellectum";
await rm(CARPETA, { recursive: true, force: true });
await mkdir(CARPETA, { recursive: true });

const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
const linea = (o) => JSON.stringify(o) + "\n";

const LEADS = [
  { id: "l1", nombre: "Carla Espinosa", empresa: "Ferretería El Tornillo", contacto: "carla@ejemplo.com", canal: "web", estado: "nuevo", urgencia: "alta", valor_estimado: 1200, temperatura: "caliente", puntaje: 82, creado_en: hace(5), actualizado_en: hace(5) },
  { id: "l2", nombre: "Marco Játiva", empresa: "Clínica Dental Sonríe", contacto: "593998877665", canal: "whatsapp", estado: "nuevo", urgencia: "media", valor_estimado: 800, temperatura: "tibio", puntaje: 55, creado_en: hace(1), actualizado_en: hace(1) },
  { id: "l3", nombre: "Andrea Solís", empresa: "Distribuidora Andes", contacto: "andrea@ejemplo.com", canal: "web", estado: "contactado", urgencia: "alta", valor_estimado: 2500, temperatura: "caliente", puntaje: 90, creado_en: hace(3), actualizado_en: hace(2) },
  { id: "l4", nombre: "Luis Cárdenas", empresa: "", contacto: "593991122334", canal: "voz", estado: "en_conversacion", urgencia: "media", valor_estimado: 600, temperatura: "tibio", puntaje: 48, creado_en: hace(7), actualizado_en: hace(1) },
  { id: "l5", nombre: "Patricia Meneses", empresa: "Hostería La Loma", contacto: "paty@ejemplo.com", canal: "whatsapp", estado: "ganado", urgencia: "baja", valor_estimado: 1500, creado_en: hace(20), actualizado_en: hace(4) },
  { id: "l6", nombre: "Jorge Iza", empresa: "Taller Iza Motors", contacto: "593987654321", canal: "web", estado: "perdido", urgencia: "baja", motivo_perdida: "Precio", creado_en: hace(25), actualizado_en: hace(9) },
];

const CONVERSACIONES = [
  {
    cliente: "intellectum", canal: "whatsapp", sesion: "593998877665",
    nombre_perfil: "Marco Játiva",
    mensajes: [
      { role: "user", content: "Hola, quiero un chatbot para mi clínica" },
      { role: "assistant", content: "¡Hola Marco! Con gusto. ¿Qué te gustaría que atienda el chatbot?" },
      { role: "user", content: "Quiero hablar con una persona por favor" },
      { role: "assistant", content: "Claro, desde ahora te atiende una persona del equipo por este mismo chat." },
    ],
    actualizado_en: hace(0.1),
  },
  {
    cliente: "intellectum", canal: "web", sesion: "web-demo-123",
    mensajes: [
      { role: "user", content: "¿Cuánto cuesta un agente de voz?" },
      { role: "assistant", content: "El valor exacto depende del caso: lo definimos en la consultoría gratuita." },
    ],
    actualizado_en: hace(0.5),
  },
];

const MODOS = [
  { cliente: "intellectum", canal: "whatsapp", sesion: "593998877665", modo: "humano", cuando: hace(0.1) },
];

// Sin el campo cliente, el almacén filtra las filas y el panel sale vacío.
LEADS.forEach((l) => { l.cliente = "intellectum"; });
await writeFile(`${CARPETA}/leads.jsonl`, LEADS.map(linea).join(""));
await writeFile(`${CARPETA}/conversaciones.jsonl`, CONVERSACIONES.map(linea).join(""));
await writeFile(`${CARPETA}/modos.jsonl`, MODOS.map(linea).join(""));
await writeFile(
  `${CARPETA}/eventos.jsonl`,
  [
    { id: "e1", cliente: "intellectum", tipo: "traspaso_humano", actor: "agente", detalle: { canal: "whatsapp", sesion: "593998877665", por: "escalar_a_humano", motivo: "pide_hablar_con_persona" }, creado_en: hace(0.1) },
    { id: "e2", cliente: "intellectum", tipo: "herramienta_ejecutada", actor: "agente", detalle: { herramienta: "guardar_lead" }, creado_en: hace(1) },
  ].map(linea).join(""),
);

console.log("[PRUEBA] datos de mentira sembrados en", CARPETA);
console.log("[PRUEBA] clave del panel: prueba-local");

await import("../dev-server.mjs");
