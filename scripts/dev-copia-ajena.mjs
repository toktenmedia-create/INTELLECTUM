/**
 * EL MISMO SITIO, PERO COMO SI FUERA DE OTRO NEGOCIO.
 *
 *   node scripts/dev-copia-ajena.mjs
 *   → abre http://localhost:3200
 *
 * Levanta el servidor local con las variables de una ferretería inventada, que
 * es como se ve una copia publicada para un cliente. Sirve para mirar con los
 * ojos lo que las pruebas comprueban a ciegas: que ninguna página diga
 * "Intellectum", no reparta su correo ni su WhatsApp, y no muestre su logo.
 *
 * Se puede publicar cualquier variable de NEGOCIO_* aquí para probar otro
 * caso; sin ninguna, la copia queda "a medio configurar", que es justo el
 * escenario donde antes se colaba la identidad de casa.
 *
 * No toca nada real: mismo código, otras variables, otro puerto.
 */

const COMO_SI_FUERA = {
  PORT: "3200",
  CLIENTE_SLUG: "ferreteria-tornillo",
  NEGOCIO_NOMBRE: "Ferretería El Tornillo",
  NEGOCIO_NOMBRE_CORTO: "El Tornillo",
  NEGOCIO_AGENTE: "Tornillito",
  NEGOCIO_CORREO: "ventas@eltornillo.ec",
  NEGOCIO_WHATSAPP: "+593 99 111 2233",
  NEGOCIO_WHATSAPP_BOT: "+593 99 111 2233",
  NEGOCIO_WEB: "eltornillo.ec",
  SITIO_URL: "https://eltornillo.ec",
  NEGOCIO_CITA: "visita técnica gratuita",
  NEGOCIO_EVENTO: "visita",
  // A propósito NO se define NEGOCIO_LOGO_URL: así se ve qué pasa cuando el
  // cliente todavía no mandó su logotipo. Debe salir su nombre en texto, nunca
  // el logo de Intellectum.
};

for (const [clave, valor] of Object.entries(COMO_SI_FUERA)) {
  process.env[clave] = valor;
}

console.log(`\n  Copia de prueba: ${COMO_SI_FUERA.NEGOCIO_NOMBRE} (${COMO_SI_FUERA.CLIENTE_SLUG})`);
console.log("  Si ves la palabra Intellectum en alguna página, eso es el fallo.\n");

await import("../dev-server.mjs");
