// lib/screens/assessments_screen.dart
import 'package:flutter/material.dart';
import '../models/assessment.dart';
import '../services/assessment_service.dart';
import '../services/auth_service.dart';
import 'upload_screen.dart';
import 'login_screen.dart';

class AssessmentsScreen extends StatefulWidget {
  const AssessmentsScreen({super.key});
  @override
  State<AssessmentsScreen> createState() => _AssessmentsScreenState();
}

class _AssessmentsScreenState extends State<AssessmentsScreen> {
  final _service = AssessmentService();
  final _auth = AuthService();
  List<Assessment> _assessments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _service.getActiveAssessments();
      setState(() => _assessments = data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _signOut() async {
    await _auth.signOut();
    if (mounted) {
      Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => const LoginScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F4),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Corrector IA',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0.5),
          child: Container(height: 0.5, color: const Color(0xFFE5E5E4)),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded, color: Color(0xFF78716C)),
              onPressed: _load),
          IconButton(icon: const Icon(Icons.logout_rounded, color: Color(0xFF78716C)),
              onPressed: _signOut),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _errorView()
              : _assessments.isEmpty
                  ? _emptyView()
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              '${_assessments.length} evaluaciones activas',
                              style: const TextStyle(
                                  fontSize: 13, color: Color(0xFF78716C))),
                          ),
                          ..._assessments.map((a) => _Card(
                            assessment: a,
                            onTap: () => Navigator.push(context,
                                MaterialPageRoute(
                                    builder: (_) => UploadScreen(assessment: a)))
                                .then((_) => _load()),
                          )),
                        ],
                      ),
                    ),
    );
  }

  Widget _emptyView() => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
    Icon(Icons.assignment_outlined, size: 52, color: Colors.grey[300]),
    const SizedBox(height: 14),
    const Text('No hay evaluaciones activas',
        style: TextStyle(color: Color(0xFF78716C))),
    TextButton(onPressed: _load, child: const Text('Recargar')),
  ]));

  Widget _errorView() => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 44),
      const SizedBox(height: 10),
      Text(_error!, textAlign: TextAlign.center,
          style: const TextStyle(color: Color(0xFF78716C))),
      const SizedBox(height: 14),
      ElevatedButton(onPressed: _load, child: const Text('Reintentar')),
    ]),
  ));
}

class _Card extends StatelessWidget {
  final Assessment assessment;
  final VoidCallback onTap;
  const _Card({required this.assessment, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE5E5E4), width: 0.5),
        ),
        child: Row(children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.description_rounded,
                color: Color(0xFF3B82F6), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(assessment.title,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(
              '${assessment.subjectLabel} · ${assessment.gradeLevel ?? '—'} · '
              '${assessment.totalPoints?.toStringAsFixed(0) ?? '—'} pts',
              style: const TextStyle(fontSize: 12, color: Color(0xFF78716C)),
            ),
          ])),
          const SizedBox(width: 8),
          Column(children: [
            if (!assessment.hasStructure)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('Sin estructura',
                    style: TextStyle(fontSize: 10, color: Color(0xFFD97706),
                        fontWeight: FontWeight.w500)),
              ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFFA8A29E)),
          ]),
        ]),
      ),
    );
  }
}
