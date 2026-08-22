---
name: Intellectum AI Solutions
description: Landing oscura de IA con acento cian, ejecutada al listón de Linear/Vercel.
colors:
  bg: "#08090b"
  bg-elev: "#0d0f12"
  bg-card: "rgba(255, 255, 255, 0.02)"
  bg-card-hover: "rgba(255, 255, 255, 0.045)"
  border: "rgba(255, 255, 255, 0.07)"
  border-strong: "rgba(255, 255, 255, 0.15)"
  text: "#f7f8f8"
  text-dim: "#a6adb0"
  text-muted: "#737d81"
  accent: "#22d3ee"
  accent-bright: "#67e8f9"
  accent-deep: "#0891b2"
  accent-glow: "rgba(34, 211, 238, 0.22)"
  accent-tint-bg: "rgba(34, 211, 238, 0.08)"
  accent-tint-border: "rgba(34, 211, 238, 0.24)"
  ink-on-accent: "#06141a"
  whatsapp: "#25d366"
typography:
  display:
    fontFamily: "Fraunces, Times New Roman, serif"
    fontSize: "clamp(38px, 6.8vw, 84px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Fraunces, Times New Roman, serif"
    fontSize: "clamp(34px, 5vw, 60px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Fraunces, Times New Roman, serif"
    fontSize: "clamp(22px, 2.2vw, 27px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "999px"
spacing:
  pad-x: "clamp(20px, 4vw, 44px)"
  sec-y: "clamp(84px, 11vw, 132px)"
  gap-card: "14px"
  gap-col: "72px"
  fab-cushion: "76px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-on-accent}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.accent-bright}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
  button-whatsapp:
    backgroundColor: "{colors.whatsapp}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
  chip-live:
    backgroundColor: "{colors.accent-tint-bg}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.pill}"
    padding: "7px 14px 7px 11px"
  card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.lg}"
    padding: "36px 30px"
  tag-mono:
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
---

# Design System: Intellectum AI Solutions

Fuente de verdad: `index.html` (contrato de dirección seed `30bd5a1d`, elegido por Paul el 21 ago 2026). Los encabezados de sección van en inglés porque el formato DESIGN.md los exige literales; la prosa es en español.

## Overview

**Creative North Star: "El canon de la categoría, ejecutado impecable"**

Este mundo NO experimenta: es la landing oscura de agencia de IA — fondo casi negro, acento cian, tarjetas con luz — abrazada a propósito y ejecutada al listón de Linear/Vercel. La personalidad viene del oficio, no de la rareza: fondo `#08090b` con un único halo cian fijo y grain sutil, bordes de 1px como estructura, serif itálica cian como única floritura, y microinteracciones que responden al tacto (todo control se hunde al presionarse). La densidad es aireada: secciones de ~84–132px de respiro vertical separadas por líneas de 1px, texto medido en `ch`.

La prueba manda sobre el discurso: el elemento más importante de la página es que IntelliA está de verdad en línea (chip vivo, demo-chat con su voz real). Rechazos confirmados: eyebrows/kickers, cifras o testimonios inventados, sombras grises, y cualquier experimento de mundo visual no pedido por el dueño.

**Gramática de movimiento (cuatro verbos, nada más):** *encender* (el hero sube 18px y desenfoca de 4px a 0 en cascada de ~0.06s entre elementos), *revelar* (secciones suben 16px al entrar al viewport, con escalón de 60ms dentro de cada grilla), *orbitar* (anillos del hero rotan 90s lineal; halo pulsa 7s; punto de IntelliA late 2.4s) y *flotar*, el único momento autoral de la página: el isotipo levita 11s en perspectiva (±4° de giro, 10px de vaivén), se inclina hasta 9° hacia el cursor con inercia, gira 26° y se aleja al hacer scroll; un solo lienzo acotado al visual dibuja estrellas con paralaje (110 en escritorio, 60 en móvil) y chispas de circuito, puntos y fragmentos de pista con nodo, que nacen en el borde del cerebro y se apagan en 7-11s; una luz barre las pistas cada 9s usando la propia imagen como máscara. El lienzo se detiene fuera de pantalla y con la pestaña oculta; con `prefers-reduced-motion` queda el cielo fijo, sin chispas, sin inclinación ni barrido. Curvas propias porque las nativas de CSS son tibias: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para casi todo, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` reservada. Duraciones canónicas: 150ms color de links, 160ms press, 200ms hover, 250ms nav/menú, 300ms tarjetas y acordeón, 600ms reveal, 900ms entrada del hero. `prefers-reduced-motion` colapsa todo a 0.01ms y muestra los reveals.

**Alcance y deuda de migración:** este mundo existe hoy SOLO en `index.html`. `chat.html`, `blog.html` + `blog/*.html`, `en.html` y `panel.html` aún no migran; deben adoptar este documento tal cual (mismos tokens, mismos invariantes del pie y del FAB), y `en.html` mantiene paridad 1:1 con la portada.

**Key Characteristics:**
- Oscuro casi-negro con un solo halo cian ambiental y grain al 35% en blend `overlay`.
- Cian `#22d3ee` como tinta escasa: trazos, tintes al 8–24%, itálicas; solo el botón primario lo lleva sólido.
- Fraunces itálica 300 cian como acento único por titular; Geist habla; Geist Mono rotula datos.
- Bordes de 1px (blanco al 7% / 15%) como toda la arquitectura visual; sin sombras grises.
- Luz que sigue al cursor en las tarjetas (mecanismo `--mx`/`--my`) como interacción firma.
- Todo control se hunde al presionar (`:active { transform: scale(0.97) }`).

## Colors

Paleta de dos voces: neutros fríos casi acromáticos que construyen el espacio, y un solo cian de marca que señala vida e interacción (más el verde funcional de WhatsApp, que no es de la marca).

### Primary
- **Cian Intellectum** (`#22d3ee`, token `accent`): el color del logo. Acentos itálicos en titulares, punto vivo de IntelliA, iconos, números de paso, tags, caret y selección. Relleno sólido únicamente en el botón primario.
- **Cian encendido** (`#67e8f9`, `accent-bright`): estado hover del primario y de links cian.
- **Cian profundo** (`#0891b2`, `accent-deep`): reserva del ramp; hoy sin uso protagónico.
- **Tintes cian**: `accent-tint-bg` (8%) para fondos de chip/icono/burbuja IA, `accent-tint-border` (24%) para sus bordes, `accent-glow` (22%) para halos y sombras del primario.
- **Tinta sobre cian** (`#06141a`, `ink-on-accent`): el texto que va encima de cian sólido (botón primario, `::selection`). Nunca texto blanco sobre cian.

### Neutral
- **Fondo base** (`#08090b`, `bg`): el negro azulado de toda página; `bg-elev` (`#0d0f12`) para superficies elevadas (demo-chat usa `rgba(13,15,18,0.88)` + blur).
- **Velos de tarjeta**: blanco al 2% (`bg-card`) en reposo, 4.5% (`bg-card-hover`) en hover.
- **Bordes**: blanco al 7% (`border`) por defecto, 15% (`border-strong`) para énfasis y hover.
- **Texto**: `#f7f8f8` (`text`) titulares y énfasis; `#a6adb0` (`text-dim`) párrafos; `#737d81` (`text-muted`) notas, labels mono y legal.

### Funcional
- **Verde WhatsApp** (`#25d366`, `whatsapp`; hover `#1fb858`): exclusivo del botón/FAB de WhatsApp. No es color de marca; no se usa en ningún otro elemento.

### Named Rules
**La Regla de la Tinta Cian.** El cian es tinta, no pintura: se aplica en trazos, itálicas, iconos y tintes al 8–24%. El único relleno cian sólido de una página es el botón primario. Jamás como fondo de sección.

**La Regla del Halo Único.** Una página tiene exactamente una atmósfera: los dos radial-gradients cian fijos del `body::before` (9% arriba-centro, 5% abajo-derecha) + grain. Ningún componente trae brillo ambiental propio — el demo-chat vive del halo del hero, no de uno suyo.

## Typography

**Display Font:** Fraunces (variable 300–900, con Times New Roman de respaldo) — solo titulares y acentos.
**Body Font:** Geist (variable 300–700, con system-ui de respaldo).
**Label/Mono Font:** Geist Mono (400 y 500, con ui-monospace de respaldo) — datos, rótulos, legal.

**Character:** una serif de ópticas cálidas que acentúa sobre una sans neutra de ingeniería: la calidez es la excepción medida, no la voz. La voz corre en Geist; Fraunces aparece en peso 400 recto para titulares y en itálica 300 cian para el acento.

### Hierarchy
- **Display** (400, `clamp(38px, 6.8vw, 84px)`, lh 0.98, ls −0.035em): H1 del hero (tres líneas `span.line`) y H2 del CTA final. Con `text-wrap: balance`.
- **Headline** (400, `clamp(34px, 5vw, 60px)`, lh 1.05, ls −0.02em): `.section-title`, títulos de sección en dos líneas con el segundo renglón en acento itálico.
- **Title** (400, `clamp(22px, 2.2vw, 27px)`): H3 de tarjetas; pasos y why-cards en 22–23px.
- **Body** (400, 16px, lh 1.6, color `text-dim` en párrafos): leads a `clamp(16px, 1.5vw, 18px)` con máximos de 52–70ch y `text-wrap: pretty`; texto de tarjeta 14–15px.
- **Label** (400–500, 11px, ls 0.1em, UPPERCASE, Geist Mono, `text-muted`): rótulos de métricas, columnas del pie (500, ls 0.12em), cabecera del demo-chat (10.5px), tags (color `accent`). El botón EN del nav usa mono 12px ls 0.08em.
- **Cifras**: siempre `font-variant-numeric: tabular-nums` (métricas del hero, números de paso).

### Named Rules
**La Regla del Acento Itálico.** Cada titular lleva exactamente un segmento en Fraunces itálica 300 color cian (`.serif-italic`). Es el único uso decorativo de la serif; nunca dos acentos en un mismo titular, nunca párrafos en Fraunces.

**La Regla Anti-Eyebrow.** Prohibido el kicker/eyebrow (rótulo corto encima de un titular). Sus reemplazos legítimos, ya construidos: (1) el chip vivo del hero, que es un control real —enlaza a `/chat` y reporta un estado verdadero—, no una etiqueta; (2) las etiquetas mono uppercase, que solo rotulan datos (debajo de una cifra, encabezando una columna del pie, dentro de un tag) y nunca anteceden a un título.

## Layout

Contenedor único `.wrap` de 1200px (`--max-w`) con padding lateral `--pad-x: clamp(20px, 4vw, 44px)`. Ritmo vertical por sección `--sec-y: clamp(84px, 11vw, 132px)`; secciones contiguas se separan con `border-top: 1px solid var(--border)` — la línea ES el separador, no el espacio en blanco. Grillas de tarjetas con gap 14px; pares editoriales (título + lead, quote + cuerpo, FAQ) en dos columnas asimétricas (1fr/1.4fr, 1fr/1.2fr) con gap 72px en desktop.

Breakpoints observados: **≥1024px** hero a dos columnas (1.55fr/1fr); **≥900px** cabezas de sección y FAQ a dos columnas; **≥880px** nav completo (debajo, hamburguesa + menú móvil de pantalla completa); **≥760px** grillas de tarjetas (2 col servicios, 3 col why, 4 col proceso, pie 2fr/1fr/1fr/1fr); **≤767px** las métricas del hero se apilan.

Z-index: atmósfera 0 → contenido 1 → FAB WhatsApp 30 → menú móvil 40 → nav 50.

**La Regla del Colchón del FAB.** El FAB de WhatsApp vive fijo abajo-izquierda (56px, en x 20–76). Nada informativo puede quedar debajo: en ≤767px las métricas del hero se apilan en una columna con `padding-left: 84px` y fila `flex` con cifra y rótulo en baseline —los dígitos quedan legibles a cualquier altura del scroll, no solo al caer la página—; y la línea legal del pie lleva `padding-bottom: 76px` para que los botones flotantes no se coman la identificación de la empresa.

## Elevation & Depth

Sistema plano con profundidad por materia, no por sombra: (1) bordes 1px en dos intensidades; (2) velos de blanco al 2–4.5% en tarjetas; (3) vidrio con `backdrop-filter: blur` en las superficies que flotan sobre contenido (nav scrolled: `rgba(8,9,11,0.75)` + blur 16px saturate 180%; menú móvil: 0.96 + blur 20px; demo-chat: `rgba(13,15,18,0.88)` + blur 12px).

### Shadow Vocabulary
- **Glow del primario** (`box-shadow: 0 8px 28px rgba(34,211,238,0.22)`): solo en hover del botón primario.
- **Glow de WhatsApp** (`0 8px 28px rgba(37,211,102,0.25)` hover; `0 12px 30px rgba(37,211,102,0.35)` permanente en el FAB): solo elementos WhatsApp.
- **Glow del punto vivo** (`0 0 10px var(--accent)`): el `ia-dot`.

### Named Rules
**La Regla del Brillo Ganado.** No existen sombras neutras (grises/negras) en este mundo. La única sombra permitida es el resplandor del color del propio elemento interactivo, y se gana: aparece en hover o señala un elemento vivo. La jerarquía en reposo se hace con bordes y velos.

## Shapes

Lenguaje de cápsulas y esquinas suaves: **pill (999px)** para todo lo accionable pequeño (botones, chips, tags, botón EN, thumb del scrollbar); **18px (`lg`)** para tarjetas y el demo-chat; **12px (`md`)** para burbujas de chat; **8px (`sm`)** para el toggle del nav; **círculo** para el FAB y el `ia-dot`. Las burbujas del demo-chat aplanan a 4px la esquina que apunta a su hablante (inferior-izquierda la del visitante, inferior-derecha la de IntelliA). Los anillos del hero son círculos SVG de trazo 1px (blanco 6%; el segundo, cian 14% con `stroke-dasharray: 6 10`). El separador del marquee es una estrella de cuatro puntas cian de 13px (data-URI). Iconografía: SVG inline de trazo (stroke 1.4–1.6), 21px en tiles de 44px con tinte cian, nunca fuentes de iconos ni emoji.

## Components

### Buttons
- **Shape:** cápsula (999px), padding 13px 22px (nav: 9px 17px, font 14px), Geist 500 a 15px, ls −0.01em.
- **Primary:** fondo `accent`, texto `ink-on-accent` (#06141a), peso 600. Hover: `accent-bright` + glow cian + `translateY(-1px)`. Con flecha SVG de 14px que se desliza 3px a la derecha en hover.
- **Secondary:** transparente con borde `border-strong`; hover: velo blanco 4% y borde `text-dim`.
- **WhatsApp:** fondo `#25d366`, texto blanco; hover `#1fb858` + glow verde.
- **Press (todos, también chip, FAB y toggle):** `:active { transform: scale(0.97) }` (FAB y toggle: 0.94) a 160ms `--ease-out`. Los hovers van SIEMPRE dentro de `@media (hover: hover) and (pointer: fine)`.

### Chip vivo (`.chip-live`)
El estado real de IntelliA como control, no como etiqueta: cápsula con tinte cian 8% y borde cian 24%, texto 13px `text-dim` con `<strong>` en `text` 500, y el `ia-dot` (7px, cian, glow, latido de opacidad 1→0.35 en 2.4s). Enlaza a `/chat`; hover: borde cian pleno; active: se hunde. El `ia-dot` se reutiliza en nav, menú móvil, CTA y demo-chat como firma de "en línea".

### Demo-chat (tarjeta de conversación del hero)
Vidrio elevado (fondo `rgba(13,15,18,0.88)`, blur 12px, borde `border-strong`, radio 18px, max 396px) montado sobre el isotipo. Cabecera mono 10.5px uppercase con `ia-dot`; burbuja del visitante alineada a la izquierda (velo blanco 5%, borde `border`, texto `text-dim`), respuesta de IntelliA a la derecha (tinte y borde cian, texto `text`); pie-link cian "Pruébala tú mismo" con flecha que se desliza. Sin brillo propio (Regla del Halo Único). Su contenido es la voz real de IntelliA, rotulado "conversación de ejemplo".

### Tarjetas spotlight (`.service-card`, `.why-card`)
Velo 2% + borde 7% + radio 18px, min-height 300px (servicios). El reflector que sigue al cursor —la firma Linear/Vercel— funciona con dos pseudoelementos alimentados por variables `--mx`/`--my` que un `pointermove` de JS fija en px relativos a la tarjeta: `::before` pinta luz interna (`radial-gradient(360px circle at var(--mx,50%) var(--my,0%), rgba(34,211,238,0.07), transparent 65%)`) y `::after` enciende el segmento de borde (radial 280px cian 0.5 sobre `padding: 1px` con `mask-composite: exclude` para dejar solo el anillo). Ambos a `opacity: 0` en reposo, 1 en hover (300ms); la tarjeta sube 3px, el velo pasa a 4.5% y el borde a 15%. El JS entero está condicionado a `(hover: hover) and (pointer: fine)`: en táctil no existe el efecto.

### Métricas (`.hero-meta`)
Fila de 3 columnas sobre `border-top`, max 560px: cifra en Fraunces `clamp(28px, 4vw, 38px)` tabular con el carácter clave en itálica cian (`24/7` con la barra cian, `−70%` con el 70 cian), rótulo mono 11px uppercase `text-muted`. En ≤767px: columna apilada, gap 13px, cada ítem en `flex` baseline con gap 12px, y `padding-left: 84px` — el colchón del FAB de WhatsApp (ver Layout). Las cifras estimadas llevan asterisco y nota referencial (`.hero-note`, 12px `text-muted`).

### FAQ (acordeón `.faq-item`)
Lista sobre líneas 1px (sin tarjetas). Pregunta en Fraunces `clamp(18px, 2vw, 22px)` con icono "+" dibujado con pseudoelementos (1.5px, cian) que rota 45° al abrir; hover tiñe la pregunta de `accent-bright`. El despliegue es interrumpible: `grid-template-rows: 0fr → 1fr` a 300ms (nunca `max-height` adivinado ni animar padding); el aire inferior vive DENTRO del contenido medido como `.faq-a-inner::after` de 24px para crecer y recortarse con la propia fila. JS alterna `.open` y `aria-expanded`.

### Marquee
Cinta entre dos líneas 1px con bordes fundidos por máscara (`mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)`), track duplicado que traslada −50% en 42s lineal y se pausa en hover. Voz: Fraunces itálica `clamp(18px, 2vw, 24px)` en `text-dim`, separadores de estrella cian. Es `aria-hidden="true"`: decorativo, no contenido.

### Navigation
Fija, transparente en top; con scroll >8px gana vidrio (`rgba(8,9,11,0.75)` + blur 16px) y borde inferior. Marca: isotipo 28px + "Intellectum" en Fraunces 19px. Links 14px `text-dim`→`text`; el link a IntelliA lleva el `ia-dot`; el selector EN es cápsula mono 12px. CTA primario a la derecha. ≤880px: hamburguesa (40px, radio 8px) + menú móvil de pantalla completa en vidrio con links en Fraunces 27px sobre líneas 1px.

### Superficies del navegador
El diseño llega hasta el borde del navegador: `::selection` cian con tinta `#06141a`; `caret-color` y `accent-color` cian; `:focus-visible` con outline cian de 2px, offset 3px y radio 4px; scrollbar fina (10px) con thumb blanco al 12% (hover 20%), cápsula, sin track. `theme-color` del head: `#0a0a0a`.

### FAB de WhatsApp
Círculo verde de 56px fijo en bottom 20 / left 20 (izquierda para no montarse con el chat de IntelliA, que vive a la derecha), glow verde permanente, icono 26px. Hover crece a 1.06, active 0.94. Presente y visible en TODA página pública.

### Footer
Grilla 2fr/1fr/1fr/1fr sobre `border-top`, columnas rotuladas en mono-label; bottom bar mono 13px `text-muted`. Cierra con `.footer-legal`: mono 12px lh 1.8 con la identidad completa (S.A.S., RUC, dirección, teléfono, correo), links subrayados con offset 3px que se tiñen de cian en hover, y `padding-bottom: 76px` de colchón sobre los botones flotantes.

## Do's and Don'ts

### Do:
- **Do** mantener intactos en toda página: meta `google-site-verification` (solo index), JSON-LD, `hreflang` es/en/x-default + canonical, y `<script defer src="/_vercel/insights/script.js">` antes de `</body>`.
- **Do** incluir el FAB de WhatsApp (56px, bottom 20 / left 20) visible en toda página pública, y la línea legal `.footer-legal` con RUC 1793236353001 y `padding-bottom: 76px`.
- **Do** envolver todo efecto hover en `@media (hover: hover) and (pointer: fine)` y dar a todo control su press state (`:active` scale 0.97).
- **Do** respetar `prefers-reduced-motion`: animaciones/transiciones a 0.01ms y reveals visibles sin desplazamiento.
- **Do** usar `tabular-nums` en cualquier cifra, `text-wrap: balance` en titulares y `pretty` en leads, y máximos de 52–70ch en párrafos.
- **Do** acompañar cada cifra estimada con su asterisco y nota referencial; la honestidad es parte del diseño.

### Don't:
- **Don't** usar eyebrows/kickers sobre titulares; el reemplazo es el chip vivo (control real) o el mono-label de datos (ver La Regla Anti-Eyebrow).
- **Don't** inventar testimonios, clientes, logos ni métricas (compromiso de PRODUCT.md; los testimonios reales están pendientes).
- **Don't** usar sombras grises o negras: solo glows del color del elemento (La Regla del Brillo Ganado).
- **Don't** añadir un segundo halo o brillo ambiental por página (La Regla del Halo Único).
- **Don't** usar Fraunces en párrafos ni más de un acento itálico cian por titular.
- **Don't** animar `max-height` o padding en despliegues: `grid-template-rows 0fr→1fr` con el aire dentro del contenido medido.
- **Don't** reabrir la dirección visual (plano vivo, chat como página, tableros u otros experimentos): fueron ofrecidos y declinados el 21 ago 2026; no reproponer sin que Paul lo pida.
