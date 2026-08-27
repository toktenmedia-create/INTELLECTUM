/**
 * MEDICIÓN — el píxel de Meta, con permiso y con freno de mano.
 *
 * Sirve para dos cosas que hoy no se pueden hacer: saber de dónde viene quien
 * entra, y decirle a Meta "búscame más gente como la que ya me escribió". Sin
 * esto, cada dólar de pauta sale a ciegas.
 *
 * TRES DECISIONES QUE EXPLICAN TODO LO DEMÁS:
 *
 * 1. NACE DORMIDO. Sin PIXEL puesto abajo, este archivo no hace absolutamente
 *    nada: ni carga scripts de terceros, ni pinta el aviso, ni guarda nada. Se
 *    despierta el día que exista el identificador, no antes. Un medidor a
 *    medias que igual rastrea es lo peor de los dos mundos.
 *
 * 2. NO RASTREA SIN PERMISO. En Ecuador rige la Ley Orgánica de Protección de
 *    Datos Personales, y un píxel de un tercero no es una cookie técnica: hace
 *    falta consentimiento. Además, quien vende automatización a empresas no
 *    puede permitirse que le encuentren rastreando a escondidas. Cuesta datos
 *    —quien diga que no, no se mide— y ese es el precio de hacerlo bien.
 *
 * 3. EL "NO" PESA LO MISMO QUE EL "SÍ". Los dos botones se ven parecidos, los
 *    dos se recuerdan, y el aviso no vuelve a salir. Un rechazo que hay que
 *    repetir en cada visita no es un rechazo, es un desgaste.
 *
 * CÓMO SE ENCIENDE: crea el píxel en tu Business Manager de Meta, copia el
 * identificador (son unos 15 dígitos) y pégalo en PIXEL, aquí abajo.
 */

/** El identificador del píxel de Meta. Vacío = todo esto duerme. */
var PIXEL = "1365926822276759";

(function () {
  "use strict";

  if (!PIXEL) return; // dormido: ni una línea más se ejecuta

  var LLAVE = "intellectum:medicion";
  var decision = leer();

  if (decision === "si") encender();
  else if (decision !== "no") preguntar();

  /* ── El permiso, guardado donde el visitante puede borrarlo ───────────── */

  function leer() {
    // Un navegador en privado, o con el almacenamiento bloqueado, LANZA aquí.
    // Si no se puede leer la decisión, se trata como "no hay decisión": nunca
    // como un sí.
    try {
      return window.localStorage.getItem(LLAVE);
    } catch (e) {
      return null;
    }
  }

  function guardar(valor) {
    try {
      window.localStorage.setItem(LLAVE, valor);
    } catch (e) {
      /* Sin memoria, el aviso volverá a salir. Molesta, pero no rastrea. */
    }
  }

  /* ── El píxel ─────────────────────────────────────────────────────────── */

  function encender() {
    if (window.fbq) return;

    /* El fragmento de Meta, tal cual lo publican. */
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */

    window.fbq("init", PIXEL);
    window.fbq("track", "PageView");
    escuchar();
  }

  /* ── Lo que se mide ───────────────────────────────────────────────────── */

  /**
   * Un solo oyente en el documento, en vez de uno por botón. Los botones de
   * WhatsApp se pintan en sitios distintos y algunos aparecen después de que
   * carga la página; con delegación da igual cuándo nazcan.
   */
  function escuchar() {
    document.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest && e.target.closest("a[href]");
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (href.indexOf("wa.me") !== -1 || href.indexOf("api.whatsapp.com") !== -1) {
          medir("Contact", { canal: "whatsapp" });
        } else if (href.indexOf("/agenda") !== -1) {
          medir("InitiateCheckout", { paso: "abrio_agenda" });
        }
      },
      true, // en captura: se anota aunque el clic abra otra pestaña al instante
    );
  }

  /**
   * Para que el resto del sitio pueda anotar sus propios momentos sin saber
   * nada de Meta: agenda.html avisa cuando se reserva de verdad, y el chat
   * cuando alguien lo abre. Si el visitante dijo que no, esto no hace nada,
   * y quien llama no tiene que enterarse.
   */
  function medir(evento, datos) {
    if (!window.fbq) return;
    try {
      window.fbq("track", evento, datos || {});
    } catch (e) {
      /* Que un contador tumbe una página sería absurdo. */
    }
  }

  window.medir = medir;

  /* ── El aviso ─────────────────────────────────────────────────────────── */

  function preguntar() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", preguntar);
      return;
    }

    var caja = document.createElement("div");
    caja.id = "aviso-medicion";
    caja.setAttribute("role", "dialog");
    caja.setAttribute("aria-live", "polite");
    caja.setAttribute("aria-label", "Aviso sobre medición");

    var texto = document.createElement("p");
    texto.appendChild(
      document.createTextNode(
        "Usamos una herramienta de Meta para saber qué contenido te resulta útil. " +
          "No es necesaria para navegar y puedes decir que no. ",
      ),
    );
    var enlace = document.createElement("a");
    enlace.href = "/privacidad";
    enlace.target = "_blank";
    enlace.rel = "noopener";
    enlace.textContent = "Cómo tratamos tus datos";
    texto.appendChild(enlace);
    texto.appendChild(document.createTextNode("."));

    var botones = document.createElement("div");
    botones.className = "botones";
    [
      ["no", "No, gracias"],
      ["si", "Aceptar"],
    ].forEach(function (par) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.medicion = par[0];
      b.textContent = par[1];
      botones.appendChild(b);
    });

    caja.appendChild(texto);
    caja.appendChild(botones);

    var estilo = document.createElement("style");
    estilo.textContent = [
      "#aviso-medicion{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;",
      "max-width:560px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px 20px;",
      "align-items:center;justify-content:space-between;padding:16px 18px;",
      "background:#0d0f12;border:1px solid rgba(255,255,255,.15);border-radius:14px;",
      "box-shadow:0 12px 40px -12px rgba(0,0,0,.75);",
      "font-family:'Geist',ui-sans-serif,system-ui,-apple-system,sans-serif;",
      "animation:aviso-entra .28s ease both}",
      "@keyframes aviso-entra{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}",
      "@media (prefers-reduced-motion:reduce){#aviso-medicion{animation:none}}",
      "#aviso-medicion p{margin:0;flex:1 1 260px;font-size:13.5px;line-height:1.5;color:#a6adb0}",
      "#aviso-medicion a{color:#22d3ee;text-decoration:underline;text-underline-offset:2px}",
      "#aviso-medicion .botones{display:flex;gap:8px;flex:0 0 auto}",
      "#aviso-medicion button{font:inherit;font-size:13.5px;padding:8px 16px;border-radius:999px;",
      "cursor:pointer;border:1px solid rgba(255,255,255,.15);background:transparent;color:#f7f8f8;",
      "transition:background .15s ease,border-color .15s ease}",
      "#aviso-medicion button:hover{background:rgba(255,255,255,.06)}",
      '#aviso-medicion button[data-medicion="si"]{border-color:rgba(34,211,238,.45);color:#22d3ee}',
      '#aviso-medicion button[data-medicion="si"]:hover{background:rgba(34,211,238,.1)}',
      "#aviso-medicion button:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}",
    ].join("");

    document.head.appendChild(estilo);
    document.body.appendChild(caja);

    caja.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-medicion]");
      if (!b) return;
      var respuesta = b.dataset.medicion;
      guardar(respuesta);
      caja.remove();
      if (respuesta === "si") encender();
    });
  }
})();
