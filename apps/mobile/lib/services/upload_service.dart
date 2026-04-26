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
    final safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].contains(ext) ? ext : 'jpg';
    final contentType = safeExt == 'png'
        ? 'image/png'
        : safeExt == 'webp'
            ? 'image/webp'
            : safeExt == 'heic'
                ? 'image/heic'
                : 'image/jpeg';

    final path = 'submissions/$submissionId/$questionId.$safeExt';

    await _sb.storage.from('submission-images').upload(
          path,
          imageFile,
          fileOptions: FileOptions(upsert: true, contentType: contentType),
        );

    return path;
  }
}
