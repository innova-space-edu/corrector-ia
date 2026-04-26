// lib/services/auth_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final _sb = Supabase.instance.client;

  User? get currentUser => _sb.auth.currentUser;
  bool get isLoggedIn => currentUser != null;

  Future<void> signIn({required String email, required String password}) async {
    await _sb.auth.signInWithPassword(email: email, password: password);
  }

  Future<void> signUp({required String email, required String password}) async {
    final res = await _sb.auth.signUp(email: email, password: password);
    if (res.user != null) {
      await _sb.from('teachers').insert({
        'user_id': res.user!.id,
        'email': email,
        'full_name': email.split('@')[0],
      });
    }
  }

  Future<void> signOut() => _sb.auth.signOut();
}
