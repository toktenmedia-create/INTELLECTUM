# Dar de alta un cliente — la lista

Una copia nueva del repo, con su propio nombre, número, agenda y datos. Nada
del cliente pasa por la copia de casa. Orden real, sin saltos.

## Antes de tocar nada

- [ ] Plan contratado y firmado (`asistente`, `recepcionista`, `asesor` o
      `jefe_ventas`; ver `lib/planes.js`). Sin plan, la copia arranca como
      `asistente` y esconde lo que no incluye.
- [ ] Ficha del negocio en texto plano: qué vende, precios que SÍ puede decir
      el agente, horarios, dirección, preguntas de calificación, quién NO es
      prospecto. Con eso se llena la columna `ficha` en `clientes`.
- [ ] Aviso de privacidad y condiciones del cliente publicados en SU sitio
      (o acordado que Intellectum se los aloja). Sin URL, el chat no enlaza nada.

## En Supabase (una vez por cliente)

- [ ] Fila en `clientes`: `slug`, `nombre`, `plan`, `ficha`, `activo = true`.
- [ ] Cuando tenga número: `whatsapp_phone_id` = el `phone_number_id` de Meta.

## En Vercel (proyecto nuevo, mismo repo)

Variables mínimas (`.env.example` explica cada una):

```
CLIENTE_SLUG, NEGOCIO_NOMBRE, NEGOCIO_NOMBRE_CORTO, NEGOCIO_AGENTE,
NEGOCIO_EVENTO, NEGOCIO_CITA, NEGOCIO_CORREO, NEGOCIO_WHATSAPP, SITIO_URL,
NEGOCIO_PLAN, NEGOCIO_TRATO (tu/usted),
NEGOCIO_AVISO_URL, NEGOCIO_CONDICIONES_URL, NEGOCIO_PIXEL_ID (si mide),
SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY,
PANEL_TOKEN (la del cliente), AGENTE_PRIVADO_TOKEN (solo casa), CRON_SECRET, SALUD_TOKEN,
RESEND_API_KEY, LEADS_EMAIL (el correo del cliente),
OPERADOR_EMAIL / OPERADOR_WEBHOOK_URL (los de Intellectum, no del cliente),
EQUIPO_WHATSAPP (el del cliente: a él le llegan los leads)
```

Con WhatsApp: `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_TOKEN`,
`META_PHONE_NUMBER_ID` (el de ESE número, no el de casa).
Con agenda: `scripts/conectar-agenda.mjs`.

- [ ] `ALLOWED_ORIGINS` con el dominio del cliente si el chat va incrustado
      en su sitio (los `*.vercel.app` ajenos ya no entran).

## En Meta (si tiene WhatsApp)

- [ ] Número verificado dentro del portafolio del cliente (no del de Intellectum).
- [ ] Webhook apuntando a `https://<copia>/api/whatsapp` con su `META_VERIFY_TOKEN`.
- [ ] Campos suscritos: `messages` (trae también los estados `failed`).
- [ ] Plantillas aprobadas con el nombre del cliente (`lib/mensajeria.js`
      las nombra; sin plantilla no hay recordatorios fuera de la ventana de 24 h).

## En GitHub

- [ ] Repo (o rama) de la copia con el secreto `CRON_SECRET` y la variable
      `SITIO_URL`, para que `.github/workflows/tarea-diaria.yml` dispare.

## Comprobar antes de entregar

```bash
npm test                                   # lo que se puede probar sin red
curl -H "Authorization: Bearer $SALUD_TOKEN" https://<copia>/api/salud
```

- [ ] `/api/negocio` devuelve el nombre del cliente, sin rastro de Intellectum.
- [ ] Una conversación de prueba por web y otra por WhatsApp: se presenta como
      su agente, no da cifras que no estén en la ficha, agenda o pide contacto.
- [ ] El panel (`/panel`) entra con su `PANEL_TOKEN` y muestra el plan.
- [ ] Un mensaje de prueba de WhatsApp mal enviado (número inválido) hace
      sonar la alarma del operador. Si no suena, revisar `OPERADOR_*`.

## Entregar al cliente

- Su clave del panel (por un canal que no sea el chat), la lista de lo que el
  agente hace y no hace en su plan, y a quién escribir cuando algo falle.
- Cada clave generada se copia también al respaldo local de claves
  (`~/Desktop/INTELLECTUM/CLAVES/claves-intellectum.txt`, fuera de git).
