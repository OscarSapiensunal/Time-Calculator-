-- ============================================================
--  SISTEMA DE ANÁLISIS DE BIENESTAR UNIVERSITARIO · RAPsi UNAL
--  ESQUEMA MAESTRO CONSOLIDADO · v3.0.0
--
--  Este es el script ÚNICO Y DEFINITIVO para recrear la base
--  de datos desde cero. Unifica:
--    • Data.sql        (v1.0.0)
--    • jaja.sql        (migración v2.0.0)
--    • migracion_v3    (esta entrega)
--
--  Sin ALTER TABLE, sin DROP COLUMN: solo CREATE definitivos
--  con la estructura final del esquema.
--
--  Cumplimiento: Ley 1581 de 2012 (Protección de Datos - Colombia)
--  Separación estricta entre identidad y análisis agregado.
--
--  Motor   : Supabase (PostgreSQL 15+)
--  Versión : 3.0.0 (consolidada)
--
--  USO:
--    1. Proyecto Supabase nuevo y vacío.
--    2. SQL Editor → pegar este archivo completo.
--    3. Run (Ctrl+Enter).
-- ============================================================


-- ============================================================
-- 0. EXTENSIONES NECESARIAS
--    pgcrypto provee gen_random_uuid(). Disponible por defecto
--    en Supabase, pero declarado explícitamente por seguridad.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. TABLA: usuarios
--
--  Perfil mínimo de estudiantes autenticados. Vinculada 1:1
--  con auth.users de Supabase. NO almacena información sensible
--  más allá de lo que ya provee el proveedor OAuth (Google).
--
--  ON DELETE CASCADE: si el usuario elimina su cuenta en
--  Supabase Auth, su perfil aquí se elimina también.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (

  -- Mismo UUID que auth.users → join directo con auth.uid()
  id               uuid        PRIMARY KEY
                               REFERENCES auth.users(id)
                               ON DELETE CASCADE,

  -- Nombre visible (típicamente del perfil Google)
  nombre           text,

  -- Correo institucional o personal
  correo           text,

  -- Indica si el acceso fue mediante Google OAuth
  provider_google  boolean     NOT NULL DEFAULT true,

  -- Fecha de creación del perfil (UTC)
  created_at       timestamptz NOT NULL DEFAULT now()

);

COMMENT ON TABLE  public.usuarios IS
  'Perfiles de estudiantes autenticados. Vinculado 1:1 con auth.users de Supabase.';
COMMENT ON COLUMN public.usuarios.id IS
  'UUID idéntico al de auth.users. Llave de unión para RLS.';
COMMENT ON COLUMN public.usuarios.provider_google IS
  'TRUE si el registro se hizo vía Google OAuth (único proveedor en v3).';


-- ============================================================
-- 2. TABLA: registros_bienestar
--
--  Núcleo del sistema. Almacena cada encuesta completada,
--  anónima o vinculada a un usuario registrado.
--
--  Estructura por bloques semánticos:
--    A. Tiempo estructural / obligatorio
--    B. Tiempo de bienestar y ocio
--    C. Cálculos agregados (gestionados por trigger)
--    D. Metadatos de privacidad y consentimiento
-- ============================================================
CREATE TABLE IF NOT EXISTS public.registros_bienestar (

  -- ----------------------------------------------------------
  -- IDENTIDAD DEL REGISTRO
  -- ----------------------------------------------------------

  -- Llave primaria auto-generada (no expone secuencias)
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencia NULLABLE al perfil del estudiante.
  --   • NULL  → Modo Anónimo (encuesta sin cuenta)
  --   • UUID  → Modo Registrado (historial personal)
  -- ON DELETE SET NULL: si el usuario borra su cuenta, su
  -- historial queda como registro anónimo para análisis
  -- epidemiológico de RAPsi, sin revelar su identidad.
  usuario_id       uuid        REFERENCES public.usuarios(id)
                               ON DELETE SET NULL,

  -- ----------------------------------------------------------
  -- SEGMENTACIÓN DEMOGRÁFICA
  -- ----------------------------------------------------------

  -- ¿Es estudiante activo? Permite segmentar el dashboard.
  -- Default TRUE porque el sistema está orientado a UNAL.
  is_student       boolean     NOT NULL DEFAULT true,

  -- ----------------------------------------------------------
  -- BLOQUE A: TIEMPO ESTRUCTURAL / OBLIGATORIO
  --  Todo lo que el estudiante DEBE hacer o no puede evitar.
  --  Unidad: horas semanales (numeric para precisión decimal).
  -- ----------------------------------------------------------

  -- Horas de sueño por semana.
  -- Referencia OMS: 49–63 h/semana (7–9 h/día).
  sleep_hours              numeric(5,2) CHECK (sleep_hours >= 0),

  -- Desplazamiento al campus y de vuelta, suma semanal.
  -- El frontend asume 6 días/semana como constante.
  transport_hours          numeric(5,2) CHECK (transport_hours >= 0),

  -- Preparación, consumo y limpieza post-comida (semanal).
  food_hours               numeric(5,2) CHECK (food_hours >= 0),

  -- Higiene, vestimenta y preparación personal (semanal).
  grooming_hours           numeric(5,2) CHECK (grooming_hours >= 0),

  -- Labores domésticas: aseo, lavado, compras, etc.
  house_tasks_hours        numeric(5,2) CHECK (house_tasks_hours >= 0),

  -- Créditos académicos inscritos en el semestre vigente.
  -- Se guarda el bruto para trazabilidad histórica.
  academic_credits         smallint     CHECK (academic_credits >= 0 AND academic_credits <= 30),

  -- Horas académicas calculadas (1 crédito = 3 h/semana, política UNAL).
  -- Se almacena el resultado para permitir ajustes manuales.
  academic_load_hours      numeric(5,2) CHECK (academic_load_hours >= 0),

  -- Trabajo remunerado o prácticas profesionales (semanal).
  -- Se separa de obligations_hours porque su impacto en el
  -- bienestar es cualitativamente distinto al de otras
  -- obligaciones (familiares, voluntariado, etc.).
  work_hours               numeric(5,2) NOT NULL DEFAULT 0
                           CONSTRAINT work_hours_positivo
                           CHECK (work_hours >= 0),

  -- Otras obligaciones fijas: cuidado familiar, servicio
  -- social, voluntariado, compromisos varios (semanal).
  obligations_hours        numeric(5,2) CHECK (obligations_hours >= 0),


  -- ----------------------------------------------------------
  -- BLOQUE B: TIEMPO DE BIENESTAR Y OCIO
  --  Actividades que el estudiante elige. Núcleo del análisis
  --  RAPsi. Unidad: horas semanales.
  -- ----------------------------------------------------------

  -- Redes sociales, streaming, scroll pasivo.
  -- Indicador clave de desgaste digital.
  scrolling_hours          numeric(5,2) CHECK (scrolling_hours >= 0),

  -- Ejercicio físico, deporte, caminatas activas.
  -- Factor protector del bienestar.
  physical_activity_hours  numeric(5,2) CHECK (physical_activity_hours >= 0),

  -- Socialización de CALIDAD: amigos en persona, familia, grupos.
  -- Excluye redes sociales (capturadas en scrolling_hours).
  quality_social_hours     numeric(5,2) NOT NULL DEFAULT 0
                           CONSTRAINT quality_social_hours_positivo
                           CHECK (quality_social_hours >= 0),

  -- Hobbies varios: arte, música, meditación, ocio activo.
  -- Fusiona en una sola variable (UX simplificado) lo que en
  -- v1 eran tres campos: mindfulness + creative + leisure.
  other_hobbies_hours      numeric(5,2) NOT NULL DEFAULT 0
                           CONSTRAINT other_hobbies_hours_positivo
                           CHECK (other_hobbies_hours >= 0),


  -- ----------------------------------------------------------
  -- BLOQUE C: CÁLCULOS AGREGADOS
  --  Generados por el trigger BEFORE INSERT/UPDATE.
  --  Garantizan consistencia sin depender del frontend.
  --  Semana de referencia: 168 horas totales.
  -- ----------------------------------------------------------

  -- 168 - occupied_time. Puede ser negativo (sobrecarga).
  available_time           numeric(5,2),

  -- Suma de Bloque B (inversión en recuperación).
  wellbeing_time           numeric(5,2),

  -- Suma de Bloque A (carga total estructural).
  occupied_time            numeric(5,2),


  -- ----------------------------------------------------------
  -- BLOQUE D: METADATOS DE PRIVACIDAD Y CONSENTIMIENTO
  --  Obligatorio Ley 1581/2012. Sin consentimiento explícito,
  --  el registro es inválido (barrera técnica, no solo de UX).
  -- ----------------------------------------------------------

  -- TRUE  → registro anónimo (usuario_id NULL intencional)
  -- FALSE → registro de usuario autenticado con historial
  anonymous_mode           boolean      NOT NULL DEFAULT false,

  -- Consentimiento informado del tratamiento de datos.
  -- CHECK garantiza que solo TRUE puede persistirse.
  consent_accepted         boolean      NOT NULL
                           CONSTRAINT consentimiento_ley1581
                           CHECK (consent_accepted = true),

  -- Timestamp de finalización de la encuesta (UTC).
  -- Permite análisis temporales: semestre, época parciales, etc.
  created_at               timestamptz  NOT NULL DEFAULT now()

);

COMMENT ON TABLE  public.registros_bienestar IS
  'Encuestas de uso del tiempo. Soporta modo anónimo (usuario_id NULL) '
  'y modo registrado. Cumple Ley 1581/2012 mediante CHECK en consent_accepted.';

COMMENT ON COLUMN public.registros_bienestar.usuario_id IS
  'NULL = anónimo. UUID = estudiante autenticado. ON DELETE SET NULL '
  'preserva el registro para análisis epidemiológico sin identidad.';

COMMENT ON COLUMN public.registros_bienestar.is_student IS
  'TRUE si el encuestado es estudiante activo. Permite segmentar el '
  'análisis del Dashboard entre estudiantes y no estudiantes.';

COMMENT ON COLUMN public.registros_bienestar.academic_load_hours IS
  'Horas académicas = academic_credits × 3 (política UNAL vigente). '
  'Se almacena el valor calculado para permitir ajuste manual.';

COMMENT ON COLUMN public.registros_bienestar.work_hours IS
  'Horas semanales de trabajo remunerado, prácticas o pasantías. '
  'Separada de obligations_hours por impacto cualitativo distinto.';

COMMENT ON COLUMN public.registros_bienestar.quality_social_hours IS
  'Horas de socialización significativa en persona. '
  'Excluye redes sociales (capturadas en scrolling_hours).';

COMMENT ON COLUMN public.registros_bienestar.other_hobbies_hours IS
  'Horas en actividades personales: arte, meditación, ocio activo. '
  'Fusiona mindfulness + creative + leisure de v1 en un solo campo.';

COMMENT ON COLUMN public.registros_bienestar.consent_accepted IS
  'Debe ser TRUE. CHECK garantiza Ley 1581/2012 a nivel de BD.';

COMMENT ON COLUMN public.registros_bienestar.available_time IS
  '168 h - occupied_time. Calculado por trigger BEFORE INSERT/UPDATE.';

COMMENT ON COLUMN public.registros_bienestar.wellbeing_time IS
  'Suma de actividades de bienestar activo (Bloque B). '
  'Indicador central del análisis de RAPsi.';


-- ============================================================
-- 3. TABLA: sugerencias_ocio
--
--  Permite a la comunidad proponer actividades que aparecerán
--  en el carrusel del frontend tras moderación. El campo
--  `aprobado` actúa como control de visibilidad pública.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sugerencias_ocio (

  -- UUID auto-generado
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nombre corto (ej. "Senderismo en Monserrate")
  nombre_actividad text        NOT NULL,

  -- Descripción larga
  descripcion      text        NOT NULL,

  -- Horario sugerido en formato libre
  horario          text,

  -- Nombre del autor (puede ser anónimo)
  autor_nombre     text,

  -- Timestamp de envío
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Control de moderación
  aprobado         boolean     NOT NULL DEFAULT false

);

COMMENT ON TABLE  public.sugerencias_ocio IS
  'Sugerencias de actividades de ocio enviadas por la comunidad. '
  'El campo aprobado controla la visibilidad en el carrusel del frontend. '
  'No vinculada a auth.users para permitir envíos anónimos.';

COMMENT ON COLUMN public.sugerencias_ocio.aprobado IS
  'FALSE por defecto. Solo un administrador puede cambiarlo a TRUE. '
  'Las políticas RLS exponen al público solo las filas con aprobado = TRUE.';

COMMENT ON COLUMN public.sugerencias_ocio.autor_nombre IS
  'Nombre libre del autor. No vinculado a usuarios autenticados '
  'para preservar privacidad en envíos anónimos.';


-- ============================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- ============================================================

-- Historial personal: WHERE usuario_id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_registros_usuario
  ON public.registros_bienestar (usuario_id)
  WHERE usuario_id IS NOT NULL;

-- Análisis temporal: el dashboard ordena por created_at DESC
CREATE INDEX IF NOT EXISTS idx_registros_fecha
  ON public.registros_bienestar (created_at DESC);

-- Segmentación por modo anónimo
CREATE INDEX IF NOT EXISTS idx_registros_anonimo
  ON public.registros_bienestar (anonymous_mode, created_at DESC);

-- Carrusel público: filtra siempre por aprobado = TRUE
CREATE INDEX IF NOT EXISTS idx_sugerencias_aprobadas
  ON public.sugerencias_ocio (aprobado, created_at DESC)
  WHERE aprobado = true;


-- ============================================================
-- 5. TRIGGER: cálculo automático de campos agregados
--
--  Garantiza consistencia entre Bloque A/B y los totales del
--  Bloque C, independientemente de lo que envíe el frontend.
--  Evita manipulación o errores de cálculo del cliente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_agregados_bienestar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_semana_total CONSTANT numeric := 168.0;
BEGIN
  -- Bloque A: Tiempo estructural obligatorio (incluye work_hours v3)
  NEW.occupied_time :=
    COALESCE(NEW.sleep_hours,            0) +
    COALESCE(NEW.transport_hours,        0) +
    COALESCE(NEW.food_hours,             0) +
    COALESCE(NEW.grooming_hours,         0) +
    COALESCE(NEW.house_tasks_hours,      0) +
    COALESCE(NEW.academic_load_hours,    0) +
    COALESCE(NEW.work_hours,             0) +
    COALESCE(NEW.obligations_hours,      0);

  -- Bloque B: Tiempo de bienestar activo
  NEW.wellbeing_time :=
    COALESCE(NEW.scrolling_hours,         0) +
    COALESCE(NEW.physical_activity_hours, 0) +
    COALESCE(NEW.quality_social_hours,    0) +
    COALESCE(NEW.other_hobbies_hours,     0);

  -- Bloque C: tiempo disponible (puede ser negativo → sobrecarga)
  NEW.available_time := v_semana_total - NEW.occupied_time;

  -- Coherencia: si no hay usuario_id, modo es anónimo
  IF NEW.usuario_id IS NULL THEN
    NEW.anonymous_mode := true;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.calcular_agregados_bienestar() IS
  'v3: Recalcula occupied_time, wellbeing_time y available_time antes de '
  'cada INSERT/UPDATE. Incluye work_hours en occupied_time. '
  'SECURITY DEFINER garantiza consistencia independientemente del rol que inserte.';

-- Asociar el trigger a la tabla
DROP TRIGGER IF EXISTS trg_calcular_agregados ON public.registros_bienestar;
CREATE TRIGGER trg_calcular_agregados
  BEFORE INSERT OR UPDATE
  ON public.registros_bienestar
  FOR EACH ROW
  EXECUTE FUNCTION public.calcular_agregados_bienestar();


-- ============================================================
-- 6. TRIGGER: creación automática de perfil post-OAuth
--
--  Cuando un estudiante inicia sesión con Google por primera
--  vez, Supabase crea un registro en auth.users. Este trigger
--  replica automáticamente el perfil en public.usuarios.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crear_perfil_en_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nombre, correo, provider_google)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    (NEW.app_metadata ->> 'provider') = 'google'
  )
  ON CONFLICT (id) DO NOTHING;  -- Idempotente
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.crear_perfil_en_registro() IS
  'Crea automáticamente el perfil en public.usuarios cuando un '
  'estudiante se autentica por primera vez con Google OAuth. '
  'ON CONFLICT DO NOTHING garantiza idempotencia.';

-- Trigger en auth.users (esquema reservado de Supabase)
DROP TRIGGER IF EXISTS trg_nuevo_usuario_auth ON auth.users;
CREATE TRIGGER trg_nuevo_usuario_auth
  AFTER INSERT
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_perfil_en_registro();


-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
--
--  Firewall de filas: ninguna consulta (cliente ni función)
--  puede saltarse estas políticas. Principio de mínimo privilegio.
-- ============================================================

-- Activar y FORZAR RLS (incluso para el dueño de la tabla)
ALTER TABLE public.usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.registros_bienestar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_bienestar FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.sugerencias_ocio    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sugerencias_ocio    FORCE  ROW LEVEL SECURITY;


-- ----------------------------------------------------------
-- POLÍTICAS: tabla `usuarios`
-- ----------------------------------------------------------

-- 1 | SELECT propio perfil
CREATE POLICY "usuarios_select_propio"
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING ( id = auth.uid() );

COMMENT ON POLICY "usuarios_select_propio" ON public.usuarios IS
  'Solo permite leer el propio perfil. Impide ver perfiles ajenos.';

-- 2 | UPDATE propio perfil (WITH CHECK impide suplantar id)
CREATE POLICY "usuarios_update_propio"
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING       ( id = auth.uid() )
  WITH CHECK  ( id = auth.uid() );

COMMENT ON POLICY "usuarios_update_propio" ON public.usuarios IS
  'Solo permite actualizar el propio perfil. WITH CHECK evita suplantar id.';

-- 3 | INSERT propio perfil (onboarding post-OAuth)
CREATE POLICY "usuarios_insert_propio"
  ON public.usuarios
  FOR INSERT
  TO authenticated
  WITH CHECK ( id = auth.uid() );

COMMENT ON POLICY "usuarios_insert_propio" ON public.usuarios IS
  'Permite crear el perfil solo con el propio UUID.';


-- ----------------------------------------------------------
-- POLÍTICAS: tabla `registros_bienestar`
-- ----------------------------------------------------------

-- 4 | INSERT público (anónimo y registrado)
--  Anónimos: usuario_id DEBE ser NULL.
--  Autenticados: usuario_id puede ser su propio UUID o NULL
--  (si elige guardar anónimamente aun estando autenticado).
CREATE POLICY "registros_insert_publico"
  ON public.registros_bienestar
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (
      auth.uid() IS NULL AND usuario_id IS NULL
    )
    OR
    (
      auth.uid() IS NOT NULL
      AND (usuario_id = auth.uid() OR usuario_id IS NULL)
    )
  );

COMMENT ON POLICY "registros_insert_publico" ON public.registros_bienestar IS
  'Permite INSERT a cualquier visitante. '
  'Anónimos: usuario_id debe ser NULL. '
  'Autenticados: usuario_id debe ser su propio UUID o NULL.';

-- 5 | SELECT solo del propio historial
--  Los registros anónimos (usuario_id IS NULL) son inaccesibles
--  por usuarios individuales; solo se ven mediante funciones
--  SECURITY DEFINER o la vista de análisis agregado.
--
--  NOTA: El dashboard consulta registros_bienestar directamente.
--  Para que vea filas anónimas, debe consultarse desde un rol
--  con bypass de RLS, O bien consumir la vista
--  analisis_promedios_bienestar (recomendado).
CREATE POLICY "registros_select_propio"
  ON public.registros_bienestar
  FOR SELECT
  TO authenticated
  USING ( usuario_id = auth.uid() );

COMMENT ON POLICY "registros_select_propio" ON public.registros_bienestar IS
  'Solo permite leer registros donde usuario_id = auth.uid(). '
  'Los registros anónimos son inaccesibles para usuarios individuales.';

-- 6 | UPDATE solo del propio historial
CREATE POLICY "registros_update_propio"
  ON public.registros_bienestar
  FOR UPDATE
  TO authenticated
  USING       ( usuario_id = auth.uid() )
  WITH CHECK  ( usuario_id = auth.uid() );

COMMENT ON POLICY "registros_update_propio" ON public.registros_bienestar IS
  'Permite editar únicamente los propios registros. '
  'El trigger de cálculo se reejecuta al actualizar.';


-- ----------------------------------------------------------
-- POLÍTICAS: tabla `sugerencias_ocio`
-- ----------------------------------------------------------

-- 7 | INSERT público
CREATE POLICY "sugerencias_insert_publico"
  ON public.sugerencias_ocio
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMENT ON POLICY "sugerencias_insert_publico" ON public.sugerencias_ocio IS
  'Permite a cualquier visitante (anon o authenticated) enviar sugerencias.';

-- 8 | SELECT solo aprobadas (anónimos)
CREATE POLICY "sugerencias_select_aprobadas_anonimo"
  ON public.sugerencias_ocio
  FOR SELECT
  TO anon
  USING (aprobado = true);

COMMENT ON POLICY "sugerencias_select_aprobadas_anonimo" ON public.sugerencias_ocio IS
  'Usuarios anónimos solo pueden ver sugerencias con aprobado = TRUE.';

-- 9 | SELECT completo (autenticados / admins)
CREATE POLICY "sugerencias_select_admin_authenticated"
  ON public.sugerencias_ocio
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY "sugerencias_select_admin_authenticated" ON public.sugerencias_ocio IS
  'Usuarios autenticados (panel de admin) ven TODAS las sugerencias.';


-- ============================================================
-- 8. FUNCIÓN DE INFORME AGREGADO PARA RAPsi
--
--  SECURITY DEFINER: bypassa RLS, pero solo expone agregados.
--  NUNCA retorna usuario_id ni filas individuales.
--  Cumple Ley 1581/2012: solo estadísticas poblacionales.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rapsi_informe_agregado(
  p_dias integer DEFAULT 30   -- Ventana temporal en días
)
RETURNS TABLE (
  total_respuestas              bigint,
  respuestas_anonimas           bigint,
  respuestas_registradas        bigint,
  total_estudiantes             bigint,
  promedio_sleep_hours          numeric,
  promedio_occupied_time        numeric,
  promedio_wellbeing_time       numeric,
  promedio_available_time       numeric,
  promedio_scrolling_hours      numeric,
  promedio_physical_activity    numeric,
  promedio_quality_social       numeric,
  promedio_other_hobbies        numeric,
  promedio_academic_load        numeric,
  promedio_work_hours           numeric,
  pct_sobrecarga                numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint                                                  AS total_respuestas,
    COUNT(*) FILTER (WHERE usuario_id IS NULL)::bigint               AS respuestas_anonimas,
    COUNT(*) FILTER (WHERE usuario_id IS NOT NULL)::bigint           AS respuestas_registradas,
    COUNT(*) FILTER (WHERE is_student = true)::bigint                AS total_estudiantes,
    ROUND(AVG(sleep_hours),             2)                           AS promedio_sleep_hours,
    ROUND(AVG(occupied_time),           2)                           AS promedio_occupied_time,
    ROUND(AVG(wellbeing_time),          2)                           AS promedio_wellbeing_time,
    ROUND(AVG(available_time),          2)                           AS promedio_available_time,
    ROUND(AVG(scrolling_hours),         2)                           AS promedio_scrolling_hours,
    ROUND(AVG(physical_activity_hours), 2)                           AS promedio_physical_activity,
    ROUND(AVG(quality_social_hours),    2)                           AS promedio_quality_social,
    ROUND(AVG(other_hobbies_hours),     2)                           AS promedio_other_hobbies,
    ROUND(AVG(academic_load_hours),     2)                           AS promedio_academic_load,
    ROUND(AVG(work_hours),              2)                           AS promedio_work_hours,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE available_time < 0)
            / NULLIF(COUNT(*), 0),
    2)                                                               AS pct_sobrecarga
  FROM public.registros_bienestar
  WHERE
    created_at >= (now() - (p_dias || ' days')::interval)
    AND consent_accepted = true;
END;
$$;

COMMENT ON FUNCTION public.rapsi_informe_agregado(integer) IS
  'v3: Informe agregado de bienestar para RAPsi. Incluye promedio_work_hours. '
  'SECURITY DEFINER permite acceder a registros anónimos. '
  'NUNCA retorna usuario_id ni datos individuales. Cumple Ley 1581/2012.';


-- ============================================================
-- 9. VISTA DE ANÁLISIS: analisis_promedios_bienestar
--
--  Capa estable de acceso al dashboard. Pre-agrega promedios
--  por segmento (estudiante / no estudiante). Si el esquema
--  cambia, basta con actualizar esta vista.
--
--  Privacidad: NO expone usuario_id ni filas individuales.
-- ============================================================

CREATE OR REPLACE VIEW public.analisis_promedios_bienestar AS
SELECT

  -- Eje de segmentación del Dashboard
  is_student,

  -- Conteo por segmento
  COUNT(*)                                              AS total_registros,

  -- ── Bloque A: Tiempo Estructural ──────────────────────────
  ROUND(AVG(sleep_hours),             2)               AS avg_sleep_hours,
  ROUND(AVG(transport_hours),         2)               AS avg_transport_hours,
  ROUND(AVG(food_hours),              2)               AS avg_food_hours,
  ROUND(AVG(grooming_hours),          2)               AS avg_grooming_hours,
  ROUND(AVG(house_tasks_hours),       2)               AS avg_house_tasks_hours,
  ROUND(AVG(academic_load_hours),     2)               AS avg_academic_load_hours,
  ROUND(AVG(academic_credits),        2)               AS avg_academic_credits,
  ROUND(AVG(work_hours),              2)               AS avg_work_hours,
  ROUND(AVG(obligations_hours),       2)               AS avg_obligations_hours,

  -- ── Bloque B: Tiempo de Bienestar ─────────────────────────
  ROUND(AVG(scrolling_hours),         2)               AS avg_scrolling_hours,
  ROUND(AVG(physical_activity_hours), 2)               AS avg_physical_activity_hours,
  ROUND(AVG(quality_social_hours),    2)               AS avg_quality_social_hours,
  ROUND(AVG(other_hobbies_hours),     2)               AS avg_other_hobbies_hours,

  -- ── Bloque C: Cálculos Agregados ──────────────────────────
  ROUND(AVG(occupied_time),           2)               AS avg_occupied_time,
  ROUND(AVG(wellbeing_time),          2)               AS avg_wellbeing_time,
  ROUND(AVG(available_time),          2)               AS avg_available_time,

  -- ── Indicadores de Riesgo ─────────────────────────────────
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE available_time < 0)
          / NULLIF(COUNT(*), 0),
  2)                                                   AS pct_sobrecarga,

  ROUND(
    100.0 * COUNT(*) FILTER (WHERE usuario_id IS NULL)
          / NULLIF(COUNT(*), 0),
  2)                                                   AS pct_anonimos

FROM public.registros_bienestar
WHERE
  consent_accepted = true   -- Solo registros con consentimiento válido (Ley 1581)

GROUP BY is_student
ORDER BY is_student DESC;   -- TRUE (estudiantes) primero

COMMENT ON VIEW public.analisis_promedios_bienestar IS
  'v3: Vista de análisis agregado para el Dashboard de RAPsi. '
  'Incluye avg_work_hours. Segmenta entre estudiantes y no estudiantes. '
  'NO expone usuario_id ni filas individuales. Cumple Ley 1581/2012.';


-- ============================================================
-- 10. GRANTS: permisos de ejecución y acceso
--
--  Control fino sobre quién puede llamar cada objeto.
--  Las políticas RLS protegen las tablas; los GRANTS protegen
--  las funciones y vistas que las consultan.
-- ============================================================

-- Función de informe agregado: solo autenticados (futuro: rol rapsi_staff)
GRANT EXECUTE ON FUNCTION public.rapsi_informe_agregado(integer)
  TO authenticated;

-- Vista de análisis: visible para autenticados
GRANT SELECT ON public.analisis_promedios_bienestar TO authenticated;

-- Permisos de tabla (RLS sigue siendo la capa de protección efectiva)
GRANT SELECT, INSERT, UPDATE ON public.usuarios            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.registros_bienestar TO authenticated, anon;
GRANT SELECT, INSERT         ON public.sugerencias_ocio    TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sugerencias_ocio TO authenticated;


-- ============================================================
-- FIN DEL ESQUEMA MAESTRO v3.0.0
-- ============================================================
-- Tabla resumen del estado final:
--
--  usuarios:
--    id (uuid PK → auth.users), nombre, correo,
--    provider_google, created_at
--
--  registros_bienestar:
--    id (uuid PK), usuario_id (FK NULL), is_student,
--    [Bloque A] sleep_hours, transport_hours, food_hours,
--               grooming_hours, house_tasks_hours,
--               academic_credits, academic_load_hours,
--               work_hours, obligations_hours
--    [Bloque B] scrolling_hours, physical_activity_hours,
--               quality_social_hours, other_hobbies_hours
--    [Bloque C] available_time, wellbeing_time, occupied_time
--    [Bloque D] anonymous_mode, consent_accepted, created_at
--
--  sugerencias_ocio:
--    id, nombre_actividad, descripcion, horario,
--    autor_nombre, created_at, aprobado
--
--  Funciones:
--    calcular_agregados_bienestar()  · trigger BEFORE INSERT/UPDATE
--    crear_perfil_en_registro()      · trigger AFTER INSERT en auth.users
--    rapsi_informe_agregado(p_dias)  · función SECURITY DEFINER
--
--  Vista:
--    analisis_promedios_bienestar    · agregados por is_student
-- ============================================================
