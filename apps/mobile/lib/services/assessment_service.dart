// lib/services/assessment_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/assessment.dart';

class AssessmentService {
  final _sb = Supabase.instance.client;

  // Trae TODAS las evaluaciones — sincronizado con web
  Future<List<Assessment>> getAllAssessments() async {
    final data = await _sb
        .from('assessments')
        .select('id, title, subject, grade_level, total_points, status, official_test_json')
        .order('created_at', ascending: false);
    return (data as List).map((j) => Assessment.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<String> findOrCreateStudent(String fullName) async {
    final existing = await _sb.from('students').select('id')
        .ilike('full_name', fullName.trim()).limit(1);
    if ((existing as List).isNotEmpty) return existing[0]['id'] as String;
    final created = await _sb.from('students')
        .insert({'full_name': fullName.trim()}).select('id').single();
    return created['id'] as String;
  }

  Future<String> createSubmission({
    required String assessmentId,
    required String studentId,
    String? courseLabel, // curso ingresado en la app
  }) async {
    final data = await _sb.from('submissions').insert({
      'assessment_id': assessmentId,
      'student_id': studentId,
      'status': 'pending',
      'grading_status': 'pending',
      if (courseLabel != null && courseLabel.isNotEmpty) 'notes': courseLabel,
    }).select('id').single();
    return data['id'] as String;
  }

  Future<void> registerPage({
    required String submissionId,
    required String assessmentId,
    required String studentId,
    required String itemId,
    required String questionId,
    required String imagePath,
    required int uploadOrder,
    String captureMode = 'photo', // 'photo' | 'gallery' | 'pdf'
  }) async {
    await _sb.from('submission_pages').insert({
      'submission_id': submissionId,
      'assessment_id': assessmentId,
      'student_id': studentId,
      'item_id': itemId,
      'question_id': questionId,
      'image_path': imagePath,
      'upload_order': uploadOrder,
      'capture_mode': captureMode,
      'ocr_status': 'pending',
    });
  }

  Future<void> markSubmissionReady(String submissionId) async {
    await _sb.from('submissions')
        .update({'status': 'processing'}).eq('id', submissionId);
  }
}
