-- supabase/mobile_sync_fix.sql
-- Ejecutar en Supabase SQL Editor si la app móvil inicia sesión, pero no puede crear/subir/sincronizar.

-- Evita errores en upsert de páginas por pregunta.
CREATE UNIQUE INDEX IF NOT EXISTS ux_submission_pages_submission_question
ON submission_pages(submission_id, question_id);

-- RLS para estudiantes del colegio del docente autenticado.
DROP POLICY IF EXISTS "students_by_teacher_school" ON students;
CREATE POLICY "students_by_teacher_school" ON students
FOR ALL
USING (
  school_id IN (SELECT school_id FROM teachers WHERE user_id = auth.uid())
)
WITH CHECK (
  school_id IN (SELECT school_id FROM teachers WHERE user_id = auth.uid())
);

-- RLS para páginas de respuestas vinculadas a evaluaciones/envíos del docente.
DROP POLICY IF EXISTS "submission_pages_by_teacher" ON submission_pages;
CREATE POLICY "submission_pages_by_teacher" ON submission_pages
FOR ALL
USING (
  assessment_id IN (
    SELECT id FROM assessments
    WHERE teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  assessment_id IN (
    SELECT id FROM assessments
    WHERE teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
  )
);
