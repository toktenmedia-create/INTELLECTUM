-- ═══════════════════════════════════════════════════════════════════════════
-- MEMORIA DE CONVERSACIONES
--
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. Se puede correr
-- las veces que haga falta; no borra nada de lo que ya existe.
--
-- POR QUÉ HACE FALTA
-- En el chat de la web el navegador manda el historial completo en cada
-- mensaje, así que el servidor no necesita acordarse de nada. En WhatsApp no:
-- cada mensaje llega solo y quien tiene que recordar lo anterior es el
-- servidor. Guardarlo en la memoria del proceso no sirve, porque Vercel apaga
-- y enciende instancias sin avisar: el resultado sería IntelliA preguntándole
-- el nombre tres veces a la misma persona.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. LA TABLA ────────────────────────────────────────────────────────────
-- Una fila por persona y canal. Los mensajes van en un jsonb porque siempre se
-- leen y se escriben completos: nunca hace falta pedir "el tercer mensaje".

create table if not exists public.conversaciones (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  canal          text not null,                    -- whatsapp, web, instagram
  sesion         text not null,                    -- el número, o el id de sesión
  nombre_perfil  text,                             -- como se llama en WhatsApp
  mensajes       jsonb not null default '[]'::jsonb,
  actualizado_en timestamptz not null default now(),
  creado_en      timestamptz not null default now(),

  -- Una sola conversación por persona y canal. Esto es lo que permite escribir
  -- con upsert sin leer antes, y lo que impide que dos mensajes que llegan casi
  -- a la vez creen dos filas para el mismo número.
  unique (cliente_id, canal, sesion)
);

create index if not exists conversaciones_por_cliente_fecha
  on public.conversaciones (cliente_id, actualizado_en desc);


-- ─── 2. SEGURIDAD ───────────────────────────────────────────────────────────
-- Mismas reglas que el resto: nadie ve conversaciones de un cliente ajeno, y la
-- regla vive en la base, no en el código. Escribe solo el servidor con la clave
-- de servicio; no hay política de INSERT para usuarios a propósito.

alter table public.conversaciones enable row level security;

drop policy if exists "ver conversaciones de mis clientes" on public.conversaciones;
create policy "ver conversaciones de mis clientes" on public.conversaciones
  for select using (cliente_id in (select public.mis_clientes()));


-- ─── 3. BORRADO AUTOMÁTICO ──────────────────────────────────────────────────
-- Se reemplaza limpiar_vencidos() para que también barra las conversaciones
-- muertas, con el mismo reloj que ya tiene cada cliente (90 días por defecto).
-- Sin esto, guardar el historial sería acumular datos personales sin plazo, que
-- es exactamente lo que la ley prohíbe.

create or replace function public.limpiar_vencidos()
returns table (tabla text, borrados bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  -- Conversaciones sin actividad. El reloj cuenta desde el último mensaje, no
  -- desde el primero: quien sigue escribiendo no pierde su historial.
  with borradas as (
    delete from public.conversaciones v
    using public.clientes c
    where v.cliente_id = c.id
      and v.actualizado_en < now() - (c.dias_retencion_conversaciones || ' days')::interval
    returning 1
  )
  select count(*) into n from borradas;

  tabla := 'conversaciones'; borrados := n; return next;

  -- Bitácora: se conserva lo mismo que las conversaciones de cada cliente.
  with borrados as (
    delete from public.eventos e
    using public.clientes c
    where e.cliente_id = c.id
      and e.creado_en < now() - (c.dias_retencion_conversaciones || ' days')::interval
    returning 1
  )
  select count(*) into n from borrados;

  tabla := 'eventos'; borrados := n; return next;

  -- Los leads NO se borran por tiempo: se borran cuando termina la relación
  -- comercial o cuando la persona lo pide. Eso se hace desde el panel, a
  -- propósito, para que nadie pierda un cliente por un reloj mal puesto.
end;
$$;
