# Intellectum — sitio + asistente IntelliA

Este proyecto es el sitio de intellectum.ec **más** un asistente de IA que
conversa con los visitantes, los califica y captura sus datos de contacto.

El asistente se llama **IntelliA** y funciona con Claude. Un solo "cerebro"
(`lib/brain.js`) atiende el chat de la web y WhatsApp, sin duplicar reglas ni
información. El mismo repo se despliega una vez por cliente ("modelo madre"):
con `CLIENTE_SLUG` y las variables `NEGOCIO_*` la copia habla, firma y cobra
como ese negocio (ver `docs/ALTA-CLIENTE.md`). Cómo se vigila que siga viva:
`docs/RUNBOOK.md`.

---

## 1. Qué hace y qué no hace

**Hace:**

- Conversa en el chat del sitio, en español de Ecuador, con mensajes cortos.
- Averigua sector, proceso a automatizar, tamaño y urgencia, conversando.
- Propone la consultoría gratuita de 30 minutos y pide nombre + contacto.
- Entrega cada lead ya estructurado (nombre, empresa, sector, necesidad,
  urgencia y un resumen de la conversación).
- Responde preguntas de servicios y proceso **solo** con lo que dice
  `lib/ficha.js`. Si no está ahí, no lo inventa: lo deriva al equipo.

**También hace, desde 2026:**

- Agenda en Google Calendar (`lib/agendar.js`) y manda confirmación por correo
  o por WhatsApp.
- Pasa la conversación a una persona (`lib/traspaso.js`) y la devuelve al bot.
- Cotiza al instante con las tarifas de `lib/precios.js` (solo la copia de
  casa; las copias de clientes dicen únicamente las cifras escritas en su
  ficha).
- Da seguimiento a quien dejó datos (`api/seguimientos.js`) y recuerda citas
  (`api/recordatorios.js`).

**No hace:**

- No atiende Instagram ni Messenger. Solo WhatsApp (API oficial) y el chat web.
- No hace llamadas: el módulo de voz está en lista de espera desde que Dapta
  cerró (agosto de 2026).

**Cómo se cuenta lo que se vende.** Cada plan incluye un número de
conversaciones al mes (`lib/precios.js`). Una conversación son todos los
mensajes de una misma persona (su número de WhatsApp o su sesión web) dentro
de una ventana de 24 horas desde el primero que el agente respondió; si vuelve
después, es otra. Un mensaje sin respuesta del agente, y lo que escribe una
persona desde el panel, no cuentan. El contador vive en `lib/almacen.js`
(`contarConversacion`, evento `conversacion`) y el panel lo muestra contra el
tope del plan. Prueba: `node scripts/probar-conversaciones.mjs`.

---

## 2. Probarlo en tu computadora

Necesitas una llave de la API de Claude. Se saca en
<https://console.anthropic.com> → **Settings → API Keys → Create Key**.
Cópiala una sola vez (después no se vuelve a mostrar).

```bash
cd ~/intellectum-web
npm install
cp .env.example .env        # pega tu llave dentro de .env
npm run dev
```

Abre <http://localhost:3000> y haz clic en **"Habla con IntelliA"** abajo a la
derecha.

---

## 3. Publicarlo en Vercel

El sitio ya vive en Vercel. Hay dos caminos:

**A. Conectar esta carpeta al proyecto que ya existe** (recomendado)

```bash
npm i -g vercel
cd ~/intellectum-web
vercel link          # elige el proyecto de intellectum.ec que ya tienes
vercel --prod
```

**B. Subirlo a GitHub y conectarlo desde el panel de Vercel**

```bash
cd ~/intellectum-web
git init && git add -A && git commit -m "Sitio + asistente IntelliA"
gh repo create intellectum-web --private --source=. --push
```

Luego, en vercel.com → tu proyecto → *Settings → Git* → conecta el repositorio.
Desde ahí cada `git push` publica solo.

**Antes de publicar, define las variables de entorno** en
vercel.com → tu proyecto → **Settings → Environment Variables**:

| Variable            | Obligatoria | Para qué                                        |
| ------------------- | ----------- | ----------------------------------------------- |
| `ANTHROPIC_API_KEY` | Sí          | Sin esto el chat contesta "no está configurado". |
| `ANTHROPIC_MODEL`   | No          | Cambiar de modelo (ver punto 6).                 |
| `RESEND_API_KEY`    | No          | Enviar los leads por correo.                     |
| `LEADS_EMAIL`       | No          | A qué correo llegan los leads.                   |
| `LEADS_WEBHOOK_URL` | No          | Mandar los leads a n8n, Make, Sheets o tu CRM.   |

> No hace falta configurar ningún "build". Vercel detecta la carpeta `api/`
> y publica esas funciones junto al sitio estático.

---

## 4. Dónde llegan los leads

Por orden de esfuerzo:

1. **Siempre**: en vercel.com → tu proyecto → **Logs**, buscando
   `LEAD_INTELLECTUM`. Cero configuración, pero hay que entrar a mirar.
2. **Por correo** (recomendado): crea una cuenta gratis en
   <https://resend.com>, genera una API key y define `RESEND_API_KEY` +
   `LEADS_EMAIL=info@intellectum.ec`. Cada lead llega como email.
3. **A un webhook**: define `LEADS_WEBHOOK_URL` y recibirás un JSON por lead en
   n8n, Make, Zapier, una hoja de Google o tu CRM.

Puedes activar 2 y 3 a la vez.

---

## 5. Cambiar lo que el bot sabe

Todo lo que IntelliA puede afirmar está en **`lib/ficha.js`**. Es la misma
"Ficha de Configuración de Cliente" que usas con tus clientes, aplicada a
Intellectum. Editas ese archivo, publicas de nuevo, y el bot cambia.

Los campos de la ficha ya están completos (horarios, condiciones y métodos de
pago, ticket promedio, umbral de lead premium, aviso de privacidad). Si algún
día vuelves a marcar uno como `[PENDIENTE]`, el bot trata ese dato como "no lo
sé" y lo deriva al equipo en vez de inventarlo: es el comportamiento correcto,
pero le quita precisión.

El **carácter** del asistente (tono, flujo, reglas duras) está en
`lib/prompt.js`.

---

## 6. Cuánto cuesta

El modelo por defecto es **Claude Sonnet 5**: sigue las instrucciones con
precisión y permite cachear las instrucciones. Se cambia con la variable
`ANTHROPIC_MODEL` en Vercel, sin tocar código ni volver a desplegar.

| Modelo             | Entrada / salida por millón de tokens | Caché de instrucciones |
| ------------------ | ------------------------------------- | ---------------------- |
| `claude-haiku-4-5` | $1 / $5                               | no (ver abajo)         |
| `claude-sonnet-5`  | $3 / $15                              | sí                     |
| `claude-opus-5`    | $5 / $25                              | sí                     |

**Estimación** para una conversación de unos 10 mensajes con las reglas de este
proyecto (instrucciones ≈ 3.000 tokens y respuestas cortas): entre **4 y 6
centavos de dólar** con Sonnet 5, según el precio vigente. Es una estimación
con supuestos, no una factura. El consumo real de cada llamada queda anotado en
los registros de Vercel con la etiqueta `[USO]`, y el acumulado se ve en
console.anthropic.com → *Usage*.

**Por qué Haiku no sale tan barato como parece:** Anthropic solo guarda en
caché prefijos de al menos 4.096 tokens en Haiku 4.5, y nuestras instrucciones
pesan unos 3.000. Se quedan justo por debajo, así que con Haiku se pagan
completas en cada mensaje. En Sonnet 5 el mínimo baja a 1.024 tokens: entran en
caché y cuestan ~10% a partir del segundo mensaje. Por eso la diferencia entre
los dos es de un tercio, no de cinco veces como sugerirían las tarifas sueltas.

Se probaron ambos con conversaciones reales: Haiku respeta las reglas críticas
(nunca da precios) pero se salta las de estilo — escribe de más y se le escapan
modismos de otros países. Sonnet las cumple. Si algún día vuelves a Haiku, el
código detecta que no admite pensamiento adaptativo ni el parámetro de esfuerzo
y deja de enviárselos automáticamente.

---

## 7. Encender WhatsApp

`api/whatsapp.js` usa el mismo cerebro. Está dormido hasta que existan estas
cuatro variables en Vercel:

```
META_VERIFY_TOKEN     una frase secreta que inventas tú
META_APP_SECRET       Meta → tu app → Configuración básica
META_TOKEN            token permanente de la cuenta de WhatsApp
META_PHONE_NUMBER_ID  id del número emisor (lo da Meta)
```

En Meta for Developers registra el webhook apuntando a
`https://www.intellectum.ec/api/whatsapp` con ese mismo `META_VERIFY_TOKEN`.

La conversación por número se guarda en Supabase (`lib/almacen.js`), así que
sobrevive a que Vercel apague la instancia. En Meta, suscribe también el campo
`messages` con sus estados: el webhook anota los `failed` (mensajes que Meta
aceptó y no entregó) y le avisa al operador. Cada copia responde SOLO por su
propio número: si un mensaje entra por otro `phone_number_id`, no se contesta
y se alerta (ver `docs/RUNBOOK.md`).

---

## 8. Mapa de archivos

```
index.html          el sitio (idéntico al publicado + una línea al final)
chat-widget.js      la burbuja de chat: estilos y lógica del navegador
api/chat.js         endpoint del chat web (streaming)
api/whatsapp.js     webhook de WhatsApp (dormido)
lib/brain.js        el cerebro: llama a Claude, maneja la herramienta de leads
lib/prompt.js       carácter, reglas y flujo del asistente
lib/ficha.js        TODO lo que el bot sabe de Intellectum  ← edita aquí
lib/leads.js        a dónde se entregan los leads
dev-server.mjs      servidor local para probar (no se usa en producción)
```

---

## 9. Detalles técnicos

- La llave de Anthropic vive **solo en el servidor**. Nunca llega al navegador:
  por eso el chat necesita `api/chat.js` y no se puede resolver dentro del HTML.
- El endpoint tiene tres defensas: solo acepta peticiones desde los dominios de
  Intellectum, corta a los 30 mensajes por IP cada 10 minutos, y limita el
  tamaño de cada mensaje. Es protección razonable, no blindaje: si algún día hay
  abuso serio, el siguiente paso es una regla de firewall en Vercel.
- El lead no se extrae con expresiones regulares del texto: el modelo llama a
  una herramienta (`guardar_lead`) con esquema estricto, así que llega
  estructurado o no llega.
- Si un clasificador de seguridad de Anthropic rechazara una petición, está
  activado el respaldo automático a otro modelo (`fallbacks: "default"`), y si
  esa opción no estuviera disponible en la cuenta, el código reintenta sin ella
  en lugar de dejar al visitante sin respuesta.
- Cualquier enlace del sitio con `href="#chat"` abre el asistente. Sirve si
  algún día quieres que el botón "Consultoría gratis" abra el chat en vez de
  bajar al formulario.
