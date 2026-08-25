-- ═══════════════════════════════════════════════════════════════════════════
-- VARIOS CLIENTES A LA VEZ: cada uno con su ficha y su número de WhatsApp.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. Se puede correr
-- las veces que haga falta; no borra nada de lo que ya existe.
--
-- QUÉ HACE
-- 1. Añade whatsapp_phone_id a clientes: el identificador que Meta le da a
--    cada número de WhatsApp Business. Es lo que permite que un mensaje que
--    llega sepa DE QUÉ CLIENTE es. Sin esto, todos los mensajes que entren
--    por cualquier número se atienden como si fueran de Intellectum.
-- 2. Un índice único sobre esa columna: dos clientes no pueden compartir un
--    número, y si alguien lo intenta la base lo impide en vez de dejar que
--    los mensajes de uno caigan en el buzón del otro.
--
-- LA COLUMNA ficha YA EXISTE y hoy está vacía. Ahí va, en texto, lo que el
-- agente de ese cliente tiene que saber: quién es, qué vende, sus precios,
-- sus horarios, sus preguntas frecuentes. Si está vacía, el código usa la de
-- Intellectum (lib/ficha.js), que es como funciona hoy.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. DE QUIÉN ES CADA NÚMERO ─────────────────────────────────────────────

alter table clientes
  add column if not exists whatsapp_phone_id text;

comment on column clientes.whatsapp_phone_id is
  'El phone_number_id que Meta asigna al número de WhatsApp Business de este cliente. Llega en cada webhook, en metadata.phone_number_id.';


-- ─── 2. UN NÚMERO, UN CLIENTE ───────────────────────────────────────────────
-- Parcial (where ... is not null) para que los clientes sin WhatsApp puedan
-- convivir: sin eso, el segundo cliente sin número chocaría con el primero.

create unique index if not exists clientes_whatsapp_phone_id_idx
  on clientes (whatsapp_phone_id)
  where whatsapp_phone_id is not null;


-- ─── 3. DE QUÉ CLIENTE ES CADA NÚMERO ───────────────────────────────────────
-- No se rellena aquí a propósito: el identificador de un número no se inventa,
-- y este archivo vive en un repositorio público.
--
-- Mientras la columna esté vacía NO se rompe nada: un mensaje cuyo número no
-- coincida con ningún cliente se atiende como Intellectum, que es exactamente
-- como funciona hoy.
--
-- Al dar de alta el PRIMER cliente que no sea Intellectum hay que llenarla en
-- los dos, o los mensajes de ambos caerán en el mismo buzón. El valor sale de
-- Meta (Business Suite → Cuentas de WhatsApp → Números) o de la variable
-- META_PHONE_NUMBER_ID en el caso de Intellectum:
--
--   update clientes set whatsapp_phone_id = '<el id de Meta>' where slug = 'intellectum';
--   update clientes set whatsapp_phone_id = '<el id del cliente>' where slug = '<su slug>';


-- ─── 4. LOS PLANES NUEVOS, QUE LA BASE TODAVÍA NO ACEPTA ────────────────────
-- La tabla nació con un CHECK que solo permite 'esencial', 'operativo' y
-- 'plataforma'. Desde que la escalera pasó a cuatro puestos de trabajo, el
-- código usa 'asistente', 'recepcionista', 'asesor' y 'jefe_ventas', y la base
-- los RECHAZA. Hoy no se nota porque nadie escribe planes —la fila de
-- Intellectum sigue diciendo 'plataforma' y el código la traduce al vuelo—,
-- pero el primer cliente que se dé de alta con un plan nuevo falla.
--
-- Los nombres viejos se siguen aceptando a propósito: la fila que ya existe no
-- se toca, y planDe() en lib/planes.js los traduce.

alter table clientes drop constraint if exists clientes_plan_check;

alter table clientes
  add constraint clientes_plan_check
  check (plan in (
    'asistente', 'recepcionista', 'asesor', 'jefe_ventas',
    'esencial', 'operativo', 'plataforma'
  ));
