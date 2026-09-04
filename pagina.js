/* COMPORTAMIENTO COMÚN DE LAS PÁGINAS DE MARKETING.
   Igual que /estilos.css: hasta el 4 sep 2026 esto vivía copiado dentro de
   index.html y de en.html, y con una página por servicio habrían sido ocho
   copias del mismo menú y del mismo cielo estrellado.
   Todo lo de aquí es opcional por diseño: si una página no tiene menú móvil,
   ni acordeón, ni [data-cosmos], cada bloque se encuentra sin nada que hacer y
   se calla. Así una página de servicio carga lo mismo sin arrastrar lo que no
   usa. Va con defer: necesita el DOM ya leído, igual que cuando estaba al
   final del <body>. */

/* Nav scroll state */
(function () {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* Mobile menu */
(function () {
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;
  const close = () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
})();

/* FAQ accordion */
document.querySelectorAll('.faq-item').forEach(item => {
  const q = item.querySelector('.faq-q');
  q.addEventListener('click', () => {
    const isOpen = item.classList.toggle('open');
    q.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
});

/* Reveal on scroll */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => io.observe(el));
})();

/* El cerebro en el espacio: estrellas con profundidad, chispas de circuito que
   se desprenden del isotipo, inclinación hacia el cursor con inercia y giro al
   hacer scroll. Un lienzo por cada zona [data-cosmos] (el hero y el logo del
   pie), acotado a ella; se detiene fuera de pantalla o con la pestaña oculta,
   y con prefers-reduced-motion deja solo el cielo fijo. */
(function () {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const movil = window.innerWidth < 768;
  const CIAN = '#22d3ee';
  const BLANCO = '#f7f8f8';
  const azar = (a, b) => a + Math.random() * (b - a);

  function montar(visual) {
    const lienzo = visual.querySelector('.cosmos');
    const marco = visual.querySelector('.isotipo');
    const giro = visual.querySelector('.isotipo-giro');
    if (!lienzo || !marco || !giro) return;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, escala = 1;
    let centro = { x: 0, y: 0, rx: 0, ry: 0 };
    const estrellas = [];
    const chispas = [];
    let activo = false, enPantalla = false, raf = 0, ultimo = 0;

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, movil ? 1.5 : 2);
      W = lienzo.offsetWidth;
      H = lienzo.offsetHeight;
      lienzo.width = Math.round(W * dpr);
      lienzo.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Las chispas viajan en píxeles: en el logo pequeño del pie, más despacio.
      escala = Math.max(0.45, Math.min(1, W / 570));
      // El cerebro ocupa el 70% superior de la imagen; las chispas nacen en su borde.
      const ox = marco.offsetLeft - lienzo.offsetLeft;
      const oy = marco.offsetTop - lienzo.offsetTop;
      centro = {
        x: ox + marco.offsetWidth / 2,
        y: oy + marco.offsetHeight * 0.38,
        rx: marco.offsetWidth * 0.3,
        ry: marco.offsetHeight * 0.28,
      };
    }

    function nacer(c, inicial) {
      const ang = azar(0, Math.PI * 2);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const v = azar(7, 15) * escala;
      c.vx = dx * v;
      c.vy = dy * v - 5 * escala; // leve empuje hacia arriba: suben, no caen
      c.vida = azar(7, 11);
      c.edad = inicial ? azar(0, c.vida) : 0;
      c.x = centro.x + dx * centro.rx + c.vx * c.edad;
      c.y = centro.y + dy * centro.ry + c.vy * c.edad;
      c.traza = Math.random() < 0.4;
      c.r = azar(1.2, 2.2);
      const largo = Math.max(0.6, escala);
      c.l1 = azar(6, 14) * largo * (dx < 0 ? -1 : 1);
      c.l2 = azar(4, 10) * largo * (dy < 0 ? -1 : 1);
      c.brillo = azar(0.5, 0.95);
      c.fs = azar(0.4, 0.9);
      c.ph = azar(0, Math.PI * 2);
      return c;
    }

    function sembrar() {
      // Densidad según el área: el hero lleva unas 130 estrellas y 14 chispas;
      // el logo del pie, lo que le cabe.
      const area = W * H;
      const nEstrellas = Math.max(36, Math.min(movil ? 70 : 130, Math.round(area / 3900)));
      const nChispas = quieto ? 0 : Math.max(5, Math.min(movil ? 8 : 14, Math.round(area / 36000)));
      estrellas.length = 0;
      for (let i = 0; i < nEstrellas; i++) {
        estrellas.push({
          x: Math.random(), y: Math.random(),
          r: azar(0.6, 1.5), z: azar(0.25, 1),
          a: azar(0.22, 0.7), f: azar(0.25, 0.9), ph: azar(0, Math.PI * 2),
          cian: Math.random() < 0.2,
        });
      }
      chispas.length = 0;
      for (let i = 0; i < nChispas; i++) chispas.push(nacer({}, true));
    }

    function dibujarCielo(t, px, py) {
      ctx.clearRect(0, 0, W, H);
      for (const s of estrellas) {
        ctx.globalAlpha = s.a * (quieto ? 1 : 0.65 + 0.35 * Math.sin(t * s.f + s.ph));
        ctx.fillStyle = s.cian ? CIAN : BLANCO;
        ctx.beginPath();
        ctx.arc(s.x * W + px * s.z * 12, s.y * H + py * s.z * 9, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function dibujarChispas(t, dt) {
      for (const c of chispas) {
        c.edad += dt;
        if (c.edad >= c.vida) nacer(c, false);
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const v = c.edad / c.vida;
        const a = Math.min(1, v / 0.12) * (v > 0.55 ? (1 - v) / 0.45 : 1) * c.brillo;
        const x = c.x + Math.sin(t * c.fs + c.ph) * 3;
        const y = c.y;
        if (c.traza) {
          // Un fragmento de pista con su nodo, como los del propio isotipo.
          ctx.globalAlpha = a;
          ctx.strokeStyle = CIAN;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + c.l1, y);
          ctx.lineTo(x + c.l1, y + c.l2);
          ctx.stroke();
          ctx.fillStyle = CIAN;
          ctx.beginPath();
          ctx.arc(x + c.l1, y + c.l2, 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = CIAN;
          ctx.globalAlpha = a * 0.16;
          ctx.beginPath();
          ctx.arc(x, y, c.r * 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x, y, c.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Cambiar el tamaño del lienzo lo borra: si el bucle no corre (pestaña
    // oculta, fuera de pantalla o reduced-motion), se repinta un cielo fijo.
    function refrescar() {
      medir();
      if (!activo) dibujarCielo(0, 0, 0);
    }

    medir();
    sembrar();
    dibujarCielo(0, 0, 0);
    window.addEventListener('load', refrescar);

    if (quieto) {
      window.addEventListener('resize', refrescar);
      return;
    }

    // Inclinación: el lado donde está el cursor se acerca; con inercia para que
    // no se sienta pegada al ratón. Solo con puntero fino; en táctil queda la
    // levitación sola. La zona que escucha es la sección entera (o el pie).
    let objX = 0, objY = 0, curX = 0, curY = 0;
    const zona = visual.closest('section, footer') || visual;
    if (fino) {
      zona.addEventListener('pointermove', (e) => {
        const r = visual.getBoundingClientRect();
        const nx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const ny = (e.clientY - (r.top + r.height / 2)) / r.height;
        objY = -Math.max(-1, Math.min(1, nx * 1.5)) * 9;
        objX = Math.max(-1, Math.min(1, ny * 1.5)) * 6;
      });
      zona.addEventListener('pointerleave', () => { objX = 0; objY = 0; });
    }
    // Cuánto se ha ido el visual hacia arriba: 0 centrado en pantalla (o más
    // abajo), 1 cuando su centro ya salió por arriba. Así funciona igual en
    // escritorio (el visual arranca a la vista) y en móvil (llega con el scroll).
    function avance() {
      const r = visual.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      return Math.max(0, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / vh));
    }

    function cuadro(ts) {
      if (!activo) { raf = 0; return; }
      const dt = Math.min(0.05, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      const t = ts / 1000;
      const k = Math.min(1, dt * 5);
      curX += (objX - curX) * k;
      curY += (objY - curY) * k;
      const p = avance();
      giro.style.transform =
        'perspective(1100px) rotateX(' + curX.toFixed(2) + 'deg) rotateY(' + (curY + p * 26).toFixed(2) + 'deg)' +
        ' translate3d(0, ' + (p * 34).toFixed(1) + 'px, 0) scale(' + (1 - p * 0.06).toFixed(3) + ')';
      dibujarCielo(t, -curY / 9, curX / 6);
      dibujarChispas(t, dt);
      raf = requestAnimationFrame(cuadro);
    }
    function arrancar() {
      if (activo) return;
      activo = true;
      ultimo = performance.now();
      if (!raf) raf = requestAnimationFrame(cuadro);
    }
    function parar() { activo = false; }

    let remedir = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(remedir);
      remedir = requestAnimationFrame(refrescar);
    });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entradas) => {
        enPantalla = entradas.some((e) => e.isIntersecting);
        if (enPantalla && !document.hidden) arrancar(); else parar();
      }, { threshold: 0.02 });
      io.observe(visual);
    } else {
      enPantalla = true;
      arrancar();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) parar(); else if (enPantalla) arrancar();
    });
  }

  document.querySelectorAll('[data-cosmos]').forEach(montar);
})();

/* Reflector que sigue al cursor en las tarjetas (solo con puntero fino) */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.service-card, .why-card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
})();
