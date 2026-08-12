/**
 * Servidor local para probar TODO en tu computadora antes de publicar.
 *
 *   npm install
 *   ANTHROPIC_API_KEY=sk-ant-... npm run dev
 *   → abre http://localhost:3000
 *
 * Imita lo que hace Vercel: sirve los archivos estáticos y manda /api/loquesea
 * a la función correspondiente en la carpeta api/. No se usa en producción.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT || 3000);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);

  if (url.pathname.startsWith("/api/")) {
    await atenderApi(url, req, res);
    return;
  }

  servirArchivo(url.pathname, res);
});

async function atenderApi(url, req, res) {
  const nombre = url.pathname.replace("/api/", "").replace(/\/$/, "");
  const archivo = path.join(RAIZ, "api", `${nombre}.js`);

  if (!fs.existsSync(archivo)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Función no encontrada" }));
    return;
  }

  try {
    const modulo = await import(`${archivo}?v=${Date.now()}`); // recarga en cada petición
    const peticion = await aRequest(url, req);
    const respuesta = await modulo.default(peticion);
    await aServerResponse(respuesta, res);
  } catch (err) {
    console.error("[dev] error en la función:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err?.message ?? err) }));
  }
}

async function aRequest(url, req) {
  const cabeceras = new Headers();
  for (const [clave, valor] of Object.entries(req.headers)) {
    if (typeof valor === "string") cabeceras.set(clave, valor);
  }
  if (!cabeceras.has("x-forwarded-for")) cabeceras.set("x-forwarded-for", "127.0.0.1");

  const opciones = { method: req.method, headers: cabeceras };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    opciones.body = Buffer.concat(trozos);
  }

  return new Request(url.toString(), opciones);
}

async function aServerResponse(respuesta, res) {
  const cabeceras = {};
  respuesta.headers.forEach((valor, clave) => {
    cabeceras[clave] = valor;
  });
  res.writeHead(respuesta.status, cabeceras);

  if (!respuesta.body) {
    res.end();
    return;
  }

  Readable.fromWeb(respuesta.body).pipe(res);
}

function servirArchivo(ruta, res) {
  const relativa = ruta === "/" ? "index.html" : decodeURIComponent(ruta).replace(/^\/+/, "");
  const destino = path.join(RAIZ, relativa);

  if (!destino.startsWith(RAIZ) || !fs.existsSync(destino) || fs.statSync(destino).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }

  res.writeHead(200, {
    "Content-Type": TIPOS[path.extname(destino)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(destino).pipe(res);
}

servidor.listen(PUERTO, () => {
  console.log(`\n  Intellectum en local  →  http://localhost:${PUERTO}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "  ANTHROPIC_API_KEY detectada. El chat debería responder.\n"
      : "  ⚠  Sin ANTHROPIC_API_KEY: el sitio carga, pero el chat responderá 503.\n",
  );
});
