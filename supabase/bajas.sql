-- ═══════════════════════════════════════════════════════════════════════════
-- LAS BAJAS: quién pidió que no le escribamos.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. Se puede correr
-- las veces que haga falta; no borra nada de lo que ya existe.
--
-- POR QUÉ HACE FALTA
-- Cuando alguien escribe SALIR por WhatsApp, esa decisión tiene que quedar
-- escrita en un lugar que NO se borre nunca: la bitácora se limpia a los 90
-- días, y una baja olvidada es un mensaje que llega a quien pidió no
-- recibirlo — exactamente lo que la ley y Meta castigan. Por eso tabla
-- propia, sin reloj de retención: el "no me escribas" no caduca.
--
-- Hoy IntelliA solo responde a quien escribe primero, así que esta lista
-- protege el futuro: el día que se manden recordatorios o plantillas, lo
-- primero es consultar aquí.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.bajas (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  canal      text not null,               -- whatsapp, web...
  sesion     text not null,               -- el número de teléfono
  creado_en  timestamptz not null default now(),

  -- Una baja por persona y canal: pedirla dos veces no crea dos filas.
  unique (cliente_id, canal, sesion)
);

-- Mismas reglas que el resto: nadie ve bajas de un cliente ajeno, y escribe
-- solo el servidor con la clave de servicio.
alter table public.bajas enable row level security;

drop policy if exists "ver bajas de mis clientes" on public.bajas;
create policy "ver bajas de mis clientes" on public.bajas
  for select using (cliente_id in (select public.mis_clientes()));
