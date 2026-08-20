/**
 * LO QUE LLEGA POR WHATSAPP ADEMÁS DE TEXTO.
 *
 * La gente no escribe ensayos por WhatsApp: manda fotos, notas de voz, videos,
 * PDFs y stickers. Este módulo convierte cada tipo de mensaje en algo que el
 * cerebro (lib/brain.js) pueda entender, y dice la verdad cuando no puede:
 *
 *   - Fotos y stickers  → el modelo los VE de verdad (visión nativa).
 *   - PDFs              → el modelo los LEE de verdad (hasta 8 MB).
 *   - Notas de voz      → se transcriben con Whisper en Cloudflare si están
 *                         las variables CLOUDFLARE_ACCOUNT_ID y
 *                         CLOUDFLARE_AI_TOKEN. Sin ellas, IntelliA pide con
 *                         amabilidad que se lo escriban. Misma regla de toda
 *                         la casa: lo que no está configurado, duerme.
 *   - Videos            → ningún modelo de Claude ve video. IntelliA responde
 *                         el texto que acompañe y pide que le cuenten.
 *
 * Cada caso devuelve dos cosas y la diferencia importa:
 *   bloques → lo que el modelo recibe AHORA (puede incluir la imagen entera).
 *   memoria → lo que se guarda en el historial (solo texto: guardar la foto
 *             en la memoria la volvería a mandar al modelo en cada mensaje
 *             siguiente, pagando la imagen una y otra vez).
 */

// Una sola versión del Graph API para todo el proyecto. v25.0 está vigente
// hasta julio de 2028; cuando toque subirla, se cambia solo aquí.
export const GRAPH = "https://graph.facebook.com/v25.0";

// Límites en bytes. Los de imagen y PDF los pone la API de Claude; el de audio
// es holgado: una nota de voz de un minuto pesa menos de 1 MB.
const LIMITE = {
  imagen: 5 * 1024 * 1024,
  documento: 8 * 1024 * 1024,
  audio: 12 * 1024 * 1024,
};

// Los únicos formatos de imagen que la API de Claude acepta. WhatsApp entrega
// las fotos como JPEG o PNG y los stickers como WebP, así que en la práctica
// todo pasa; la lista existe por si Meta agrega un formato nuevo mañana.
const IMAGENES_ACEPTADAS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * Convierte un mensaje de WhatsApp en la entrada para el cerebro.
 *
 * @returns {Promise<{bloques: string|Array, memoria: string} | null>}
 *   null significa "esto no se responde" (una reacción con emoji, por ejemplo:
 *   contestar a un 👍 con un párrafo sería de robot ansioso).
 */
export async function prepararEntrada(mensaje) {
  switch (mensaje.type) {
    case "text": {
      const texto = mensaje.text?.body?.trim().slice(0, 2000);
      if (!texto) return null;
      return { bloques: texto, memoria: texto };
    }

    // Respuestas a botones y listas: el título elegido ES el mensaje.
    case "interactive": {
      const eleccion =
        mensaje.interactive?.button_reply?.title ?? mensaje.interactive?.list_reply?.title;
      if (!eleccion) return null;
      return { bloques: eleccion, memoria: eleccion };
    }
    case "button": {
      const texto = mensaje.button?.text?.trim();
      if (!texto) return null;
      return { bloques: texto, memoria: texto };
    }

    case "image":
      return await prepararImagen(mensaje.image, "una foto");

    case "sticker": {
      // Un sticker animado es un WebP animado y la API lo rechaza; uno normal
      // es una imagen como cualquier otra.
      if (mensaje.sticker?.animated) {
        return {
          bloques:
            "(La persona respondió con un sticker animado que no puedes ver. " +
            "Sigue la conversación con naturalidad, sin darle muchas vueltas al sticker.)",
          memoria: "[Envió un sticker animado]",
        };
      }
      return await prepararImagen(mensaje.sticker, "un sticker");
    }

    case "document":
      return await prepararDocumento(mensaje.document);

    case "audio":
      return await prepararAudio(mensaje.audio);

    case "video": {
      const pie = mensaje.video?.caption?.trim();
      return {
        bloques:
          "(La persona envió un video, y los videos no los puedes ver. " +
          (pie ? `Lo acompañó con este texto: "${pie.slice(0, 500)}". Responde al texto y ` : "Discúlpate en una línea y ") +
          "pídele que te cuente por escrito lo que quería mostrarte.)",
        memoria: pie ? `[Envió un video] ${pie.slice(0, 500)}` : "[Envió un video]",
      };
    }

    case "location": {
      const u = mensaje.location ?? {};
      const donde = [u.name, u.address].filter(Boolean).join(", ");
      const descripcion = donde || `latitud ${u.latitude}, longitud ${u.longitude}`;
      return {
        bloques: `(La persona compartió su ubicación: ${descripcion}. Úsala si viene al caso y sigue la conversación.)`,
        memoria: `[Compartió su ubicación: ${descripcion}]`,
      };
    }

    case "contacts":
      return {
        bloques:
          "(La persona compartió una tarjeta de contacto. Agradécele y pregúntale " +
          "qué necesita para esa persona o empresa.)",
        memoria: "[Compartió un contacto]",
      };

    // Reacciones (👍 a un mensaje): no son conversación, no se responden.
    case "reaction":
      return null;

    default:
      return {
        bloques:
          "(La persona envió un tipo de mensaje que no puedes abrir. Discúlpate " +
          "en una línea y pídele que te lo mande como texto o foto.)",
        memoria: "[Envió un mensaje de tipo no soportado]",
      };
  }
}

// ─── fotos y stickers ────────────────────────────────────────────────────────

async function prepararImagen(adjunto, queEs) {
  const medio = await descargarMedio(adjunto?.id, LIMITE.imagen).catch((err) => {
    console.error("[MULTIMEDIA] no se pudo descargar la imagen:", err?.message ?? err);
    return null;
  });

  if (!medio || !IMAGENES_ACEPTADAS.includes(medio.mime)) {
    return {
      bloques: `(La persona envió ${queEs} que no se pudo abrir. Discúlpate en una línea y pídele que la reenvíe o te lo cuente por escrito.)`,
      memoria: `[Envió ${queEs} que no se pudo abrir]`,
    };
  }

  const pie = adjunto.caption?.trim().slice(0, 1000);
  return {
    bloques: [
      { type: "image", source: { type: "base64", media_type: medio.mime, data: medio.base64 } },
      {
        type: "text",
        text:
          pie ??
          `(La persona envió ${queEs} sin escribir nada. Reacciona con naturalidad a lo que ves y sigue la conversación hacia tu objetivo.)`,
      },
    ],
    memoria: pie ? `[Envió ${queEs}] ${pie}` : `[Envió ${queEs}]`,
  };
}

// ─── documentos ──────────────────────────────────────────────────────────────

async function prepararDocumento(adjunto) {
  const nombre = adjunto?.filename?.slice(0, 120) ?? "un archivo";
  const pie = adjunto?.caption?.trim().slice(0, 1000);

  // Solo PDF: es lo único que el modelo lee nativo, y es lo que la gente
  // realmente manda (RUCs, proformas, facturas).
  if (adjunto?.mime_type?.split(";")[0].trim() !== "application/pdf") {
    return {
      bloques: `(La persona envió un archivo llamado "${nombre}" en un formato que no puedes abrir. Solo puedes leer PDFs: pídele que lo convierta o te cuente qué contiene.)`,
      memoria: `[Envió un archivo que no se pudo abrir: ${nombre}]`,
    };
  }

  const medio = await descargarMedio(adjunto.id, LIMITE.documento).catch((err) => {
    console.error("[MULTIMEDIA] no se pudo descargar el documento:", err?.message ?? err);
    return null;
  });

  if (!medio) {
    return {
      bloques: `(La persona envió un PDF llamado "${nombre}" pero no se pudo abrir — quizá es muy pesado. Discúlpate en una línea y pídele un resumen por texto.)`,
      memoria: `[Envió un PDF que no se pudo abrir: ${nombre}]`,
    };
  }

  return {
    bloques: [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: medio.base64 },
      },
      {
        type: "text",
        text: pie ?? `(La persona envió este PDF, "${nombre}", sin escribir nada. Léelo, comenta lo relevante en una o dos líneas y sigue la conversación.)`,
      },
    ],
    memoria: pie ? `[Envió el PDF "${nombre}"] ${pie}` : `[Envió el PDF "${nombre}"]`,
  };
}

// ─── notas de voz ────────────────────────────────────────────────────────────

function transcripcionConfigurada() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN);
}

async function prepararAudio(adjunto) {
  const sinOido = {
    bloques:
      "(La persona envió una nota de voz y todavía no puedes escuchar audios. " +
      "Discúlpate en una línea, con calidez, y pídele que te lo escriba.)",
    memoria: "[Envió una nota de voz que no se pudo escuchar]",
  };

  if (!transcripcionConfigurada()) return sinOido;

  try {
    const medio = await descargarMedio(adjunto?.id, LIMITE.audio);
    const texto = await transcribir(medio.base64);
    if (!texto) return sinOido;

    return {
      bloques: `(Nota de voz de la persona, transcrita automáticamente): ${texto}`,
      memoria: `[Nota de voz]: ${texto}`,
    };
  } catch (err) {
    console.error("[MULTIMEDIA] falló la transcripción:", err?.message ?? err);
    return sinOido;
  }
}

/** Whisper en Cloudflare Workers AI. Entra el audio en base64, sale el texto. */
async function transcribir(base64) {
  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID;
  const respuesta = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/@cf/openai/whisper-large-v3-turbo`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_AI_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio: base64 }),
    },
  );

  if (!respuesta.ok) {
    throw new Error(`Cloudflare respondió ${respuesta.status}: ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  return datos?.result?.text?.trim().slice(0, 2000) ?? null;
}

// ─── descarga desde Meta ─────────────────────────────────────────────────────

/**
 * Meta no manda el archivo en el webhook: manda un id. Con el id se pide la
 * dirección real (que caduca en 5 minutos) y con la dirección se baja el
 * archivo. Dos viajes, los dos con el token.
 */
async function descargarMedio(id, limite) {
  if (!id) throw new Error("mensaje sin id de medio");
  const cabecera = { Authorization: `Bearer ${process.env.META_TOKEN}` };

  const ficha = await fetch(`${GRAPH}/${id}`, { headers: cabecera });
  if (!ficha.ok) throw new Error(`Meta respondió ${ficha.status} al pedir el medio`);
  const meta = await ficha.json();

  if (meta.file_size && meta.file_size > limite) {
    throw new Error(`el archivo pesa ${meta.file_size} bytes y el límite es ${limite}`);
  }

  const archivo = await fetch(meta.url, { headers: cabecera });
  if (!archivo.ok) throw new Error(`Meta respondió ${archivo.status} al descargar`);

  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.length > limite) {
    throw new Error(`el archivo pesa ${bytes.length} bytes y el límite es ${limite}`);
  }

  return {
    mime: (meta.mime_type ?? "").split(";")[0].trim(),
    base64: bytes.toString("base64"),
  };
}
