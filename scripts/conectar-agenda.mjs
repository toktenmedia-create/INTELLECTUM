/**
 * Conecta la agenda leyendo el JSON que descargaste de Google.
 *
 *   node scripts/conectar-agenda.mjs ~/Downloads/intellectum-abc123.json
 *
 * Toma el correo y la clave privada del archivo y los escribe en .env con el
 * formato correcto. La clave NO se imprime en pantalla ni queda en el historial
 * de la terminal: la lee del archivo y la escribe directo.
 *
 * El correo de la cuenta de servicio SÍ se imprime, porque lo necesitas para
 * compartirle el calendario. Ese no es secreto: es un identificador, como una
 * dirección de correo cualquiera.
 */

import fs from "node:fs";
import path from "node:path";

const archivo = process.argv[2];

if (!archivo) {
  console.error("\n  Falta el archivo. Uso:\n");
  console.error("    node scripts/conectar-agenda.mjs ~/Downloads/tu-archivo.json\n");
  process.exit(1);
}

const ruta = archivo.replace(/^~/, process.env.HOME ?? "");

if (!fs.existsSync(ruta)) {
  console.error(`\n  No encuentro el archivo: ${ruta}\n`);
  process.exit(1);
}

let credencial;
try {
  credencial = JSON.parse(fs.readFileSync(ruta, "utf8"));
} catch {
  console.error("\n  Ese archivo no es un JSON válido. ¿Es el que descargaste de Google?\n");
  process.exit(1);
}

if (credencial.type !== "service_account" || !credencial.client_email || !credencial.private_key) {
  console.error(
    "\n  Ese JSON no es de una cuenta de servicio.\n" +
      "  Tiene que ser el que se descarga en: Credenciales → tu cuenta de servicio →\n" +
      "  Claves → Agregar clave → Crear nueva clave → JSON.\n",
  );
  process.exit(1);
}

// Los saltos de línea se escapan para que sobrevivan dentro de una variable.
const clave = credencial.private_key.replace(/\n/g, "\\n");

const ENV = path.join(process.cwd(), ".env");
let contenido = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";

function poner(nombre, valor) {
  const linea = `${nombre}=${valor}`;
  const patron = new RegExp(`^${nombre}=.*$`, "m");
  if (patron.test(contenido)) {
    contenido = contenido.replace(patron, linea);
    return "actualizada";
  }
  contenido = contenido.replace(/\n*$/, "\n") + linea + "\n";
  return "agregada";
}

const r1 = poner("GOOGLE_SA_EMAIL", credencial.client_email);
const r2 = poner("GOOGLE_SA_PRIVATE_KEY", `"${clave}"`);

fs.writeFileSync(ENV, contenido, { mode: 0o600 });

console.log(`\n  ✓ GOOGLE_SA_EMAIL ${r1}`);
console.log(`  ✓ GOOGLE_SA_PRIVATE_KEY ${r2} (${credencial.private_key.length} caracteres, sin imprimir)`);
console.log(`\n  Comparte tus calendarios con este correo:\n`);
console.log(`      ${credencial.client_email}\n`);
console.log(`  Falta definir a mano en .env:`);
console.log(`      GOOGLE_CALENDAR_ID          → el calendario donde se escriben las citas`);
console.log(`      GOOGLE_CALENDARS_OCUPACION  → los que hay que mirar para no pisar nada\n`);
console.log(`  Después: node scripts/probar-agenda.mjs\n`);
console.log(`  Cuando funcione en local, las mismas cuatro variables van a Vercel.`);
console.log(`  \x1b[2mBorra el JSON descargado cuando termines: ya no hace falta.\x1b[0m\n`);
