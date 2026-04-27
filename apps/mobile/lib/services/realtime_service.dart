// lib/services/realtime_service.dart
// Supabase Realtime para sincronización en tiempo real app ↔ web
import 'package:supabase_flutter/supabase_flutter.dart';

class RealtimeService {
  final _sb = Supabase.instance.client;
  final _channels = <String, RealtimeChannel>{};

  /// Escucha cambios en assessments (para actualizar la lista en la app)
  void subscribeToAssessments({required void Function() onUpdate}) {
    final key = 'assessments';
    _channels[key]?.unsubscribe();
    _channels[key] = _sb
        .channel('app_assessments')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'assessments',
          callback: (_) => onUpdate(),
        )
        .subscribe();
  }

  /// Escucha cuando llegan nuevos envíos o imágenes para una evaluación
  void subscribeToSubmissions({
    required String assessmentId,
    required void Function() onUpdate,
  }) {
    final key = 'submissions_$assessmentId';
    _channels[key]?.unsubscribe();
    _channels[key] = _sb
        .channel('app_submissions_$assessmentId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'submissions',
          filter: PostgresChangeFilter(
            type: FilterType.eq,
            column: 'assessment_id',
            value: assessmentId,
          ),
          callback: (_) => onUpdate(),
        )
        .subscribe();
  }

  /// Cancela todas las suscripciones
  void dispose() {
    for (final ch in _channels.values) {
      ch.unsubscribe();
    }
    _channels.clear();
  }
}
