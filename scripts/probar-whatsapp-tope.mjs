/**
 * PRUEBA OFFLINE — el freno del bolsillo y la ráfaga juntada.
 *
 * Desde el 1 de octubre de 2026 Meta cobra por mensaje cada respuesta del
 * asistente. Estas dos piezas son las que evitan que eso se desborde:
 *
 *   - agruparRafagas + juntarEntradas: tres mensajes seguidos de la misma
 *     persona se contestan UNA vez, no tres.
 *   - revisarCupo: nadie —ni una persona sola, ni el despliegue entero—
 *     puede gastar sin techo.
 *
 * Sin red y sin base: los topes se bajan por variable de entorno antes de
 * importar el módulo, porque se leen una sola vez al cargarlo.
 *
 *   node scripts/probar-whatsapp-tope.mjs
 */
process.env.VERCEL = "1";
process.env.WHATSAPP_TOPE_PERSONA = "3";
process.env.WHATSAPP_TOPE_DIARIO = "10";
process.env.META_VERIFY_TOKEN = "x";
process.env.META_APP_SECRET = "x";
process.env.META_TOKEN = "x";
process.env.META_PHONE_NUMBER_ID = "111";
// Que ningún aviso pueda salir de verdad desde esta prueba.
process.env.EQUIPO_WHATSAPP = "";
for (const v of ["RESEND_API_KEY", "LEADS_EMAIL", "LEADS_WEBHOOK_URL", "OPERADOR_WEBHOOK_URL", "OPERADOR_EMAIL"]) {
  delete process.env[v];
}

const { agruparRafagas, juntarEntradas, revisarCupo, avisarManosHumanas } = await import(
  "../api/whatsapp.js"
);
const { CLIENTE } = await import("../lib/cliente.js");

let fallos = 0;
function prueba(nombre, condicion) {
  console.log(`  ${condicion ? "ok  " : "FALLO"} ${nombre}`);
  if (!condicion) fallos++;
}

const paquete = (from, id, phone = "111") => ({
  valor: { metadata: { phone_number_id: phone } },
  mensaje: { from, id, type: "text", text: { body: id } },
});

console.log("\nLa ráfaga se agrupa:");

{
  const g = agruparRafagas([paquete("593A", "m1"), paquete("593A", "m2"), paquete("593A", "m3")]);
  prueba("tres mensajes seguidos de la misma persona son UN grupo", g.length === 1 && g[0].mensajes.length === 3);
  prueba("y conservan su orden", g[0].mensajes.map((m) => m.id).join() === "m1,m2,m3");
}

{
  // Dos personas mezcladas en el mismo lote. NO se junta la A con la A que
  // viene después de la B: reordenar el lote cambiaría el orden en que se
  // atiende a la gente, que es peor que pagar un mensaje de más.
  const g = agruparRafagas([paquete("593A", "m1"), paquete("593B", "m2"), paquete("593A", "m3")]);
  prueba("dos personas intercaladas no se mezclan", g.length === 3);
  prueba("y cada grupo es de quien es", g.map((x) => x.mensajes[0].from).join() === "593A,593B,593A");
}

{
  const g = agruparRafagas([paquete("593A", "m1", "111"), paquete("593A", "m2", "222")]);
  prueba("la misma persona por dos números NUESTROS no se junta", g.length === 2);
}

prueba("un lote vacío no produce grupos", agruparRafagas([]).length === 0);

{
  // Los adjuntos se descargan y viajan enteros al modelo; una ráfaga de veinte
  // fotos en una sola vuelta puede reventar por tiempo o memoria y perderse
  // entera. Se parte cada cuatro adjuntos. Los textos no cuentan.
  const foto = (id) => ({
    valor: { metadata: { phone_number_id: "111" } },
    mensaje: { from: "593A", id, type: "image", image: { id } },
  });
  const g = agruparRafagas(Array.from({ length: 10 }, (_, i) => foto(`f${i}`)));
  prueba("diez fotos seguidas se parten en tres vueltas", g.length === 3);
  prueba("de cuatro, cuatro y dos", g.map((x) => x.mensajes.length).join() === "4,4,2");
  prueba("y en orden", g.flatMap((x) => x.mensajes.map((m) => m.id)).join() === Array.from({ length: 10 }, (_, i) => `f${i}`).join());

  const mezcla = [paquete("593A", "t1"), foto("f1"), paquete("593A", "t2"), foto("f2"), foto("f3"), foto("f4"), paquete("593A", "t3"), foto("f5")];
  const m = agruparRafagas(mezcla);
  prueba("los textos no cuentan para el tope de adjuntos", m.length === 2 && m[0].mensajes.length === 7);
  prueba("el quinto adjunto abre otra vuelta", m[1].mensajes.length === 1 && m[1].mensajes[0].id === "f5");

  const animado = { valor: { metadata: { phone_number_id: "111" } }, mensaje: { from: "593A", id: "s", type: "sticker", sticker: { animated: true } } };
  const s = agruparRafagas([foto("f1"), foto("f2"), foto("f3"), foto("f4"), animado]);
  prueba("un sticker animado no se descarga y no cuenta", s.length === 1);
}

console.log("\nLa ráfaga se convierte en una sola entrada:");

{
  const sola = { bloques: "hola", memoria: "hola" };
  prueba("una sola entrada se devuelve tal cual", juntarEntradas([sola]) === sola);
}

{
  const e = juntarEntradas([
    { bloques: "hola", memoria: "hola" },
    { bloques: "buenas", memoria: "buenas" },
    { bloques: "quiero info", memoria: "quiero info" },
  ]);
  prueba("tres textos quedan en UN texto", e.bloques === "hola\nbuenas\nquiero info");
  prueba("y la memoria guarda los tres", e.memoria === "hola\nbuenas\nquiero info");
  prueba("el texto junto no es una lista de bloques", typeof e.bloques === "string");
}

{
  const foto = {
    bloques: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
      { type: "text", text: "mira esto" },
    ],
    memoria: "[Envió una foto] mira esto",
  };
  const e = juntarEntradas([{ bloques: "hola", memoria: "hola" }, foto]);
  prueba("texto + foto produce lista de bloques", Array.isArray(e.bloques));
  prueba("con la foto adentro y en su sitio", e.bloques.length === 3 && e.bloques[1].type === "image");
  prueba("el texto de antes va primero", e.bloques[0].type === "text" && e.bloques[0].text === "hola");
  // La memoria es lo que se guarda y se vuelve a mandar al modelo en cada
  // vuelta siguiente. Si la foto entrara aquí, se pagaría una y otra vez.
  prueba("la memoria nunca se lleva la foto", typeof e.memoria === "string" && !e.memoria.includes("AAA"));
}


console.log("\nEl freno del bolsillo:");

/*
 * El almacén de mentira filtra IGUAL que el de verdad (lib/almacen.js →
 * contarEventos): por cliente, por tipo, por ventana y por sesión.
 *
 * La versión anterior de estas pruebas solo miraba la sesión y devolvía un
 * número fijo. Con esa, revisarCupo podía contar el tipo de evento equivocado,
 * olvidarse de la ventana de 24 horas o sumar el tráfico de otro cliente, y
 * todo seguía en verde. Un doble que no distingue no prueba nada.
 */
const almacenDe = (eventos) => ({
  // Ojo con el valor por defecto de `cliente`: el almacén real cae en CLIENTE
  // cuando no se lo pasan, y las pruebas usan "casa", que NO es CLIENTE. Así,
  // si revisarCupo se olvidara de pasar el cliente, contaría en el sitio
  // equivocado y no encontraría nada. Con "casa" de defecto ese olvido pasaba
  // inadvertido.
  async contarEventos({ cliente = CLIENTE, tipo, desde, sesion, tope = 1000 } = {}) {
    let n = 0;
    for (const e of eventos) {
      if (e.cliente !== cliente || e.tipo !== tipo) continue;
      if (desde && !(e.creado_en >= desde)) continue;
      if (sesion && e.detalle?.sesion !== sesion) continue;
      if (++n >= tope) break;
    }
    return n;
  },
});

const HORA = 60 * 60 * 1000;
/** Una entrega anotada como la anota lib/mensajeria.js, con la edad que se le pida. */
const entrega = (sesion, { hace = 0, tipo = "mensaje_entregado", cliente = "casa" } = {}) => ({
  cliente,
  tipo,
  creado_en: new Date(Date.now() - hace).toISOString(),
  detalle: { canal: "whatsapp", sesion },
});
const repetir = (n, hacer) => Array.from({ length: n }, (_, i) => hacer(i));

const cupo = (eventos, numero = "593987654321") =>
  revisarCupo({ almacen: almacenDe(eventos), cliente: "casa", numero });

{
  prueba("sin tráfico se atiende", (await cupo([])) === null);
  prueba(
    "justo por debajo de los dos topes se atiende",
    (await cupo(repetir(2, () => entrega("593987654321")))) === null,
  );
}

{
  const r = await cupo(repetir(3, () => entrega("593987654321")));
  prueba("en el tope de la persona se corta", r?.motivo === "persona");
  prueba("y dice cuántos llevaba", r?.entregados === 3);
}

{
  const r = await cupo(repetir(10, (i) => entrega(`5939${i}`)));
  prueba("el tope del día corta aunque nadie solo se haya pasado", r?.motivo === "dia");
}

{
  // Diez de la MISMA persona: se pasa de los dos topes a la vez. Manda el del
  // día, porque el del día no le manda mensaje a nadie.
  const r = await cupo(repetir(10, () => entrega("593987654321")));
  prueba("el tope del día manda sobre el de la persona", r?.motivo === "dia");
}

console.log("\nY cuenta lo que tiene que contar (y solo eso):");

{
  // Cada una de estas cuatro mata una mutación distinta de revisarCupo: quitar
  // la ventana, quitar la sesión, quitar el cliente, cambiar el tipo.
  prueba(
    "lo entregado hace más de 24 h ya no cuenta",
    (await cupo(repetir(9, () => entrega("593987654321", { hace: 25 * HORA })))) === null,
  );
  prueba(
    "lo entregado a OTRA persona no llena el cupo de esta",
    (await cupo(repetir(5, () => entrega("593000000000")))) === null,
  );
  prueba(
    "el tráfico de otro cliente no llena el cupo de este",
    (await cupo(repetir(9, () => entrega("593987654321", { cliente: "ajeno" })))) === null,
  );
  prueba(
    "los eventos que no son entregas no llenan el cupo",
    (await cupo(repetir(9, () => entrega("593987654321", { tipo: "conversacion" })))) === null,
  );
}

{
  // El que ANOTA la entrega guarda el número normalizado; el que CUENTA tiene
  // que buscar por el mismo. Si revisarCupo contara por el número crudo, aquí
  // no encontraría nada y el tope no frenaría a nadie.
  const r = await cupo(repetir(3, () => entrega("593987654321")), "+593 98 765 4321");
  prueba("cuenta por el número normalizado, no por el crudo", r?.motivo === "persona");
}

{
  // Si Supabase no contesta no se puede contar. Se atiende igual: callar al
  // asistente durante una caída cuesta más que los mensajes que se escapen.
  const roto = {
    async contarEventos() {
      throw new Error("base caída");
    },
  };
  const r = await revisarCupo({ almacen: roto, cliente: "casa", numero: "593987654321" });
  prueba("con la base caída se atiende en vez de callar", r === null);
}

console.log("\nEl tope se ajusta por variable de entorno:");

{
  /*
   * Los topes se leen UNA vez, al cargar el módulo, así que cambiarlos aquí no
   * haría nada: hay que arrancar un proceso limpio por cada valor.
   *
   * Aquí antes había un grep sobre el texto fuente que comprobaba que los
   * nombres de las variables APARECÍAN en el archivo. Eso habría pasado en
   * verde aunque el valor leído no llegara a ninguna parte. Esto sí falla si
   * el tope deja de moverse.
   */
  const { execFileSync } = await import("node:child_process");
  const modulo = new URL("../api/whatsapp.js", import.meta.url).href;
  const guion = `
    const { revisarCupo } = await import(${JSON.stringify(modulo)});
    const almacen = { async contarEventos({ sesion }) { return sesion ? 1 : 0; } };
    process.stdout.write(
      JSON.stringify(await revisarCupo({ almacen, cliente: "casa", numero: "593987654321" })),
    );
  `;
  const conTope = (tope) =>
    JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", guion], {
        env: { ...process.env, WHATSAPP_TOPE_PERSONA: tope },
        encoding: "utf8",
      }),
    );

  prueba("con el tope en 1, una sola entrega ya corta", conTope("1")?.motivo === "persona");
  prueba("con el tope en 9, esa misma entrega pasa", conTope("9") === null);
}

console.log("\nEn manos humanas, un aviso por hora y no más:");

{
  /*
   * Con la conversación en manos humanas el bot no responde, así que el freno
   * del bolsillo no la mira. Lo que sí sale —y se paga— es el aviso al equipo
   * por WhatsApp. Decisión del 3 sep 2026: uno por hora por persona, y el
   * marcador en la bitácora, no en la memoria de una instancia.
   *
   * Aquí ningún aviso puede salir de verdad (sin EQUIPO_WHATSAPP, sin correo,
   * sin webhook), y al no poder deja un evento aviso_fallido. Ese evento es
   * el rastro de que "intentó avisar": si no está, es que se calló.
   */
  const almacenVivo = (eventos) => ({
    ...almacenDe(eventos),
    async registrarEvento({ tipo, cliente = CLIENTE, detalle }) {
      eventos.push({ cliente, tipo, creado_en: new Date().toISOString(), detalle });
    },
  });
  const marcas = (eventos, tipo, sesion) =>
    eventos.filter((e) => e.tipo === tipo && e.detalle?.sesion === sesion).length;
  const aviso = (almacen, numero) =>
    avisarManosHumanas({
      numero,
      nombrePerfil: "Ana",
      texto: "¿me atiende alguien?",
      bitacora: null,
      almacen,
      cliente: "casa",
    });

  const eventos = [];
  const almacen = almacenVivo(eventos);

  await aviso(almacen, "593111");
  prueba("la primera vez intenta avisar", marcas(eventos, "aviso_fallido", "593111") === 1);
  prueba("y deja el marcador durable", marcas(eventos, "aviso_manos", "593111") === 1);
  prueba(
    "el marcador es del cliente de la copia",
    eventos.find((e) => e.tipo === "aviso_manos")?.cliente === "casa",
  );

  await aviso(almacen, "593111");
  prueba("la segunda vez en la misma hora, silencio", marcas(eventos, "aviso_fallido", "593111") === 1);
  prueba("y no apila marcadores", marcas(eventos, "aviso_manos", "593111") === 1);

  await aviso(almacen, "593222");
  prueba("otra persona tiene su propio aviso", marcas(eventos, "aviso_fallido", "593222") === 1);

  eventos.push(entrega("593333", { hace: 61 * 60 * 1000, tipo: "aviso_manos" }));
  await aviso(almacen, "593333");
  prueba("pasada la hora, vuelve a avisar", marcas(eventos, "aviso_fallido", "593333") === 1);

  eventos.push(entrega("593444", { hace: 59 * 60 * 1000, tipo: "aviso_manos" }));
  await aviso(almacen, "593444");
  prueba("a los 59 minutos todavía no", marcas(eventos, "aviso_fallido", "593444") === 0);

  eventos.push(entrega("593555", { tipo: "aviso_manos", cliente: "otro" }));
  await aviso(almacen, "593555");
  prueba("el marcador de OTRO cliente no cuenta", marcas(eventos, "aviso_fallido", "593555") === 1);

  eventos.push(entrega("593777", { tipo: "mensaje_entregado" }));
  await aviso(almacen, "593777");
  prueba("una entrega normal no es un marcador de aviso", marcas(eventos, "aviso_fallido", "593777") === 1);

  // Sin bitácora, el respaldo por instancia: avisa una vez y luego frena.
  const sinBase = [];
  const roto = { ...almacenVivo(sinBase), async contarEventos() { throw new Error("sin base"); } };
  await aviso(roto, "593666");
  prueba("sin bitácora, igual avisa la primera vez", marcas(sinBase, "aviso_fallido", "593666") === 1);
  await aviso(roto, "593666");
  prueba("y la instancia frena la repetición", marcas(sinBase, "aviso_fallido", "593666") === 1);
}

console.log(fallos === 0 ? "\nTodo en verde.\n" : `\n${fallos} prueba(s) fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
