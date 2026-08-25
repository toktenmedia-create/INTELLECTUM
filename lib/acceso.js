/**
 * LA PUERTA DE LO PRIVADO.
 *
 * Cuatro endpoints se protegen con una clave compartida en la cabecera: el
 * panel, el agente privado y las dos tareas diarias. Cada uno tenía su copia
 * de esta función, palabra por palabra. Una copia de un control de acceso es
 * una copia que alguien va a mejorar en un lado y olvidar en los otros tres.
 *
 * La clave viaja SIEMPRE en la cabecera, nunca en la URL: lo que va en la URL
 * queda escrito en los registros de Vercel, en los de cualquier intermediario y
 * en el historial del navegador.
 */

/**
 * Compara en tiempo constante — recorre la clave entera aunque el primer
 * carácter ya no cuadre. Comparar con === delata, por lo que tarda en fallar,
 * cuántos caracteres iniciales se acertaron, y eso permite adivinar la clave
 * letra a letra.
 */
export function claveCorrecta(req, esperado) {
  const cabecera = req.headers?.authorization || "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
