-- ═══════════════════════════════════════════════════════════════════════════
-- TRASPASO BOT → HUMANO
--
-- Cómo correrlo: Supabase → SQL Editor → pegar todo → Run. Se puede correr
-- las veces que haga falta; no borra nada de lo que ya existe.
--
-- Una columna nueva en las conversaciones: el modo. Vacío o "bot" significa
-- que IntelliA atiende como siempre; "humano" significa que la conversación
-- pasó a manos del equipo: el bot se calla, cada mensaje nuevo del cliente
-- avisa al dueño, y se responde a mano desde el panel. Se vuelve al bot con
-- un botón en el mismo panel.
-- ═══════════════════════════════════════════════════════════════════════════

alter table conversaciones add column if not exists modo text;
