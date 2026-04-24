-- =============================================================================
-- CORRECTOR IA DOCENTE — Schema completo
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABLAS ACADÉMICAS BASE
-- =============================================================================

-- Colegios
CREATE TABLE IF NOT EXISTS schools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  rbd         TEXT UNIQUE,                    -- RBD colegio Chile
  region      TEXT,
  commune     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Docentes
CREATE TABLE IF NOT EXISTS teachers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  subjects    TEXT[],                         -- ['math', 'language', 'science']
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Cursos
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  UUID REFERENCES teachers(id),
  name        TEXT NOT NULL,                  -- "8°A"
  grade       TEXT NOT NULL,                  -- "8°"
  section     TEXT,                           -- "A"
  year        INTEGER DEFAULT EXTRACT(YEAR FROM now()),
  subject     TEXT NOT NULL,                  -- math | language | science | history
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Estudiantes
CREATE TABLE IF NOT EXISTS students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES schools(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  rut         TEXT,                           -- RUT chileno (opcional)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Estudiantes ↔ Cursos (relación N:M)
CREATE TABLE IF NOT EXISTS course_students (
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (course_id, student_id)
);

-- =============================================================================
-- 2. EVALUACIONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS assessments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id               UUID REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id              UUID REFERENCES teachers(id),
  title                   TEXT NOT NULL,
  subject                 TEXT NOT NULL,      -- math | language | science | history
  grade_level             TEXT,               -- "8°"
  instructions            TEXT,
  total_points            NUMERIC(6,2),
  passing_score           NUMERIC(6,2),       -- puntaje mínimo de aprobación
  passing_percentage      NUMERIC(5,2) DEFAULT 60.0,  -- exigencia %

  -- Prueba oficial
  official_pdf_path       TEXT,               -- path en bucket assessment-assets
  official_test_text      TEXT,               -- texto extraído del PDF
  official_test_json      JSONB,              -- estructura detectada por IA
  answer_key_json         JSONB,              -- pauta de respuestas
  rubric_json             JSONB,              -- rúbrica detallada por ítem

  -- Config IA
  prompt_subject_key      TEXT DEFAULT 'math',
  grading_mode            TEXT DEFAULT 'auto', -- auto | semi | manual
  assessment_structure_json JSONB,            -- ítems y ejercicios detectados

  -- Estado
  status                  TEXT DEFAULT 'draft', -- draft | active | closed | archived
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. ENVÍOS (SUBMISSIONS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID REFERENCES assessments(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES courses(id),
  teacher_id      UUID REFERENCES teachers(id),

  -- Estado del envío
  status          TEXT DEFAULT 'pending',     -- pending | processing | completed | error

  -- Resultado final
  total_score     NUMERIC(6,2),
  max_score       NUMERIC(6,2),
  percentage      NUMERIC(5,2),
  final_grade     NUMERIC(3,1),               -- nota 1.0–7.0 escala chilena
  grading_status  TEXT DEFAULT 'pending',     -- pending | partial | completed | needs_review

  submitted_at    TIMESTAMPTZ DEFAULT now(),
  graded_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(assessment_id, student_id)
);

-- =============================================================================
-- 4. PÁGINAS / IMÁGENES DE EJERCICIOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS submission_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID REFERENCES submissions(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id),
  assessment_id   UUID REFERENCES assessments(id),

  -- Referencia al ejercicio
  item_id         TEXT,                       -- "item_1"
  question_id     TEXT,                       -- "item_1_q2"
  page_number     INTEGER,

  -- Imagen
  image_path      TEXT NOT NULL,              -- path en bucket submission-images
  image_url       TEXT,                       -- URL pública temporal
  capture_mode    TEXT DEFAULT 'photo',       -- photo | scan
  upload_order    INTEGER,

  -- Estado OCR
  ocr_status      TEXT DEFAULT 'pending',     -- pending | processing | done | error

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 5. RESULTADOS DE CORRECCIÓN
-- =============================================================================

CREATE TABLE IF NOT EXISTS grading_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID REFERENCES submissions(id) ON DELETE CASCADE,
  assessment_id     UUID REFERENCES assessments(id),
  student_id        UUID REFERENCES students(id),
  question_id       TEXT NOT NULL,            -- "item_1_q2"
  exercise_id       TEXT,                     -- alias de question_id si difiere

  -- OCR
  ocr_text          TEXT,                     -- texto extraído de la imagen
  ocr_confidence    NUMERIC(4,3),             -- 0.000 – 1.000
  ocr_provider      TEXT,                     -- surya | chandra | paddleocr

  -- Evaluación IA
  score             NUMERIC(6,2),             -- puntaje obtenido
  max_score         NUMERIC(6,2),             -- puntaje máximo oficial
  errors_detected   TEXT[],                   -- lista de errores detectados
  student_feedback  TEXT,                     -- retroalimentación para el estudiante
  teacher_note      TEXT,                     -- nota técnica para el docente
  raw_model_output  TEXT,                     -- JSON raw del modelo (para debug)

  -- Revisión
  review_status     TEXT DEFAULT 'pending',   -- auto | needs_review | manual_required | approved
  reviewed_by       UUID REFERENCES teachers(id),
  reviewed_at       TIMESTAMPTZ,
  teacher_override_score    NUMERIC(6,2),     -- si el docente corrige el puntaje
  teacher_override_note     TEXT,

  -- Warnings del pipeline
  warnings          TEXT[],

  graded_at         TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(submission_id, question_id)
);

-- =============================================================================
-- 6. FEEDBACK OCR — sistema de aprendizaje adaptativo
-- =============================================================================

CREATE TABLE IF NOT EXISTS ocr_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID REFERENCES submissions(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES students(id),
  question_id     TEXT,
  image_url       TEXT,

  -- Lo que el OCR leyó vs lo que el docente corrigió
  ocr_text        TEXT,                       -- lectura original del OCR
  corrected_text  TEXT,                       -- corrección del docente
  error_type      TEXT,                       -- numero_mal | signo_mal | ilegible | otro

  -- Metadata para entrenamiento futuro
  ocr_provider    TEXT,
  confidence_at_time  NUMERIC(4,3),
  subject         TEXT,

  corrected_by    UUID REFERENCES teachers(id),
  corrected_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 7. INSIGHTS Y ANALÍTICA
-- =============================================================================

CREATE TABLE IF NOT EXISTS class_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID REFERENCES assessments(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES courses(id),
  teacher_id      UUID REFERENCES teachers(id),

  -- Estadísticas del curso
  total_students      INTEGER DEFAULT 0,
  graded_count        INTEGER DEFAULT 0,
  avg_score           NUMERIC(6,2),
  avg_grade           NUMERIC(3,1),
  pass_rate           NUMERIC(5,2),           -- % de aprobación
  top_score           NUMERIC(6,2),
  lowest_score        NUMERIC(6,2),

  -- Análisis por ejercicio
  hardest_questions   JSONB,                  -- preguntas con menor puntaje promedio
  common_errors       JSONB,                  -- errores más frecuentes
  topics_to_reinforce JSONB,                  -- contenidos a reforzar

  -- Generado por IA
  ai_analysis         TEXT,                   -- análisis pedagógico generado
  ai_suggestions      TEXT,                   -- sugerencias de clase de reforzamiento

  generated_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Memoria por estudiante (para seguimiento a largo plazo)
CREATE TABLE IF NOT EXISTS student_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES students(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES courses(id),
  subject         TEXT,

  recurring_errors    JSONB,                  -- errores que repite
  strong_topics       TEXT[],                 -- temas donde destaca
  weak_topics         TEXT[],                 -- temas con dificultad
  improvement_trend   TEXT,                   -- mejorando | estable | bajando

  last_updated    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 8. TRIGGERS: updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas con updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'schools','teachers','courses','students',
    'assessments','submissions','submission_pages',
    'grading_results','class_insights','student_memory'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_updated_at ON %I;
      CREATE TRIGGER trg_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t);
  END LOOP;
END;
$$;

-- =============================================================================
-- 9. STORAGE BUCKETS
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('assessment-assets', 'assessment-assets', false, 52428800,  -- 50MB
   ARRAY['application/pdf','image/jpeg','image/png','image/webp']),
  ('submission-images', 'submission-images', false, 10485760,  -- 10MB
   ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('exports',           'exports',           false, 20971520,  -- 20MB
   ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE schools           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_insights    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_memory    ENABLE ROW LEVEL SECURITY;

-- Política: docente ve solo su propio data
CREATE POLICY "teachers_own_data" ON teachers
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "courses_by_teacher" ON courses
  FOR ALL USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

CREATE POLICY "assessments_by_teacher" ON assessments
  FOR ALL USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

CREATE POLICY "submissions_by_teacher" ON submissions
  FOR ALL USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

CREATE POLICY "grading_results_by_teacher" ON grading_results
  FOR ALL USING (
    assessment_id IN (
      SELECT id FROM assessments
      WHERE teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "ocr_feedback_by_teacher" ON ocr_feedback
  FOR ALL USING (
    corrected_by IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

CREATE POLICY "insights_by_teacher" ON class_insights
  FOR ALL USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

-- Storage: docente accede solo a sus archivos
CREATE POLICY "assessment_assets_teacher" ON storage.objects
  FOR ALL USING (
    bucket_id = 'assessment-assets'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "submission_images_teacher" ON storage.objects
  FOR ALL USING (
    bucket_id = 'submission-images'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "exports_teacher" ON storage.objects
  FOR ALL USING (
    bucket_id = 'exports'
    AND auth.uid() IS NOT NULL
  );

-- =============================================================================
-- 11. ÍNDICES (para consultas rápidas)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_submissions_assessment    ON submissions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student       ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_grading_results_submission ON grading_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_grading_results_review    ON grading_results(review_status);
CREATE INDEX IF NOT EXISTS idx_pages_submission          ON submission_pages(submission_id);
CREATE INDEX IF NOT EXISTS idx_pages_question            ON submission_pages(question_id);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_student      ON ocr_feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_insights_assessment       ON class_insights(assessment_id);
