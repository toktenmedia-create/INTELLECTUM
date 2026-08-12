# Intellectum — sitio + asistente IntelliA

Este proyecto es el sitio de intellectum.ec **más** un asistente de IA que
conversa con los visitantes, los califica y captura sus datos de contacto.

El asistente se llama **IntelliA** y funciona con Claude. Un solo "cerebro"
(`lib/brain.js`) atiende hoy el chat de la web y mañana WhatsApp, sin duplicar
reglas ni información.

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

**No hace (todavía):**

- No agenda en un calendario. Toma los datos y el equipo coordina.
- No transfiere la conversación a un humano en vivo.
- No da precios. Por diseño: Intellectum cotiza a la medida.

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

Hay campos marcados `[PENDIENTE]` que conviene que completes:

- `horario_humano` y `tiempo_respuesta_humano` — qué le prometemos al prospecto.
- `condiciones_pago`, `metodos_pago`.
- `ticket_promedio` y `umbral_alto_valor` — para marcar leads premium.
- `aviso_privacidad` — enlace, si lo tienes.

Mientras digan `[PENDIENTE]`, el bot trata ese dato como "no lo sé" y lo deriva
al equipo. Es el comportamiento correcto, pero le quita precisión.

El **carácter** del asistente (tono, flujo, reglas duras) está en
`lib/prompt.js`.

---

## 6. Cuánto cuesta

El modelo por defecto es **Claude Haiku 4.5**, el más rápido y económico,
elegido para cuidar el gasto. Se cambia con la variable `ANTHROPIC_MODEL` en
Vercel, sin tocar código ni volver a desplegar.

| Modelo             | Entrada / salida por millón de tokens | Caché de instrucciones |
| ------------------ | ------------------------------------- | ---------------------- |
| `claude-haiku-4-5` | $1 / $5                               | no (ver abajo)         |
| `claude-sonnet-5`  | $3 / $15                              | sí                     |
| `claude-opus-5`    | $5 / $25                              | sí                     |

**Estimación** para una conversación de unos 10 mensajes con las reglas de este
proyecto (instrucciones ≈ 3.000 tokens y respuestas cortas): alrededor de
**4 centavos de dólar** con Haiku. Es una estimación con supuestos, no una
factura. Mira el gasto real en console.anthropic.com → *Usage* durante la
primera semana.

**Por qué la caché no ayuda con Haiku:** Anthropic solo guarda en caché
prefijos de al menos 4.096 tokens en Haiku 4.5, y nuestras instrucciones pesan
unos 3.000. Se quedan justo por debajo, así que se pagan completas en cada
mensaje. En Sonnet 5 el mínimo baja a 1.024 tokens y sí entrarían en caché
(~10% del precio a partir de la segunda llamada). Por eso Haiku sale a la mitad
del costo de Opus, no a la quinta parte como sugerirían las tarifas sueltas.

Haiku tampoco admite pensamiento adaptativo ni el parámetro de esfuerzo; el
código lo detecta y no se los envía. Si algún día cambias a Sonnet o a Opus,
esos ajustes se activan solos.

---

## 7. Encender WhatsApp más adelante

`api/whatsapp.js` ya está escrito y usa el mismo cerebro. Está dormido hasta
que existan estas cuatro variables en Vercel:

```
META_VERIFY_TOKEN     una frase secreta que inventas tú
META_APP_SECRET       Meta → tu app → Configuración básica
META_TOKEN            token permanente de la cuenta de WhatsApp
META_PHONE_NUMBER_ID  id del número emisor (lo da Meta)
```

En Meta for Developers registra el webhook apuntando a
`https://www.intellectum.ec/api/whatsapp` con ese mismo `META_VERIFY_TOKEN`.

Una advertencia honesta: la memoria de conversación por número vive en la
memoria de la función, así que se pierde si Vercel apaga la instancia (minutos
de inactividad). Para una conversación seguida alcanza; antes de darle volumen
real conviene mover esa memoria a Upstash Redis o Vercel KV. Está aislado en
dos funciones dentro de `api/whatsapp.js`.

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
