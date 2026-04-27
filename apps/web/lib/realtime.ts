// lib/realtime.ts
// Supabase Realtime subscriptions for live sync between app and web

import { createClient } from "@/lib/supabase/client"

type RealtimeCallback = () => void

export function subscribeToSubmissions(assessmentId: string, onUpdate: RealtimeCallback) {
  const supabase = createClient()
  const channel = supabase
    .channel(`submissions:${assessmentId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "submissions",
      filter: `assessment_id=eq.${assessmentId}`,
    }, onUpdate)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "submission_pages",
      filter: `assessment_id=eq.${assessmentId}`,
    }, onUpdate)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "grading_results",
      filter: `assessment_id=eq.${assessmentId}`,
    }, onUpdate)
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export function subscribeToAssessments(onUpdate: RealtimeCallback) {
  const supabase = createClient()
  const channel = supabase
    .channel("assessments:all")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "assessments",
    }, onUpdate)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "submissions",
    }, onUpdate)
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export function subscribeToReview(submissionId: string, onUpdate: RealtimeCallback) {
  const supabase = createClient()
  const channel = supabase
    .channel(`review:${submissionId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "submission_pages",
      filter: `submission_id=eq.${submissionId}`,
    }, onUpdate)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "grading_results",
      filter: `submission_id=eq.${submissionId}`,
    }, onUpdate)
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
