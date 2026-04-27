// lib/services/upload_service.dart
import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';

class UploadService {
  final _sb = Supabase.instance.client;

  /// Sube imagen (JPG/PNG) al bucket submission-images
  Future<String> uploadExerciseImage({
    required File imageFile,
    required String submissionId,
    required String questionId,
  }) async {
    final ext = imageFile.path.split('.').last.toLowerCase();
    final safeExt = ['jpg', 'jpeg', 'png', 'heic'].contains(ext) ? ext : 'jpg';
    final path = 'submissions/$submissionId/${questionId}_${DateTime.now().millisecondsSinceEpoch}.$safeExt';

    await _sb.storage.from('submission-images').upload(
      path,
      imageFile,
      fileOptions: FileOptions(
        upsert: true,
        contentType: safeExt == 'png' ? 'image/png' : 'image/jpeg',
      ),
    );
    return path;
  }

  /// Sube PDF al bucket assessment-assets (prueba oficial del estudiante)
  Future<String> uploadStudentPdf({
    required File pdfFile,
    required String submissionId,
    required String questionId,
  }) async {
    final path = 'submissions/$submissionId/${questionId}_${DateTime.now().millisecondsSinceEpoch}.pdf';
    await _sb.storage.from('submission-images').upload(
      path,
      pdfFile,
      fileOptions: const FileOptions(upsert: true, contentType: 'application/pdf'),
    );
    return path;
  }

  /// Obtiene URL firmada para ver el archivo
  Future<String> getSignedUrl(String path, {String bucket = 'submission-images'}) async {
    return await _sb.storage.from(bucket).createSignedUrl(path, 300);
  }
}
