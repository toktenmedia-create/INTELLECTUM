/**
 * TEMPORAL — sonda de diagnóstico.
 *
 * Sirve para averiguar por qué fallan las funciones en Vercel sin tener que
 * mirar los registros. No expone ningún secreto: de la API key solo informa
 * si existe o no, nunca su valor. Se borra en cuanto el chat funcione.
 */
export default async function handler(a, b) {
  const info = {
    node: process.version,
    firma: b && typeof b.end === "function" ? "Node (req, res)" : "Web (Request)",
    tiene_api_key: Boolean(process.env.ANTHROPIC_API_KEY),
    modelo: process.env.ANTHROPIC_MODEL || "(sin definir, usa el de por defecto)",
  };

  try {
    await import("@anthropic-ai/sdk");
    info.sdk_anthropic = "ok";
  } catch (err) {
    info.sdk_anthropic = "FALLA: " + String(err?.message ?? err).slice(0, 300);
  }

  try {
    const cerebro = await import("../lib/brain.js");
    info.lib_brain = "ok, modelo " + cerebro.MODELO;
  } catch (err) {
    info.lib_brain = "FALLA: " + String(err?.message ?? err).slice(0, 300);
  }

  const cuerpo = JSON.stringify(info, null, 1);

  if (b && typeof b.end === "function") {
    b.statusCode = 200;
    b.setHeader("content-type", "application/json; charset=utf-8");
    b.end(cuerpo);
    return;
  }

  return new Response(cuerpo, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
