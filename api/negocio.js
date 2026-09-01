/**
 * GET /api/negocio  →  de quién es esta copia, para que lo sepa el navegador.
 *
 * Las páginas del sitio (agenda.html, chat.html) son archivos estáticos: el
 * mismo HTML viaja idéntico a todos los despliegues, así que no tienen forma
 * de saber si están sirviendo a Intellectum o a una ferretería. Todo lo que
 * decían —el nombre de la pestaña, el logo, el correo del pie, el WhatsApp del
 * mensaje de error— estaba escrito a mano, y era el de Intellectum.
 *
 * Este endpoint es la respuesta a eso: lo único que hace es leer lib/cliente.js
 * y devolverlo. No toca la base, no llama a Anthropic, no mira la petición.
 *
 * QUÉ SALE POR AQUÍ: solo lo público —lo mismo que cualquiera puede leer en la
 * página—. Ni claves, ni datos de la base, ni nada de otros clientes. La lista
 * la fija identidadPublica() en lib/cliente.js y se mantiene corta a propósito.
 *
 * Es abierto (Access-Control-Allow-Origin: *) porque el widget de chat se
 * incrusta en el sitio del cliente, que es otro dominio, y porque no hay nada
 * aquí que valga la pena proteger: es la misma identidad que el negocio
 * publica en su web.
 */

import { identidadPublica } from "../lib/cliente.js";

export const config = { maxDuration: 10 };

export default function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cabeceras()).end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, cabeceras()).end(JSON.stringify({ error: "Método no permitido" }));
    return;
  }

  res.writeHead(200, cabeceras()).end(JSON.stringify(identidadPublica()));
}

/**
 * La respuesta es la misma durante toda la vida del despliegue: la identidad
 * viene de variables de entorno, que solo cambian volviendo a publicar. Por
 * eso se cachea un día en el CDN y así la página no espera a una función para
 * pintar su cabecera.
 *
 * En el NAVEGADOR, en cambio, max-age=0: que revalide siempre contra el CDN,
 * que le contesta al instante. Si se cacheara también ahí, un cliente que
 * corrige su WhatsApp seguiría repartiendo el viejo durante minutos en los
 * navegadores que ya lo tenían, y ese es justamente el dato que no se puede
 * dar mal. Vercel limpia el CDN en cada publicación, así que el cambio se ve
 * apenas se vuelve a publicar.
 */
function cabeceras() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  };
}
