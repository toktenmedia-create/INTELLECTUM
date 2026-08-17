/**
 * ¿La agenda quedó bien conectada?
 *
 *   node --env-file=.env scripts/probar-agenda.mjs
 *
 * Comprueba, en orden, las cuatro cosas que pueden fallar: que estén las
 * variables, que Google acepte la firma, que los calendarios estén compartidos
 * y que salgan horas libres. No escribe nada en tu calendario.
 */

import {
  agendaConfigurada,
  horariosLibres,
  REGLAS_AGENDA,
  etiquetaHumana,
} from "../lib/calendario.js";

const paso = (texto) => console.log(`\n  ${texto}`);
const bien = (texto) => console.log(`  \x1b[32m✓\x1b[0m ${texto}`);
const mal = (texto) => console.log(`  \x1b[31m✗\x1b[0m ${texto}`);

paso("1. Variables");

const faltan = ["GOOGLE_SA_EMAIL", "GOOGLE_SA_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"].filter(
  (v) => !process.env[v],
);

if (faltan.length) {
  mal(`faltan: ${faltan.join(", ")}`);
  console.log("\n  Corre primero: node scripts/conectar-agenda.mjs <tu-archivo.json>\n");
  process.exit(1);
}

bien(`cuenta de servicio: ${process.env.GOOGLE_SA_EMAIL}`);
bien(`calendario de citas: ${process.env.GOOGLE_CALENDAR_ID}`);
bien(
  `calendarios que se miran: ${
    process.env.GOOGLE_CALENDARS_OCUPACION || "(solo el de citas — tu calendario personal NO se está mirando)"
  }`,
);

if (!agendaConfigurada()) {
  mal("agendaConfigurada() dice que no. Revisa que ninguna variable esté vacía.");
  process.exit(1);
}

paso("2. Google responde y los calendarios están compartidos");

let libres;
try {
  libres = await horariosLibres();
  bien("Google aceptó la firma y devolvió la ocupación");
} catch (err) {
  mal(String(err?.message ?? err));
  console.log(`
  Lo más probable:
    · "invalid_grant" o "Invalid JWT" → la clave privada quedó mal copiada.
      Vuelve a correr conectar-agenda.mjs con el JSON original.
    · "notFound" o "Revisa que esté compartido" → falta compartir ese
      calendario con ${process.env.GOOGLE_SA_EMAIL}, o el ID está mal escrito.
    · "Calendar API has not been used" → falta habilitar la Google Calendar API
      en el proyecto de Google Cloud.
`);
  process.exit(1);
}

paso("3. Horas libres");

if (libres.length === 0) {
  mal("no salió ninguna hora libre en los próximos días");
  console.log(
    `\n  Puede ser real (agenda llena) o que el calendario de ocupación tenga\n` +
      `  un evento de todo el día repetido. Revisa tu calendario esos días.\n`,
  );
  process.exit(1);
}

bien(`${libres.length} horas libres, de ${REGLAS_AGENDA.duracionMinutos} minutos cada una`);
for (const h of libres) console.log(`      ${h.etiqueta}`);

paso("4. Reglas activas");
console.log(`      lunes a viernes, ${REGLAS_AGENDA.aperturaHora}:00 a ${REGLAS_AGENDA.cierreHora}:00`);
console.log(`      con al menos ${REGLAS_AGENDA.anticipacionMinimaMinutos / 60} horas de anticipación`);
console.log(`      se ofrecen máximo ${REGLAS_AGENDA.maximoOpciones} opciones por vez`);

console.log(`\n  \x1b[32mLa agenda está lista.\x1b[0m No se escribió nada en tu calendario.`);
console.log(`  Siguiente: las mismas variables en Vercel y IntelliA empieza a agendar.\n`);
