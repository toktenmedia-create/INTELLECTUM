-- ════════════════════════════════════════════════════════════════════════════
--  ESQUEMA DE LA PLATAFORMA — Intellectum
--  Fase 1: la memoria y el molde de cliente.
--
--  CÓMO SE APLICA (una sola vez, tú, en tu navegador):
--    1. Entra a supabase.com y abre tu proyecto.
--    2. Menú izquierdo → SQL Editor → New query.
--    3. Pega TODO este archivo y dale a "Run".
--    4. Si dice "Success. No rows returned", quedó.
--
--  Es seguro repetirlo: todo está escrito con IF NOT EXISTS, así que correrlo
--  dos veces no borra ni duplica nada.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. CLIENTES ────────────────────────────────────────────────────────────
-- Cada empresa que atiende la plataforma. Intellectum es el cliente número uno.
-- La ficha deja de ser un archivo de código y pasa a ser esta fila: dar de alta
-- un cliente es llenar un formulario, no publicar el sistema.

create table if not exists public.clientes (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,          -- 'intellectum', 'clinica-salud'
  nombre       text not null,
  plan         text not null default 'esencial'
               check (plan in ('esencial', 'operativo', 'plataforma')),
  ficha        text not null default '',      -- lo que el agente sabe decir
  activo       boolean not null default true,

  -- Relojes de borrado, en días. Los fija cada cliente porque legalmente el
  -- responsable del tratamiento es él, no Intellectum.
  dias_retencion_conversaciones int not null default 90,
  dias_retencion_adjuntos       int not null default 7,

  creado_en    timestamptz not null default now()
);


-- ─── 2. MIEMBROS ────────────────────────────────────────────────────────────
-- Quién puede ver los datos de qué cliente. Es la tabla de la que dependen
-- todas las reglas de seguridad de más abajo.

create table if not exists public.miembros (
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  rol         text not null default 'dueno' check (rol in ('dueno', 'operador', 'lectura')),
  creado_en   timestamptz not null default now(),
  primary key (cliente_id, usuario_id)
);


-- ─── 3. LEADS ───────────────────────────────────────────────────────────────

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,

  nombre          text default '',
  contacto        text default '',
  empresa         text default '',
  sector          text default '',
  cargo           text default '',
  necesidad       text default '',
  tamano_empresa  text default '',
  urgencia        text default 'no_indicada',
  resumen         text default '',

  canal           text default 'web',
  origen          text,
  sesion          text,

  -- Estado comercial. Lo mueve el panel, y más adelante el agente privado.
  estado          text not null default 'nuevo'
                  check (estado in ('nuevo', 'contactado', 'en_conversacion', 'ganado', 'perdido')),

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists leads_por_cliente_fecha
  on public.leads (cliente_id, creado_en desc);

create index if not exists leads_por_estado
  on public.leads (cliente_id, estado);


-- ─── 4. BITÁCORA ────────────────────────────────────────────────────────────
-- Todo lo que hace un agente queda escrito aquí. Es lo que te deja revisar el
-- panel y ver exactamente qué pasó. También es la constancia documental que
-- pide la ley ecuatoriana de protección de datos.

create table if not exists public.eventos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  tipo        text not null,      -- herramienta_ejecutada, herramienta_rechazada...
  actor       text not null,      -- agente_publico, agente_privado, panel
  detalle     jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now()
);

create index if not exists eventos_por_cliente_fecha
  on public.eventos (cliente_id, creado_en desc);


-- ─── 5. SEGURIDAD: QUE UN CLIENTE NO PUEDA VER LO DE OTRO ───────────────────
-- Esto es lo que hace que la plataforma sea multicliente de verdad. La regla no
-- vive en el código sino en la base: aunque una consulta esté mal escrita, la
-- base se niega a devolver filas ajenas.

alter table public.clientes enable row level security;
alter table public.miembros enable row level security;
alter table public.leads    enable row level security;
alter table public.eventos  enable row level security;

-- Función auxiliar: ¿a qué clientes pertenece quien está consultando?
create or replace function public.mis_clientes()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cliente_id from public.miembros where usuario_id = auth.uid();
$$;

drop policy if exists "ver mis clientes" on public.clientes;
create policy "ver mis clientes" on public.clientes
  for select using (id in (select public.mis_clientes()));

drop policy if exists "ver mis membresias" on public.miembros;
create policy "ver mis membresias" on public.miembros
  for select using (usuario_id = auth.uid());

drop policy if exists "ver leads de mis clientes" on public.leads;
create policy "ver leads de mis clientes" on public.leads
  for select using (cliente_id in (select public.mis_clientes()));

drop policy if exists "editar leads de mis clientes" on public.leads;
create policy "editar leads de mis clientes" on public.leads
  for update using (cliente_id in (select public.mis_clientes()));

drop policy if exists "ver eventos de mis clientes" on public.eventos;
create policy "ver eventos de mis clientes" on public.eventos
  for select using (cliente_id in (select public.mis_clientes()));

-- Nota: no hay política de INSERT para usuarios. Los leads y los eventos los
-- escribe el servidor con la clave de servicio, que pasa por encima de estas
-- reglas. Un visitante del sitio jamás escribe directo en la base.


-- ─── 6. BORRADO AUTOMÁTICO (ley de protección de datos) ─────────────────────
-- Función que limpia lo vencido según los relojes de cada cliente. Todavía no
-- se ejecuta sola: en la fase 6 la llama un cron de Cloudflare una vez al día.
-- Puedes correrla a mano cuando quieras: select public.limpiar_vencidos();

create or replace function public.limpiar_vencidos()
returns table (tabla text, borrados bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
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


-- ─── 7. EL PRIMER CLIENTE ───────────────────────────────────────────────────

insert into public.clientes (slug, nombre, plan)
values ('intellectum', 'Intellectum AI Solutions', 'plataforma')
on conflict (slug) do nothing;
