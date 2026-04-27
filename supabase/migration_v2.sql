-- =============================================================
-- MIGRATION ADICIONAL — Ejecutar en Supabase SQL Editor
-- Agrega: roles de admin, biblioteca de exámenes, bucket library
-- =============================================================

-- 1. Agregar columna role a teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin', 'superadmin'));

-- 2. Tabla biblioteca de exámenes compartidos
CREATE TABLE IF NOT EXISTS library_exams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  subject         TEXT NOT NULL,
  grade_level     TEXT NOT NULL,
  description     TEXT,
  pdf_path        TEXT NOT NULL,
  assessment_structure JSONB,
  total_points    NUMERIC(6,2),
  tags            TEXT[],
  uploaded_by     UUID REFERENCES teachers(id),
  school_name     TEXT,
  download_count  INTEGER DEFAULT 0,
  is_public       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Bucket para biblioteca
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('library-pdfs', 'library-pdfs', true, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 4. RLS para library_exams
ALTER TABLE library_exams ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede ver exámenes públicos
CREATE POLICY "library_read_public" ON library_exams
  FOR SELECT USING (is_public = true AND auth.uid() IS NOT NULL);

-- Docentes pueden crear
CREATE POLICY "library_insert_teacher" ON library_exams
  FOR INSERT WITH CHECK (
    uploaded_by IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  );

-- Solo admin y el autor pueden eliminar
CREATE POLICY "library_delete_admin" ON library_exams
  FOR DELETE USING (
    uploaded_by IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- Storage: cualquiera puede leer library-pdfs (public)
CREATE POLICY "library_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'library-pdfs');

CREATE POLICY "library_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'library-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY "library_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'library-pdfs'
    AND EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- 5. Políticas de eliminación para assessments (docente dueño o admin)
DROP POLICY IF EXISTS "assessments_delete" ON assessments;
CREATE POLICY "assessments_delete" ON assessments
  FOR DELETE USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- 6. Políticas de eliminación para submissions
CREATE POLICY "submissions_delete" ON submissions
  FOR DELETE USING (
    teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

-- 7. Trigger updated_at para library_exams
DROP TRIGGER IF EXISTS trg_updated_at ON library_exams;
CREATE TRIGGER trg_updated_at
BEFORE UPDATE ON library_exams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_library_subject ON library_exams(subject);
CREATE INDEX IF NOT EXISTS idx_library_grade ON library_exams(grade_level);
CREATE INDEX IF NOT EXISTS idx_library_public ON library_exams(is_public);

-- 9. Hacer admin al primer usuario (reemplaza con el email del admin)
-- UPDATE teachers SET role = 'admin' WHERE email = 'tu-email@colegio.cl';

-- ── REALTIME — activar publicación para sincronización en tiempo real ────────
-- Ejecutar en Supabase SQL Editor para que app y web se sincronicen en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE assessments;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE submission_pages;
ALTER PUBLICATION supabase_realtime ADD TABLE grading_results;
