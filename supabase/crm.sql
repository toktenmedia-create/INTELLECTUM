-- ═══════════════════════════════════════════════════════════════════════════
-- EL CRM CRECE: integridad del esquema y pipeline con valor.
--
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. Se puede correr
-- las veces que haga falta; no borra nada de lo que ya existe.
--
-- QUÉ HACE
-- 1. Un reloj que sí funciona: actualizado_en de los leads se movía solo al
--    crearlos, nunca al editarlos. Ahora cada cambio lo actualiza.
-- 2. Un índice para la deduplicación de mensajes de Meta: la consulta que
--    pregunta "¿este mensaje ya se atendió?" corre en cada mensaje de
--    WhatsApp, y sin índice se vuelve más lenta a medida que crece la
--    bitácora.
-- 3. El pipeline con plata: etiquetas libres, valor estimado en dólares y
--    motivo de pérdida. Con esto el panel puede responder "¿cuánto hay en el
--    embudo?" y "¿por qué se pierden los leads?".
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. EL RELOJ DE ACTUALIZADO_EN ──────────────────────────────────────────

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists leads_tocar_actualizado on public.leads;
create trigger leads_tocar_actualizado
  before update on public.leads
  for each row execute function public.tocar_actualizado_en();


-- ─── 2. ÍNDICE PARA LA DEDUPLICACIÓN DE MENSAJES ────────────────────────────
-- Parcial a propósito: solo indexa los eventos de tipo mensaje_procesado, que
-- son los únicos que esa consulta mira. Los demás no pagan el costo.

create index if not exists eventos_por_marcador
  on public.eventos (cliente_id, (detalle->>'marcador'))
  where tipo = 'mensaje_procesado';


-- ─── 3. EL PIPELINE CON VALOR ───────────────────────────────────────────────
-- etiquetas: lista libre de palabras del dueño ("clínica", "referido"...).
-- valor_estimado: dólares que el dueño estima que vale la oportunidad. Nulo
--   significa "sin estimar", que no es lo mismo que cero.
-- motivo_perdida: por qué no se cerró. Se llena al marcar perdido; leerlos
--   juntos cada mes enseña más que cualquier reporte.

alter table public.leads
  add column if not exists etiquetas jsonb not null default '[]'::jsonb;

alter table public.leads
  add column if not exists valor_estimado numeric(12,2);

alter table public.leads
  add column if not exists motivo_perdida text not null default '';

-- Para el día que el panel filtre por etiqueta sin traer todos los leads.
create index if not exists leads_por_etiqueta
  on public.leads using gin (etiquetas);
