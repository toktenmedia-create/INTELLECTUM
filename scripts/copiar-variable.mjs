/**
 * Copia una variable de .env al portapapeles, lista para pegar en Vercel.
 *
 *   node scripts/copiar-variable.mjs GOOGLE_SA_PRIVATE_KEY
 *
 * Le quita las comillas que .env necesita y Vercel no: si se pegan, la clave
 * deja de ser válida y el error solo aparece al fallar la primera cita —
 * porque Vercel marca la variable como secreta y ya no te la deja releer.
 *
 * No imprime el valor. Solo confirma qué copió y cuánto mide.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const nombre = process.argv[2];

if (!nombre) {
  console.error("\n  Falta el nombre. Uso:\n");
  console.error("    node scripts/copiar-variable.mjs GOOGLE_SA_PRIVATE_KEY\n");
  process.exit(1);
}

const ENV = path.join(process.cwd(), ".env");

if (!fs.existsSync(ENV)) {
  console.error(`\n  No encuentro .env en ${process.cwd()}\n`);
  process.exit(1);
}

const linea = fs
  .readFileSync(ENV, "utf8")
  .split("\n")
  .find((l) => l.startsWith(`${nombre}=`));

if (!linea) {
  const disponibles = fs
    .readFileSync(ENV, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => "    " + l.split("=")[0]);
  console.error(`\n  No existe ${nombre} en .env. Las que hay:\n`);
  console.error(disponibles.join("\n") + "\n");
  process.exit(1);
}

let valor = linea.slice(nombre.length + 1).trim();

// Las comillas envuelven el valor en .env, pero en Vercel se pega el contenido.
if (
  (valor.startsWith('"') && valor.endsWith('"')) ||
  (valor.startsWith("'") && valor.endsWith("'"))
) {
  valor = valor.slice(1, -1);
}

execFileSync("pbcopy", { input: valor });

// De un secreto no se muestra ningún trozo. La única excepción es la cabecera
// de una clave PEM, que es idéntica en todas las claves del mundo y por eso no
// revela nada, pero sí confirma de un vistazo que se copió lo correcto.
const secreta = /KEY|TOKEN|SECRET|PASSWORD/i.test(nombre);
const pem = valor.startsWith("-----BEGIN");
const pista = !secreta ? valor : pem ? "-----BEGIN…  (una clave PEM)" : "(oculto)";

console.log(`\n  ✓ ${nombre} copiada al portapapeles`);
console.log(`    ${valor.length} caracteres · ${pista}`);
console.log(`\n  Pégala en Vercel con ⌘V. No pasó por la pantalla ni por el chat.\n`);
