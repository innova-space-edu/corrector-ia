// lib/services/upload_service.dart
import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';

class UploadService {
  final _sb = Supabase.instance.client;

  Future<String> uploadExerciseImage({
    required File imageFile,
    required String submissionId,
    required String questionId,
  }) async {
    final ext = imageFile.path.split('.').last.toLowerCase();
    final path = 'submissions/$submissionId/$questionId.$ext';

    await _sb.storage.from('submission-images').upload(
      path,
      imageFile,
      fileOptions: const FileOptions(upsert: true, contentType: 'image/jpeg'),
    );

    return path;
  }
}
