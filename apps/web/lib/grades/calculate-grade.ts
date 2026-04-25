// lib/grades/calculate-grade.ts

export type GradeResult = {
  totalScore: number
  maxScore: number
  percentage: number
  grade: number        // 1.0 – 7.0
  passed: boolean
  label: string        // "Aprobado" | "Reprobado"
}

/**
 * Fórmula nota chilena estándar con exigencia configurable.
 * - Bajo exigencia: escala lineal 1.0 → 3.9
 * - Sobre exigencia: escala lineal 4.0 → 7.0
 */
export function calculateChileanGrade(
  totalScore: number,
  maxScore: number,
  passingPercentage = 60
): GradeResult {
  if (maxScore <= 0) throw new Error("maxScore debe ser mayor a 0")

  const percentage = (totalScore / maxScore) * 100
  const exigencia = passingPercentage / 100

  let grade: number
  if (percentage / 100 >= exigencia) {
    grade = ((percentage / 100 - exigencia) / (1 - exigencia)) * 3 + 4
  } else {
    grade = (percentage / 100 / exigencia) * 3 + 1
  }

  // Redondear a 1 decimal, clampear entre 1.0 y 7.0
  grade = Math.round(Math.min(7.0, Math.max(1.0, grade)) * 10) / 10

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    maxScore,
    percentage: Math.round(percentage * 10) / 10,
    grade,
    passed: grade >= 4.0,
    label: grade >= 4.0 ? "Aprobado" : "Reprobado",
  }
}

/** Convierte nota numérica a color semántico para UI */
export function gradeColor(grade: number): string {
  if (grade >= 6.0) return "text-green-600"
  if (grade >= 5.0) return "text-blue-600"
  if (grade >= 4.0) return "text-yellow-600"
  return "text-red-600"
}

export function gradeBg(grade: number): string {
  if (grade >= 6.0) return "bg-green-50 border-green-200"
  if (grade >= 5.0) return "bg-blue-50 border-blue-200"
  if (grade >= 4.0) return "bg-yellow-50 border-yellow-200"
  return "bg-red-50 border-red-200"
}
