# Cuando algo se cae — el cuaderno de guardia

Lo que hay que mirar, en orden, cuando una copia de Intellectum deja de
responder o alguien avisa que "el bot no contesta". Escrito después de que el
WhatsApp de un cliente estuvo restringido cuatro meses sin que nadie lo viera.

## 1. Primero, /api/salud

```bash
curl -s -H "Authorization: Bearer $SALUD_TOKEN" https://www.intellectum.ec/api/salud | python3 -m json.tool
```

(`SALUD_TOKEN` o, si no existe, `CRON_SECRET`, los de esa copia en Vercel.)
Responde 200 si todo está bien y 503 si algo no. Cinco revisiones:

| revisión       | qué significa que falle                                            | qué hacer                                                                 |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `base`         | Supabase no contesta o la copia no existe en `clientes`            | Supabase → proyecto pausado (plan gratuito) o `SUPABASE_URL`/clave mal      |
| `whatsapp`     | token rechazado, número desconectado o calidad RED                 | Meta → WhatsApp Manager → Números. Token: generar uno nuevo de sistema     |
| `cerebro`      | `ANTHROPIC_API_KEY` ausente o rechazada                            | console.anthropic.com → Keys; revisar crédito                              |
| `agenda`       | nunca falla: "dormida" solo avisa que no hay credenciales de Google | `scripts/conectar-agenda.mjs` si esa copia debe agendar                    |
| `tarea_diaria` | ningún latido en 36 h                                              | GitHub → Actions → "Tareas diarias" → Run workflow; ver secreto CRON_SECRET |

## 2. Quién avisa y por dónde

`lib/alertas.js` manda cada alarma a todo lo configurado en la copia:
`OPERADOR_WEBHOOK_URL` (POST JSON), `OPERADOR_EMAIL` (o `LEADS_EMAIL`) y el
WhatsApp de `EQUIPO_WHATSAPP`. Misma alarma, diez minutos de silencio. Todas
quedan además como evento `alerta_operador` en la bitácora (panel → resumen).

Alarmas que existen hoy y qué las dispara:

- **WhatsApp no pudo enviar un mensaje**: Meta devolvió error al enviar. Suele
  ser token vencido (401), número restringido (131049/131048) o ventana de 24 h
  cerrada sin plantilla (131047).
- **Meta no entregó un mensaje (error N)**: Meta aceptó y luego reportó
  `failed` por el webhook. Mismos códigos.
- **Un mensaje de WhatsApp no se pudo atender**: el modelo o la base fallaron
  al responder; la persona recibió disculpas y el contacto.
- **Un mensaje entró por la copia equivocada / por un número que no es el de
  esta copia**: el webhook de Meta apunta a la copia que no es. Apuntar cada
  número a su copia (Meta → app → Webhooks).
- **El respaldo semanal falló / no se pudo enviar**: domingo 07:00. Revisar
  `RESEND_API_KEY` y `LEADS_EMAIL`.
- **La revisión de salud encontró fallas**: la Action diaria llamó a
  `/api/salud?alertar=si` y algo dio 503.

## 3. Los crons

Dos tareas diarias, disparadas dos veces cada una (Vercel y GitHub Actions),
porque el cron de Vercel en plan Hobby puede no disparar:

| hora Ecuador | endpoint             | hace                                                 |
| ------------ | -------------------- | ---------------------------------------------------- |
| 07:00        | `/api/recordatorios` | recordatorios de cita, retención de datos, respaldo (dom) |
| 10:00        | `/api/seguimientos`  | seguimiento a leads sin respuesta                    |

Cada corrida deja un evento `tarea_diaria`; si `HEARTBEAT_URL` existe, también
pega al servicio de latidos. Si la Action falla por "Falta el secreto", el
repo no tiene `CRON_SECRET` en Settings → Secrets.

## 4. Lo que NO hay que hacer

- No mandar tokens ni claves por chat (ni a Claude ni a nadie). Se pegan en
  Vercel → Settings → Environment Variables y se redespliega.
- No "arreglar" una copia de cliente cambiando el webhook de Meta a la copia
  de casa: la casa ya no atiende números ajenos (`atiendeAlSlug`), y aunque
  lo hiciera, contestaría desde el número equivocado.
- No borrar eventos de la bitácora para "limpiar": son la única memoria de lo
  que pasó cuando nadie miraba.
