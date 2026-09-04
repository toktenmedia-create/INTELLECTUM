/**
 * LA DEMO DE LA PORTADA.
 *
 * Conecta los cinco botones de negocio con /api/chat, que responde en
 * streaming. Todo lo que el agente sabe vive en el servidor (lib/demos.js);
 * aquí solo se dibujan burbujas.
 *
 * Tres decisiones que valen el comentario:
 *
 *   1. El historial es POR NEGOCIO y vive en memoria. Cambiar de negocio no
 *      borra lo que ya conversaste con el anterior: si alguien prueba la
 *      clínica, se pasa a la concesionaria y vuelve, encuentra su charla como
 *      la dejó. Recargar la página sí empieza de cero, y está bien: no hay
 *      nada que valga la pena guardar de una demostración.
 *
 *   2. La página funciona sin este archivo. El saludo del primer negocio y sus
 *      tres preguntas ya vienen escritos en el HTML, así que quien llegue con
 *      el JavaScript caído ve una conversación, no un cuadro vacío.
 *
 *   3. Solo hay UNA petición en vuelo. Mientras el agente escribe, el botón se
 *      apaga y cambiar de negocio aborta lo que venía: sin eso, la respuesta
 *      de la clínica terminaba de escribirse dentro del chat de la tienda.
 */
(function () {
  "use strict";

  const lista = document.querySelector(".demo-lista");
  const hilo = document.getElementById("demoHilo");
  const sugerencias = document.getElementById("demoSugerencias");
  const form = document.getElementById("demoForm");
  const entrada = document.getElementById("demoEntrada");
  const enviar = document.getElementById("demoEnviar");
  if (!lista || !hilo || !form || !entrada || !enviar) return;

  const campoAgente = document.querySelector('[data-campo="agente"]');
  const campoNegocio = document.querySelector('[data-campo="negocio"]');
  const botones = Array.from(lista.querySelectorAll(".demo-neg"));
  if (!botones.length) return;

  // Los cuatro textos que escribe el JavaScript (el resto ya está en el HTML)
  // viven en el formulario, para que el mismo archivo sirva a la página en
  // español y a la de inglés sin duplicar el guion.
  const T = {
    placeholder: form.dataset.txtPlaceholder || "Escríbele a {agente}…",
    sinConexion: form.dataset.txtSinConexion || "No se pudo conectar con el agente.",
    cortada: form.dataset.txtCortada || "Se cortó la conexión.",
    sinRespuesta: form.dataset.txtSinRespuesta || "El agente no alcanzó a responder. Inténtalo otra vez.",
  };

  // Un identificador de sesión por negocio y por carga de página: es lo que
  // usa el servidor para no contar dos veces a la misma persona.
  const sesion = Math.random().toString(36).slice(2, 12);

  /** El estado de cada negocio: su historial y si ya lo tocaron. */
  const estados = new Map();
  botones.forEach(function (b) {
    estados.set(b.dataset.demo, {
      historial: [],
      arranque: b.dataset.arranque || "",
      sugerencias: (b.dataset.sugerencias || "").split("|").filter(Boolean),
      agente: b.dataset.agente || "",
      negocio: b.dataset.negocio || "",
    });
  });

  let activo = botones.find((b) => b.getAttribute("aria-pressed") === "true") || botones[0];
  let enVuelo = null; // AbortController de la petición en curso
  let escribiendo = false;

  // ── Dibujar ────────────────────────────────────────────────────────────

  function burbuja(clase, texto) {
    const el = document.createElement("div");
    el.className = "demo-burbuja " + clase + " entrando";
    el.textContent = texto;
    hilo.appendChild(el);
    // Dos cuadros: uno para que el navegador lo pinte invisible y otro para
    // que la transición tenga de dónde salir. Con uno solo aparece de golpe.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.remove("entrando");
      });
    });
    alFinal();
    return el;
  }

  function puntos() {
    const el = document.createElement("div");
    el.className = "demo-burbuja ia";
    el.innerHTML = '<span class="demo-puntos"><i></i><i></i><i></i></span>';
    hilo.appendChild(el);
    alFinal();
    return el;
  }

  function alFinal() {
    hilo.scrollTop = hilo.scrollHeight;
  }

  function pintarSugerencias(lista) {
    sugerencias.textContent = "";
    lista.forEach(function (texto) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "demo-chip";
      chip.textContent = texto;
      chip.addEventListener("click", function () {
        preguntar(texto);
      });
      sugerencias.appendChild(chip);
    });
  }

  /** Repinta el panel entero con el estado del negocio activo. */
  function pintarNegocio(slug) {
    const est = estados.get(slug);
    if (!est) return;

    if (campoAgente) campoAgente.textContent = est.agente;
    if (campoNegocio) campoNegocio.textContent = est.negocio;

    hilo.textContent = "";
    const saludo = document.createElement("div");
    saludo.className = "demo-burbuja ia";
    saludo.textContent = est.arranque;
    hilo.appendChild(saludo);

    est.historial.forEach(function (m) {
      const el = document.createElement("div");
      el.className = "demo-burbuja " + (m.role === "user" ? "visitante" : "ia");
      el.textContent = m.content;
      hilo.appendChild(el);
    });

    // Las sugerencias solo sirven al principio: después estorban.
    pintarSugerencias(est.historial.length ? [] : est.sugerencias);
    entrada.placeholder = T.placeholder.replace("{agente}", est.agente);
    alFinal();
  }

  // ── Cambiar de negocio ─────────────────────────────────────────────────

  function activar(boton) {
    if (boton === activo) return;
    if (enVuelo) {
      enVuelo.abort();
      enVuelo = null;
    }
    escribiendo = false;
    enviar.disabled = false;

    botones.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b === boton));
    });
    activo = boton;
    pintarNegocio(boton.dataset.demo);
  }

  botones.forEach(function (b) {
    b.addEventListener("click", function () {
      activar(b);
    });
  });

  // Flechas dentro del grupo, como manda cualquier lista de opciones.
  lista.addEventListener("keydown", function (ev) {
    const i = botones.indexOf(document.activeElement);
    if (i < 0) return;
    let siguiente = null;
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") siguiente = botones[(i + 1) % botones.length];
    if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") siguiente = botones[(i - 1 + botones.length) % botones.length];
    if (!siguiente) return;
    ev.preventDefault();
    siguiente.focus();
    activar(siguiente);
  });

  // ── Conversar ──────────────────────────────────────────────────────────

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    preguntar(entrada.value);
  });

  function preguntar(texto) {
    const mensaje = String(texto || "").trim();
    if (!mensaje || escribiendo) return;

    const slug = activo.dataset.demo;
    const est = estados.get(slug);
    if (!est) return;

    entrada.value = "";
    sugerencias.textContent = "";
    escribiendo = true;
    enviar.disabled = true;

    est.historial.push({ role: "user", content: mensaje });
    burbuja("visitante", mensaje);
    const pensando = puntos();

    const control = new AbortController();
    enVuelo = control;

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: control.signal,
      body: JSON.stringify({
        demo: slug,
        sessionId: "demo-" + slug + "-" + sesion,
        messages: est.historial,
        // Para que los avisos del servidor (límites, cortes) lleguen en el
        // idioma de la página, no en el de quien la escribió.
        idioma: (document.documentElement.lang || "es").slice(0, 2),
      }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (d) {
              throw new Error(d.error || T.sinConexion);
            });
        }
        return leerStream(res, slug, pensando, est);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        pensando.remove();
        burbuja("aviso", err && err.message ? err.message : T.sinConexion);
        // El mensaje que no llegó a ninguna parte no se queda en el historial:
        // si no, el siguiente intento lo manda de nuevo y el agente contesta
        // dos veces lo mismo.
        est.historial.pop();
      })
      .finally(function () {
        if (enVuelo === control) enVuelo = null;
        escribiendo = false;
        enviar.disabled = false;
      });
  }

  /** Lee el server-sent-events y va escribiendo la respuesta. */
  function leerStream(res, slug, pensando, est) {
    const lector = res.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = "";
    let texto = "";
    let destino = null;

    function escribir(trozo) {
      texto += trozo;
      if (!destino) {
        pensando.remove();
        destino = burbuja("ia", "");
      }
      destino.textContent = texto;
      alFinal();
    }

    function leer() {
      return lector.read().then(function (r) {
        if (r.done) return cerrar();
        buffer += decodificador.decode(r.value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop();

        partes.forEach(function (parte) {
          const linea = parte.trim();
          if (!linea.startsWith("data:")) return;
          let dato;
          try {
            dato = JSON.parse(linea.slice(5).trim());
          } catch (e) {
            return;
          }
          if (dato.t === "delta" && dato.v) escribir(dato.v);
          else if (dato.t === "error") {
            pensando.remove();
            burbuja("aviso", dato.v || T.cortada);
          }
        });

        return leer();
      });
    }

    function cerrar() {
      pensando.remove();
      if (texto) est.historial.push({ role: "assistant", content: texto });
      else burbuja("aviso", T.sinRespuesta);
      alFinal();
    }

    return leer();
  }
})();
