// types/assessment.ts

export type ParsedAssessmentQuestion = {
  question_id: string
  statement: string
  max_points: number
  topic?: string
}

export type ParsedAssessmentItem = {
  item_id: string
  label: string
  points_rule?: string
  questions: ParsedAssessmentQuestion[]
}

export type ParsedAssessmentStructure = {
  assessment_title?: string
  total_points?: number
  grading_rules?: string[]
  items: ParsedAssessmentItem[]
}

// ─── Tipos de base de datos ───────────────────────────────────────────────────

export type Assessment = {
  id: string
  course_id: string
  teacher_id: string
  title: string
  subject: string
  grade_level?: string
  total_points?: number
  passing_percentage?: number
  official_pdf_path?: string
  official_test_text?: string
  official_test_json?: ParsedAssessmentStructure
  rubric_json?: Record<string, unknown>
  status: "draft" | "active" | "closed" | "archived"
  grading_mode: "auto" | "semi" | "manual"
  created_at: string
  updated_at: string
}

export type Submission = {
  id: string
  assessment_id: string
  student_id: string
  course_id: string
  status: "pending" | "processing" | "completed" | "error"
  total_score?: number
  max_score?: number
  percentage?: number
  final_grade?: number
  grading_status: "pending" | "partial" | "completed" | "needs_review"
  submitted_at: string
  graded_at?: string
}

export type GradingResult = {
  id: string
  submission_id: string
  question_id: string
  ocr_text?: string | null
  ocr_confidence?: number | null
  ocr_provider?: string | null
  score?: number | null
  max_score?: number | null
  errors_detected?: string[] | null
  student_feedback?: string | null
  teacher_note?: string | null
  review_status:
    | "pending"
    | "auto"
    | "needs_review"
    | "manual_required"
    | "approved"
  teacher_override_score?: number | null
  teacher_override_note?: string | null
  warnings?: string[] | null
  graded_at: string
}

export type Course = {
  id: string
  school_id: string
  teacher_id: string
  name: string
  grade: string
  section?: string
  year: number
  subject: string
}

export type Student = {
  id: string
  school_id: string
  full_name: string
  rut?: string
}
