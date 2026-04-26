// lib/services/assessment_service.dart
// Sincronización móvil ↔ web: lee evaluaciones del docente, crea estudiantes/envíos
// con teacher_id/course_id y registra páginas para que el panel web pueda corregirlas.
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/assessment.dart';

class AssessmentService {
  final _sb = Supabase.instance.client;

  Future<Map<String, dynamic>> _currentTeacher() async {
    final user = _sb.auth.currentUser;
    if (user == null) {
      throw Exception('No hay sesión activa. Vuelve a iniciar sesión.');
    }

    final teacher = await _sb
        .from('teachers')
        .select('id, school_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (teacher == null) {
      throw Exception(
        'Tu usuario existe, pero no tiene perfil docente en la tabla teachers.',
      );
    }

    return teacher as Map<String, dynamic>;
  }

  Future<List<Assessment>> getAllAssessments() async {
    final teacher = await _currentTeacher();

    final data = await _sb
        .from('assessments')
        .select(
          'id, title, subject, grade_level, total_points, status, course_id, '
          'official_test_json, assessment_structure_json',
        )
        .eq('teacher_id', teacher['id'])
        .order('created_at', ascending: false);

    return (data as List)
        .map((j) => Assessment.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<List<Assessment>> getActiveAssessments() async {
    final teacher = await _currentTeacher();

    final data = await _sb
        .from('assessments')
        .select(
          'id, title, subject, grade_level, total_points, status, course_id, '
          'official_test_json, assessment_structure_json',
        )
        .eq('teacher_id', teacher['id'])
        .eq('status', 'active')
        .order('created_at', ascending: false);

    return (data as List)
        .map((j) => Assessment.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<String> findOrCreateStudent(String fullName) async {
    final teacher = await _currentTeacher();
    final name = fullName.trim();

    final existing = await _sb
        .from('students')
        .select('id')
        .eq('school_id', teacher['school_id'])
        .ilike('full_name', name)
        .limit(1);

    if ((existing as List).isNotEmpty) {
      return existing[0]['id'] as String;
    }

    final created = await _sb
        .from('students')
        .insert({
          'full_name': name,
          'school_id': teacher['school_id'],
        })
        .select('id')
        .single();

    return created['id'] as String;
  }

  Future<String> createSubmission({
    required String assessmentId,
    required String studentId,
  }) async {
    final teacher = await _currentTeacher();

    final assessment = await _sb
        .from('assessments')
        .select('course_id')
        .eq('id', assessmentId)
        .single();

    final data = await _sb
        .from('submissions')
        .upsert({
          'assessment_id': assessmentId,
          'student_id': studentId,
          'course_id': assessment['course_id'],
          'teacher_id': teacher['id'],
          'status': 'pending',
          'grading_status': 'pending',
        }, onConflict: 'assessment_id,student_id')
        .select('id')
        .single();

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
  }) async {
    await _sb.from('submission_pages').upsert({
      'submission_id': submissionId,
      'assessment_id': assessmentId,
      'student_id': studentId,
      'item_id': itemId,
      'question_id': questionId,
      'image_path': imagePath,
      'upload_order': uploadOrder,
      'page_number': uploadOrder,
      'capture_mode': 'photo',
      'ocr_status': 'pending',
    }, onConflict: 'submission_id,question_id');
  }

  Future<void> markSubmissionReady(String submissionId) async {
    await _sb.from('submissions').update({
      'status': 'processing',
      'grading_status': 'pending',
      'submitted_at': DateTime.now().toIso8601String(),
    }).eq('id', submissionId);
  }
}
