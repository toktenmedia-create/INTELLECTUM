/**
 * La burbuja de chat, para incrustar en el sitio de cualquier cliente.
 *
 * Se inserta sola:
 *     <script defer src="/chat-widget.js"></script>
 *
 * QUIÉN ES EL NEGOCIO. Este archivo viaja al sitio de otra empresa, así que no
 * puede leer variables de entorno ni preguntarle nada al servidor de nadie: la
 * identidad se la dice la propia etiqueta <script> que lo carga.
 *
 *     <script defer src="/chat-widget.js"
 *             data-agente="Tornillito"
 *             data-negocio="Ferretería El Tornillo"
 *             data-whatsapp="+593 99 111 2233"
 *             data-correo="ventas@eltornillo.ec"
 *             data-saludo="Hola 👋 ¿Qué herramienta andas buscando?"></script>
 *
 * SIN NINGÚN data-*, el widget no dice ningún nombre y NO reparte ningún dato
 * de contacto. Es la misma regla del backend (lib/cliente.js): antes que dar
 * el correo y el WhatsApp de otra empresa, no dar ninguno. Antes decía aquí
 * mismo "Soy IntelliA, el asistente de Intellectum" y, cuando se caía la
 * conexión, entregaba el WhatsApp de Intellectum al cliente de quien lo
 * hubiera incrustado.
 *
 * No trae librerías ni dependencias. Usa las mismas variables de color y las
 * mismas tipografías que ya define el sitio (--accent, --bg, --font-display).
 * Los valores de respaldo son NEUTROS a propósito: eran el cian y la serif de
 * marca de Intellectum, así que un sitio que no declarara esas variables se
 * pintaba con los colores de otra empresa.
 */
(function () {
  "use strict";

  var MAX_HISTORIAL = 30;

  // La etiqueta que cargó este archivo. document.currentScript funciona con
  // defer y es la forma barata de encontrarla; el respaldo cubre navegadores
  // viejos y el caso de que alguien lo inyecte a mano.
  var GUION =
    document.currentScript ||
    (function () {
      var todos = document.querySelectorAll('script[src*="chat-widget"]');
      return todos.length ? todos[todos.length - 1] : null;
    })();

  function ajuste(nombre) {
    var valor = GUION && GUION.getAttribute ? GUION.getAttribute("data-" + nombre) : null;
    return valor ? String(valor).trim() : "";
  }

  // DE DÓNDE VINO ESTE ARCHIVO. El chat habla con el servidor de la copia que
  // lo sirvió, no con el del sitio donde está incrustado: si la ferretería
  // pega la etiqueta en su propio dominio, "/api/chat" apuntaría a un
  // endpoint que en su sitio no existe. Se toma el origen de la propia
  // etiqueta <script>, y solo si no se puede saber se cae al mismo sitio.
  var ORIGEN_GUION = (function () {
    try {
      return GUION && GUION.src ? new URL(GUION.src, window.location.href).origin : "";
    } catch (e) {
      return "";
    }
  })();
  var ENDPOINT = ORIGEN_GUION + "/api/chat";

  // El aviso de privacidad es del negocio dueño del chat, no del sitio que lo
  // incrusta. Se declara con data-privacidad; si no viene y el archivo se sirve
  // desde el mismo sitio (la copia de casa), se enlaza el /privacidad de ahí.
  // Incrustado en otro dominio sin declararlo, no se enlaza nada: un aviso que
  // nombra a otra empresa como responsable es peor que ningún enlace.
  var PRIVACIDAD =
    ajuste("privacidad") ||
    (!ORIGEN_GUION || ORIGEN_GUION === window.location.origin ? "/privacidad" : "");

  var AGENTE = ajuste("agente");
  var NEGOCIO = ajuste("negocio");
  var WHATSAPP = ajuste("whatsapp");
  var CORREO = ajuste("correo");

  var SALUDO = ajuste("saludo") || saludoPorDefecto();

  function saludoPorDefecto() {
    if (AGENTE && NEGOCIO) return "Hola 👋 Soy " + AGENTE + ", el asistente de " + NEGOCIO + ". ¿En qué te ayudo?";
    if (AGENTE) return "Hola 👋 Soy " + AGENTE + ". ¿En qué te ayudo?";
    return "Hola 👋 ¿En qué puedo ayudarte hoy?";
  }

  /** El texto que se le añade a un error para ofrecer otra vía. Puede ser "". */
  function colaDeContacto() {
    var vias = [];
    if (WHATSAPP) vias.push("al WhatsApp " + WHATSAPP);
    if (CORREO) vias.push("a " + CORREO);
    if (!vias.length) return "";
    return "\n\nSi es urgente, escríbenos " + vias.join(" o ") + ".";
  }

  // Estos valores los escribe quien incrusta el widget, y se meten en innerHTML
  // al armar la cabecera y el lanzador: se escapan para que un nombre con < o &
  // no pueda inyectar etiquetas en la página que lo hospeda.
  function escaparHtml(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var historial = [];
  var enviando = false;
  var abierto = false;
  var sesion = obtenerSesion();

  var yaInicio = false;

  function iniciar() {
    if (yaInicio) return;
    yaInicio = true;
    inyectarEstilos();
    construirDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  /* ---------------------------------------------------------------- estilos */

  function inyectarEstilos() {
    var css = `
.iachat-launcher{position:fixed;right:20px;bottom:20px;z-index:9998;display:inline-flex;align-items:center;gap:10px;
  padding:13px 20px;border:1px solid var(--accent-tint-border,rgba(37,99,235,.22));border-radius:999px;
  background:var(--bg-elev,#111);color:var(--text,#fafaf7);font:500 14px/1 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);
  cursor:pointer;box-shadow:0 10px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.03);
  transition:transform .25s var(--ease,cubic-bezier(.22,1,.36,1)),border-color .25s,opacity .2s}
.iachat-launcher:hover{transform:translateY(-2px);border-color:var(--accent,#2563eb)}
.iachat-launcher:focus-visible{outline:2px solid var(--accent,#2563eb);outline-offset:3px}
.iachat-launcher .iachat-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#2563eb);
  box-shadow:0 0 10px var(--accent,#2563eb);flex:none}
.iachat-launcher[hidden]{display:none}

.iachat-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:390px;max-width:calc(100vw - 32px);
  height:min(600px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;
  background:var(--bg-elev,#111);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:var(--radius-lg,22px);
  box-shadow:0 24px 80px rgba(0,0,0,.65);opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;
  transition:opacity .28s var(--ease-out,cubic-bezier(.16,1,.3,1)),transform .28s var(--ease-out,cubic-bezier(.16,1,.3,1))}
.iachat-panel.abierto{opacity:1;transform:none;pointer-events:auto}

.iachat-head{display:flex;align-items:center;gap:12px;padding:16px 16px 14px;
  border-bottom:1px solid var(--border,rgba(255,255,255,.08));background:rgba(255,255,255,.02)}
.iachat-mark{font-size:13px;color:var(--accent,#2563eb);line-height:1}
.iachat-title{font:400 19px/1.15 var(--font-display,Georgia,serif);color:var(--text,#fafaf7);margin:0}
.iachat-sub{font:400 11px/1.3 var(--font-sans,system-ui,sans-serif);color:var(--text-muted,#6e6e66);
  letter-spacing:.06em;text-transform:uppercase;margin:3px 0 0}
.iachat-close{margin-left:auto;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;
  border:1px solid transparent;background:none;color:var(--text-dim,#a8a89e);font-size:18px;cursor:pointer;line-height:1}
.iachat-close:hover{background:rgba(255,255,255,.05);color:var(--text,#fafaf7)}
.iachat-close:focus-visible{outline:2px solid var(--accent,#2563eb);outline-offset:2px}

.iachat-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px 16px;display:flex;flex-direction:column;gap:12px;
  font:400 14.5px/1.55 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif)}
.iachat-msg{max-width:86%;padding:11px 14px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.iachat-msg.bot{align-self:flex-start;background:var(--bg-card,rgba(255,255,255,.025));
  border:1px solid var(--border,rgba(255,255,255,.08));color:var(--text,#fafaf7);border-bottom-left-radius:5px}
.iachat-msg.yo{align-self:flex-end;background:var(--accent-tint-bg,rgba(37,99,235,.08));
  border:1px solid var(--accent-tint-border,rgba(37,99,235,.22));color:var(--text,#fafaf7);border-bottom-right-radius:5px}
.iachat-msg.aviso{align-self:center;max-width:100%;text-align:center;background:none;border:none;padding:2px 0;
  color:var(--text-muted,#6e6e66);font-size:12.5px}
.iachat-msg a{color:var(--accent,#2563eb)}

.iachat-puntos{display:inline-flex;gap:4px;align-items:center;height:10px}
.iachat-puntos i{width:5px;height:5px;border-radius:50%;background:var(--text-muted,#6e6e66);animation:iachatPulso 1.3s infinite}
.iachat-puntos i:nth-child(2){animation-delay:.18s}
.iachat-puntos i:nth-child(3){animation-delay:.36s}
@keyframes iachatPulso{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}

.iachat-pie{border-top:1px solid var(--border,rgba(255,255,255,.08));padding:12px 12px 10px;background:rgba(255,255,255,.02)}
.iachat-fila{display:flex;gap:8px;align-items:flex-end}
.iachat-input{flex:1;resize:none;max-height:120px;padding:11px 13px;border-radius:12px;
  border:1px solid var(--border,rgba(255,255,255,.08));background:var(--bg,#0a0a0a);color:var(--text,#fafaf7);
  font:400 14.5px/1.45 var(--font-sans,system-ui,sans-serif)}
.iachat-input::placeholder{color:var(--text-muted,#6e6e66)}
.iachat-input:focus{outline:none;border-color:var(--accent,#2563eb)}
.iachat-send{flex:none;width:42px;height:42px;border-radius:12px;border:1px solid var(--accent,#2563eb);
  background:var(--accent,#2563eb);color:#fff;font-size:17px;cursor:pointer;display:grid;place-items:center;line-height:1}
.iachat-send:disabled{opacity:.4;cursor:default}
.iachat-send:focus-visible{outline:2px solid var(--accent-bright,#60a5fa);outline-offset:2px}
.iachat-legal{margin:8px 2px 0;font:400 10.5px/1.4 var(--font-sans,system-ui,sans-serif);color:var(--text-muted,#6e6e66);text-align:center}
.iachat-legal a{color:var(--text-dim,#a8a89e);text-decoration:underline;text-underline-offset:2px}
.iachat-legal a:hover{color:var(--accent,#2563eb)}

@media (max-width:520px){
  .iachat-panel{right:10px;left:10px;bottom:10px;width:auto;max-width:none;height:min(78vh,calc(100vh - 20px))}
  .iachat-launcher{right:14px;bottom:14px;padding:12px 16px;font-size:13.5px}
}
@media (prefers-reduced-motion:reduce){
  .iachat-panel,.iachat-launcher{transition:none}
  .iachat-puntos i{animation:none;opacity:.6}
}`;
    var etiqueta = document.createElement("style");
    etiqueta.textContent = css;
    document.head.appendChild(etiqueta);
  }

  /* -------------------------------------------------------------------- dom */

  var launcher, panel, log, input, botonEnviar;

  function construirDom() {
    launcher = document.createElement("button");
    launcher.className = "iachat-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", AGENTE ? "Abrir el chat con " + AGENTE : "Abrir el chat de atención");
    launcher.innerHTML =
      '<span class="iachat-dot"></span><span>' + escaparHtml(AGENTE ? "Habla con " + AGENTE : "¿Te ayudamos?") + "</span>";
    launcher.addEventListener("click", abrir);

    panel = document.createElement("section");
    panel.className = "iachat-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute(
      "aria-label",
      AGENTE && NEGOCIO ? "Chat con " + AGENTE + ", asistente de " + NEGOCIO : "Chat de atención",
    );
    panel.innerHTML =
      '<header class="iachat-head">' +
      '<span class="iachat-mark" aria-hidden="true">◆</span>' +
      "<div><p class=\"iachat-title\">" +
      escaparHtml(AGENTE || NEGOCIO || "Chat") +
      "</p>" +
      (AGENTE && NEGOCIO ? '<p class="iachat-sub">Asistente de ' + escaparHtml(NEGOCIO) + "</p>" : "") +
      "</div>" +
      '<button class="iachat-close" type="button" aria-label="Cerrar el chat">✕</button>' +
      "</header>" +
      '<div class="iachat-log" role="log" aria-live="polite" aria-atomic="false"></div>' +
      '<footer class="iachat-pie">' +
      '<div class="iachat-fila">' +
      '<textarea class="iachat-input" rows="1" placeholder="Escribe tu mensaje…" aria-label="Tu mensaje"></textarea>' +
      '<button class="iachat-send" type="button" aria-label="Enviar mensaje">↑</button>' +
      "</div>" +
      '<p class="iachat-legal">Asistente con IA. Puede equivocarse: los datos definitivos los confirma el equipo.' +
      (PRIVACIDAD
        ? '<br><a href="' + escaparHtml(PRIVACIDAD) + '" target="_blank" rel="noopener">Aviso de privacidad</a>'
        : "") +
      "</p>" +
      "</footer>";

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    log = panel.querySelector(".iachat-log");
    input = panel.querySelector(".iachat-input");
    botonEnviar = panel.querySelector(".iachat-send");

    panel.querySelector(".iachat-close").addEventListener("click", cerrar);
    botonEnviar.addEventListener("click", enviar);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviar();
      }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && abierto) cerrar();
    });

    // Cualquier enlace del sitio con href="#chat" abre el asistente.
    document.addEventListener("click", function (e) {
      var enlace = e.target.closest ? e.target.closest('a[href="#chat"]') : null;
      if (enlace) {
        e.preventDefault();
        abrir();
      }
    });
  }

  var saludoPintado = false;

  var anotadaLaApertura = false;

  function abrir() {
    if (abierto) return;
    abierto = true;
    // Abrir el chat es el primer gesto de intención real de un visitante, y por
    // eso se anota. UNA sola vez por visita: abrir y cerrar tres veces no son
    // tres intenciones, y contarlas así le enseñaría a la pauta a buscar gente
    // indecisa. Si el visitante no dio permiso para medir, medir() no existe.
    if (!anotadaLaApertura) {
      anotadaLaApertura = true;
      if (window.medir) window.medir("Contact", { canal: "chat_web" });
    }
    panel.classList.add("abierto");
    launcher.hidden = true;
    if (!saludoPintado) {
      pintar("bot", SALUDO);
      saludoPintado = true;
    }
    setTimeout(function () {
      input.focus();
    }, 220);
  }

  function cerrar() {
    abierto = false;
    panel.classList.remove("abierto");
    launcher.hidden = false;
    launcher.focus();
  }

  /* ------------------------------------------------------------ conversación */

  /**
   * El asistente tiene instruido escribir en texto plano, pero si algún día se
   * le escapa un **negrita** o un ## título, aquí se limpian los símbolos en
   * vez de mostrarlos crudos al visitante.
   */
  function limpiar(texto) {
    return texto
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/^#{1,6}\s+/gm, "");
  }

  function pintar(quien, texto) {
    var burbuja = document.createElement("div");
    burbuja.className = "iachat-msg " + (quien === "yo" ? "yo" : quien === "aviso" ? "aviso" : "bot");
    burbuja.textContent = quien === "yo" ? texto : limpiar(texto);
    log.appendChild(burbuja);
    abajo();
    return burbuja;
  }

  function abajo() {
    log.scrollTop = log.scrollHeight;
  }

  function enviar() {
    var texto = input.value.trim();
    if (!texto || enviando) return;

    input.value = "";
    input.style.height = "auto";
    pintar("yo", texto);
    historial.push({ role: "user", content: texto });
    if (historial.length > MAX_HISTORIAL) historial = historial.slice(-MAX_HISTORIAL);

    conversar();
  }

  function conversar() {
    enviando = true;
    botonEnviar.disabled = true;

    var burbuja = document.createElement("div");
    burbuja.className = "iachat-msg bot";
    burbuja.innerHTML = '<span class="iachat-puntos"><i></i><i></i><i></i></span>';
    log.appendChild(burbuja);
    abajo();

    var acumulado = "";
    var primero = true;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: historial, sessionId: sesion }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (datos) {
              throw new Error(datos.error || "No se pudo conectar con el asistente.");
            });
        }

        var lector = res.body.getReader();
        var decodificador = new TextDecoder();
        var buffer = "";

        function leer() {
          return lector.read().then(function (resultado) {
            if (resultado.done) return;
            buffer += decodificador.decode(resultado.value, { stream: true });

            var partes = buffer.split("\n\n");
            buffer = partes.pop();

            partes.forEach(function (parte) {
              var linea = parte.trim();
              if (linea.indexOf("data:") !== 0) return;
              var evento;
              try {
                evento = JSON.parse(linea.slice(5).trim());
              } catch (e) {
                return;
              }

              if (evento.t === "delta") {
                if (primero) {
                  burbuja.textContent = "";
                  primero = false;
                }
                acumulado += evento.v;
                burbuja.textContent = limpiar(acumulado);
                abajo();
              } else if (evento.t === "error") {
                if (primero) {
                  burbuja.textContent = "";
                  primero = false;
                }
                acumulado += (acumulado ? "\n\n" : "") + evento.v;
                burbuja.textContent = limpiar(acumulado);
                abajo();
              }
            });

            return leer();
          });
        }

        return leer();
      })
      .then(function () {
        if (acumulado) {
          historial.push({ role: "assistant", content: acumulado });
        } else {
          burbuja.remove();
          pintar("aviso", "No llegó respuesta. Intenta otra vez, por favor.");
        }
      })
      .catch(function (err) {
        burbuja.remove();
        pintar(
          "bot",
          (err && err.message ? err.message : "Se cayó la conexión.") + colaDeContacto(),
        );
      })
      .then(function () {
        enviando = false;
        botonEnviar.disabled = false;
        if (abierto) input.focus();
      });
  }

  /* ------------------------------------------------------------------ sesión */

  /* En localStorage y con la misma clave que chat.html: la sesión es la llave
     de la memoria del servidor y debe sobrevivir al cierre de la pestaña —
     si muriera con ella, el visitante que vuelve mañana sería un desconocido. */
  function obtenerSesion() {
    try {
      var guardada = localStorage.getItem("iachat_sesion");
      if (!guardada) {
        guardada = sessionStorage.getItem("iachat_sesion");
        if (guardada) localStorage.setItem("iachat_sesion", guardada);
      }
      if (guardada) return guardada;
      var nueva = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("iachat_sesion", nueva);
      return nueva;
    } catch (e) {
      return "s_" + Date.now().toString(36);
    }
  }
})();
