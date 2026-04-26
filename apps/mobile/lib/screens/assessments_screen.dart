// lib/screens/assessments_screen.dart
import 'package:flutter/material.dart';
import '../models/assessment.dart';
import '../services/assessment_service.dart';
import '../theme/app_theme.dart';
import 'upload_screen.dart';

class AssessmentsScreen extends StatefulWidget {
  const AssessmentsScreen({super.key});
  @override
  State<AssessmentsScreen> createState() => _AssessmentsScreenState();
}

class _AssessmentsScreenState extends State<AssessmentsScreen> {
  final _svc = AssessmentService();
  List<Assessment> _all = [];
  List<Assessment> _filtered = [];
  bool _loading = true;
  String _search = '';
  String _filter = 'all'; // all | active | draft

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _all = data; _applyFilter(); _loading = false; });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  void _applyFilter() {
    _filtered = _all.where((a) {
      final matchesSearch = _search.isEmpty ||
          a.title.toLowerCase().contains(_search.toLowerCase()) ||
          a.subjectLabel.toLowerCase().contains(_search.toLowerCase());
      final matchesStatus = _filter == 'all' || a.status == _filter;
      return matchesSearch && matchesStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Evaluaciones'),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded),
              color: AppColors.textSecondary, onPressed: _load),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(100),
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() { _search = v; _applyFilter(); }),
                decoration: InputDecoration(
                  hintText: 'Buscar evaluación...',
                  prefixIcon: const Icon(Icons.search_rounded,
                      color: AppColors.textHint, size: 20),
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  fillColor: AppColors.background,
                ),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Row(children: [
                _FilterChip('Todas', 'all', _filter, (v) => setState(() { _filter = v; _applyFilter(); })),
                const SizedBox(width: 8),
                _FilterChip('Activas', 'active', _filter, (v) => setState(() { _filter = v; _applyFilter(); })),
                const SizedBox(width: 8),
                _FilterChip('Borradores', 'draft', _filter, (v) => setState(() { _filter = v; _applyFilter(); })),
              ]),
            ),
          ]),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _filtered.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.search_off_rounded, size: 48, color: AppColors.textHint),
                  const SizedBox(height: 12),
                  Text(_search.isNotEmpty ? 'Sin resultados para "$_search"' : 'Sin evaluaciones',
                      style: const TextStyle(color: AppColors.textSecondary)),
                  TextButton(onPressed: _load, child: const Text('Recargar')),
                ]))
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AppColors.primary,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final a = _filtered[i];
                      final color = AppTheme.subjectColor(a.subject);
                      return GestureDetector(
                        onTap: a.hasStructure
                            ? () => Navigator.push(context,
                                MaterialPageRoute(builder: (_) => UploadScreen(assessment: a)))
                            : () => _showNoStructure(context),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Row(children: [
                            Container(width: 50, height: 50,
                              decoration: BoxDecoration(
                                color: color.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(AppTheme.subjectIcon(a.subject),
                                  color: color, size: 26)),
                            const SizedBox(width: 14),
                            Expanded(child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(a.title,
                                  style: const TextStyle(fontSize: 14,
                                      fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                                  maxLines: 2, overflow: TextOverflow.ellipsis),
                              const SizedBox(height: 5),
                              Wrap(spacing: 6, children: [
                                _Tag(a.subjectLabel, color),
                                if (a.gradeLevel != null) _Tag(a.gradeLevel!, AppColors.textSecondary),
                                if (a.totalPoints != null)
                                  _Tag('${a.totalPoints!.toStringAsFixed(0)} pts', AppColors.textSecondary),
                                _StatusTag(a.status),
                              ]),
                            ])),
                            const SizedBox(width: 8),
                            Icon(
                              a.hasStructure ? Icons.chevron_right_rounded : Icons.warning_amber_rounded,
                              color: a.hasStructure ? AppColors.textHint : AppColors.warning,
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  void _showNoStructure(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Analiza el PDF de esta evaluación desde el panel web primero'),
      backgroundColor: AppColors.warning,
      duration: Duration(seconds: 3),
    ));
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final Function(String) onTap;
  const _FilterChip(this.label, this.value, this.current, this.onTap);

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onTap(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? AppColors.primary : AppColors.border),
        ),
        child: Text(label, style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w500,
            color: active ? Colors.white : AppColors.textSecondary)),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String text; final Color color;
  const _Tag(this.text, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20)),
    child: Text(text, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
  );
}

class _StatusTag extends StatelessWidget {
  final String status;
  const _StatusTag(this.status);
  @override
  Widget build(BuildContext context) {
    final data = <String, (String, Color)>{
      'active': ('Activa', AppColors.success),
      'draft': ('Borrador', AppColors.textSecondary),
      'closed': ('Cerrada', AppColors.primary),
    }[status] ?? ('—', AppColors.textHint);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: data.$2.withOpacity(0.12),
          borderRadius: BorderRadius.circular(20)),
      child: Text(data.$1, style: TextStyle(fontSize: 10, color: data.$2, fontWeight: FontWeight.w600)),
    );
  }
}
