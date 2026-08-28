-- LA CALIFICACIÓN AUTOMÁTICA DE LEADS (lib/calificar.js).
--
-- Cuatro columnas nuevas en la ficha: la temperatura (caliente/tibio/frio),
-- el puntaje 0-100, el resumen que escribe la IA y el próximo paso sugerido.
-- Se aplica una sola vez, pegándolo en el editor SQL de Supabase.
-- Es seguro correrlo dos veces: "if not exists" no duplica nada.

alter table leads add column if not exists temperatura  text;
alter table leads add column if not exists puntaje      integer;
alter table leads add column if not exists resumen_ia   text;
alter table leads add column if not exists proximo_paso text;
alter table leads add column if not exists calificado_en timestamptz;
