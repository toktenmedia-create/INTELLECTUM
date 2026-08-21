# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dueños y gerentes de pymes ecuatorianas (comercio, servicios, salud, educación, inmobiliario) que pierden ventas por no contestar a tiempo. Evalúan desde el celular, muchas veces desde WhatsApp o redes; no son técnicos y desconfían de promesas infladas de "IA". Audiencia secundaria: empresas medianas que buscan un proveedor local serio.

## Product Purpose

Intellectum AI Solutions (intellectum.ec) vende agentes de IA que atienden, responden y agendan por sus clientes (WhatsApp, web, voz). El sitio existe para una sola conversión: que el visitante hable con IntelliA —la agente de IA propia— y agende la consultoría gratuita de 30 minutos. Éxito = cita agendada en el calendario.

## Positioning

El sitio ES la demo: IntelliA atiende al visitante en vivo, responde, captura el lead y agenda la cita sola, 24/7. Ninguna agencia local puede copiar esa afirmación sin tener el producto funcionando. Empresa formal ecuatoriana (S.A.S., RUC 1793236353001, Quito).

## Operating Context

Visitantes llegan desde WhatsApp, redes y búsqueda, mayoritariamente en móvil. El flujo real: ver la página → abrir el chat con IntelliA (pestaña /chat) o WhatsApp (+593 98 312 0003) → conversar → agendar. Detrás: Vercel (HTML estático + funciones), Supabase, Google Calendar, WhatsApp Cloud API, Resend.

## Capabilities and Constraints

- Confirmado y funcionando: chat web con IntelliA, agendado real con confirmación por correo (.ics), captura de leads, WhatsApp.
- PROHIBIDO inventar cifras, clientes, testimonios, métricas o logos de clientes. Los testimonios están pendientes (Paul los está consiguiendo); no fabricar.
- HTML/CSS/JS estático sin framework ni build step; cada página es un archivo. Mantener: meta tag de Google Search Console en index.html, script de Vercel Analytics, JSON-LD, hreflang es/en, sitemap.
- Español ecuatoriano primero; en.html es la versión en inglés y debe mantenerse en paridad.
- Botón de WhatsApp siempre visible en el sitio público.

## Brand Commitments

- Nombre: Intellectum AI Solutions; la agente se llama IntelliA.
- Logo existente: cerebro de circuitos (logo-nav.webp, favicon.svg).
- Identidad incumbente: fondo oscuro, acento cian, tipografías Fraunces (display) + Geist (texto) + Geist Mono.
- Restricción visual vinculante del dueño (20 ago 2026): quiere una página "muy bien diseñada y futurista"; el diseño de todo lo de Intellectum pasa por las skills emil-design-eng + impeccable, luego taste.
- Preferencia permanente (ronda de dirección, 21 ago 2026): Paul eligió el estándar de la categoría ejecutado impecable — la landing oscura de IA con acento cian, sin experimentos de mundo visual. Listón de acabado: Linear (linear.app) y Vercel (vercel.com). Direcciones experimentales (plano vivo, chat como página, tableros) fueron ofrecidas y declinadas; no reproponer sin que él lo pida.
- Voz: español claro, directo, sin humo tecnológico; se habla de resultados de negocio, no de modelos.

## Evidence on Hand

- Producto real demostrable: el chat /chat funciona en producción y agenda citas reales.
- Blog con 3 artículos reales (blog/*.html). Datos legales reales (RUC, dirección Gaspar de Carvajal S1-10 y Guayaquil, Quito). Correo info@intellectum.ec.
- NO hay todavía: testimonios, logos de clientes, métricas de casos. No fabricar ninguno.

## Product Principles

1. La demo vale más que el discurso: mostrar a IntelliA trabajando antes que describirla.
2. Una sola conversión: todo camino termina en "habla con IntelliA / agenda tu consultoría".
3. Verdad verificable: cada afirmación del sitio debe ser cierta hoy, no aspiracional.
4. Móvil primero: el visitante típico llega desde el celular vía WhatsApp o redes.
5. El sitio es la vitrina del craft: si la página se siente premium, el producto se asume premium.
