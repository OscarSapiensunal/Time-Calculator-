-- ============================================================
-- RAPsi UNAL · Migración v3.2 · datos piloto → sistema v3.1
--
-- Contexto:
--   Los 89 registros del piloto usaban el sistema de créditos
--   (academic_credits × 3 = academic_load_hours). Con v3.1 el
--   frontend pasó a inputs directos (class_hours + self_study_hours),
--   por lo que esos registros quedaron con:
--     - academic_load_hours > 0  (cargado desde créditos)
--     - class_hours      = 0     (sin dato v3.1)
--     - self_study_hours = 0     (sin dato v3.1)
--
-- Estrategia:
--   Asignar academic_load_hours → self_study_hours para que el
--   trigger (academic_load_hours = class_hours + self_study_hours)
--   preserve exactamente el total académico histórico.
--   class_hours permanece en 0 porque el piloto no separaba
--   horas presenciales de estudio autónomo.
--
-- Reversibilidad:
--   UPDATE inverso: SET self_study_hours = 0 con el mismo WHERE.
--   academic_load_hours lo recalcula el trigger automáticamente.
-- ============================================================

-- ── PASO 1: Migración ────────────────────────────────────────
UPDATE public.registros_bienestar
SET    self_study_hours = academic_load_hours
WHERE  academic_credits IS NOT NULL
  AND  academic_load_hours > 0
  AND  class_hours      = 0
  AND  self_study_hours = 0;

-- ── PASO 2: Verificación (esperado: ~89 filas, avg ~41.7 h) ──
SELECT
  COUNT(*)                              AS total_migrados,
  ROUND(AVG(self_study_hours), 2)       AS avg_self_study_after,
  ROUND(AVG(academic_load_hours), 2)    AS avg_load_after
FROM public.registros_bienestar
WHERE academic_credits IS NOT NULL;
