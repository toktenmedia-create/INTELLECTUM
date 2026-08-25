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
  ".webp": "image/webp",
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
    // Misma firma que usa Vercel: (req, res) de Node, sin envoltorios.
    if (!req.headers["x-forwarded-for"]) req.headers["x-forwarded-for"] = "127.0.0.1";
    await modulo.default(req, conAyudantesDeVercel(res));
  } catch (err) {
    console.error("[dev] error en la función:", err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err?.message ?? err) }));
  }
}

/**
 * Vercel le cuelga al `res` de Node unos ayudantes de estilo Express que Node
 * NO trae: res.status(), res.json(), res.send(). Sin ellos, una función escrita
 * con res.status(200).json(...) —como las dos tareas diarias— funciona en
 * producción y revienta en local, que es exactamente lo que este servidor
 * existe para evitar.
 */
function conAyudantesDeVercel(res) {
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (cuerpo) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(cuerpo));
    return res;
  };
  res.send = (cuerpo) => {
    if (typeof cuerpo === "object" && cuerpo !== null) return res.json(cuerpo);
    if (!res.headersSent) res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(String(cuerpo ?? ""));
    return res;
  };
  return res;
}

function servirArchivo(ruta, res) {
  const relativa = ruta === "/" ? "index.html" : decodeURIComponent(ruta).replace(/^\/+/, "");
  let destino = path.join(RAIZ, relativa);

  // Igual que "cleanUrls" de Vercel: /privacidad sirve privacidad.html. Sin
  // esto, en local da 404 y en producción funciona, que es la peor combinación.
  if (!path.extname(destino) && fs.existsSync(`${destino}.html`)) {
    destino = `${destino}.html`;
  }

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
