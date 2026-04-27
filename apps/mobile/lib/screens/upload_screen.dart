// lib/screens/upload_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import '../models/assessment.dart';
import '../services/assessment_service.dart';
import '../services/upload_service.dart';
import '../theme/app_theme.dart';

enum UploadStep { name, upload, done }

class UploadScreen extends StatefulWidget {
  final Assessment assessment;
  const UploadScreen({super.key, required this.assessment});
  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  final _assessmentSvc = AssessmentService();
  final _uploadSvc = UploadService();
  final _picker = ImagePicker();
  final _nameCtrl = TextEditingController();
  final _courseCtrl = TextEditingController();

  String? _studentId;
  String? _submissionId;
  List<ExerciseSlot> _slots = [];
  int _current = 0;
  bool _loading = false;
  String? _error;
  UploadStep _step = UploadStep.name;

  @override
  void initState() {
    super.initState();
    if (widget.assessment.hasStructure) {
      _slots = ExerciseSlot.fromStructure(widget.assessment.structure!);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _courseCtrl.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Ingresa el nombre del estudiante');
      return;
    }
    if (_slots.isEmpty) {
      setState(() => _error = 'Sin estructura detectada.\nAnaliza el PDF desde el panel web primero.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      _studentId = await _assessmentSvc.findOrCreateStudent(_nameCtrl.text.trim());
      _submissionId = await _assessmentSvc.createSubmission(
        assessmentId: widget.assessment.id,
        studentId: _studentId!,
        courseLabel: _courseCtrl.text.trim().isNotEmpty ? _courseCtrl.text.trim() : null,
      );
      setState(() { _step = UploadStep.upload; _loading = false; });
    } catch (e) {
      setState(() { _error = 'Error: $e'; _loading = false; });
    }
  }

  // Tomar foto con cámara
  Future<void> _captureCamera() async {
    await _processImage(ImageSource.camera);
  }

  // Seleccionar desde galería
  Future<void> _pickGallery() async {
    await _processImage(ImageSource.gallery);
  }

  // Subir PDF
  Future<void> _pickPdf() async {
    final slot = _slots[_current];
    setState(() { _slots[_current].status = SlotStatus.uploading; _error = null; });
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );
      if (result == null || result.files.single.path == null) {
        setState(() => _slots[_current].status = SlotStatus.pending);
        return;
      }
      final path = await _uploadSvc.uploadStudentPdf(
        pdfFile: File(result.files.single.path!),
        submissionId: _submissionId!,
        questionId: slot.questionId,
      );
      await _assessmentSvc.registerPage(
        submissionId: _submissionId!,
        assessmentId: widget.assessment.id,
        studentId: _studentId!,
        itemId: slot.itemId,
        questionId: slot.questionId,
        imagePath: path,
        uploadOrder: _current,
        captureMode: 'pdf',
      );
      setState(() {
        _slots[_current].status = SlotStatus.done;
        _slots[_current].uploadedPath = path;
      });
      await Future.delayed(const Duration(milliseconds: 500));
      if (_current < _slots.length - 1) {
        setState(() => _current++);
      } else {
        await _finish();
      }
    } catch (e) {
      setState(() { _slots[_current].status = SlotStatus.error; _error = 'Error: $e'; });
    }
  }

  Future<void> _processImage(ImageSource source) async {
    final slot = _slots[_current];
    setState(() { _slots[_current].status = SlotStatus.uploading; _error = null; });
    try {
      final XFile? picked = await _picker.pickImage(
        source: source, imageQuality: 88, maxWidth: 1920, maxHeight: 2560,
      );
      if (picked == null) {
        setState(() => _slots[_current].status = SlotStatus.pending);
        return;
      }
      final path = await _uploadSvc.uploadExerciseImage(
        imageFile: File(picked.path),
        submissionId: _submissionId!,
        questionId: slot.questionId,
      );
      await _assessmentSvc.registerPage(
        submissionId: _submissionId!,
        assessmentId: widget.assessment.id,
        studentId: _studentId!,
        itemId: slot.itemId,
        questionId: slot.questionId,
        imagePath: path,
        uploadOrder: _current,
        captureMode: source == ImageSource.camera ? 'photo' : 'gallery',
      );
      setState(() {
        _slots[_current].status = SlotStatus.done;
        _slots[_current].uploadedPath = path;
      });
      await Future.delayed(const Duration(milliseconds: 500));
      if (_current < _slots.length - 1) {
        setState(() => _current++);
      } else {
        await _finish();
      }
    } catch (e) {
      setState(() { _slots[_current].status = SlotStatus.error; _error = 'Error: $e'; });
    }
  }

  Future<void> _skip() async {
    setState(() => _slots[_current].status = SlotStatus.skipped);
    if (_current < _slots.length - 1) {
      setState(() => _current++);
    } else {
      await _finish();
    }
  }

  Future<void> _finish() async {
    if (_submissionId == null) return;
    try {
      await _assessmentSvc.markSubmissionReady(_submissionId!);
      setState(() => _step = UploadStep.done);
    } catch (e) {
      setState(() => _error = 'Error al finalizar: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white, elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(widget.assessment.title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(0.5),
            child: Divider(height: 0.5, color: AppColors.border)),
      ),
      body: SafeArea(child: () {
        switch (_step) {
          case UploadStep.name: return _nameView();
          case UploadStep.upload: return _uploadView();
          case UploadStep.done: return _doneView();
        }
      }()),
    );
  }

  // ── VISTA NOMBRE ──────────────────────────────────────────────────────────
  Widget _nameView() => SingleChildScrollView(
    padding: const EdgeInsets.all(22),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Datos del estudiante',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      const SizedBox(height: 4),
      Text(widget.assessment.subjectLabel,
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
      const SizedBox(height: 20),

      if (_error != null) ...[
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.error.withOpacity(0.08),
              borderRadius: BorderRadius.circular(10)),
          child: Text(_error!, style: TextStyle(color: AppColors.error, fontSize: 13)),
        ),
        const SizedBox(height: 14),
      ],

      _label('Nombre completo del estudiante'),
      const SizedBox(height: 6),
      TextField(
        controller: _nameCtrl,
        textCapitalization: TextCapitalization.words,
        onSubmitted: (_) => _start(),
        autofocus: true,
        decoration: InputDecoration(
          hintText: 'Ej: María González',
          prefixIcon: const Icon(Icons.person_outline_rounded, color: AppColors.textHint, size: 20),
        ),
      ),
      const SizedBox(height: 14),

      _label('Curso (opcional)'),
      const SizedBox(height: 6),
      TextField(
        controller: _courseCtrl,
        decoration: InputDecoration(
          hintText: 'Ej: 4°A Medio',
          prefixIcon: const Icon(Icons.class_outlined, color: AppColors.textHint, size: 20),
        ),
      ),
      const SizedBox(height: 10),

      // Info de la evaluación
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withOpacity(0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(AppTheme.subjectIcon(widget.assessment.subject),
                color: AppColors.primary, size: 18),
            const SizedBox(width: 8),
            Text(widget.assessment.subjectLabel,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13,
                    color: AppColors.primary)),
          ]),
          const SizedBox(height: 4),
          Text('${widget.assessment.gradeLevel ?? '—'} · ${widget.assessment.totalPoints?.toStringAsFixed(0) ?? '—'} pts · ${_slots.length} ejercicios',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ]),
      ),

      if (!widget.assessment.hasStructure) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10)),
          child: const Text('Sin estructura detectada. Analiza el PDF desde el panel web.',
              style: TextStyle(fontSize: 12, color: AppColors.warning)),
        ),
      ],

      const SizedBox(height: 22),
      SizedBox(
        height: 50,
        child: ElevatedButton(
          onPressed: (_loading || !widget.assessment.hasStructure) ? null : _start,
          child: _loading
              ? const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Text('Comenzar subida →',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        ),
      ),
    ]),
  );

  // ── VISTA SUBIDA ──────────────────────────────────────────────────────────
  Widget _uploadView() {
    final slot = _slots[_current];
    final done = _slots.where((s) => s.status == SlotStatus.done).length;
    final isUploading = slot.status == SlotStatus.uploading;

    return Column(children: [
      // Header
      Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_nameCtrl.text,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  overflow: TextOverflow.ellipsis),
              if (_courseCtrl.text.isNotEmpty)
                Text(_courseCtrl.text,
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ])),
            Text('$done/${_slots.length}',
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ]),
          const SizedBox(height: 8),
          Row(children: _slots.asMap().entries.map((e) {
            final i = e.key; final s = e.value;
            Color c;
            if (i == _current) c = AppColors.primary;
            else if (s.status == SlotStatus.done) c = AppColors.success;
            else if (s.status == SlotStatus.skipped || s.status == SlotStatus.error)
              c = AppColors.warning;
            else c = AppColors.border;
            return Expanded(child: GestureDetector(
              onTap: () => setState(() => _current = i),
              child: Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 1.5),
                  decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
            ));
          }).toList()),
        ]),
      ),

      Expanded(child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Ejercicio actual
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text(slot.itemLabel,
                      style: const TextStyle(fontSize: 11, color: AppColors.primary,
                          fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 8),
                Text('${slot.maxPoints.toStringAsFixed(0)} pts',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                const Spacer(),
                Text('${_current + 1}/${_slots.length}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ]),
              const SizedBox(height: 10),
              Text(slot.statement.isNotEmpty ? slot.statement : 'Sube la foto de este ejercicio',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),

              if (slot.status == SlotStatus.done) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10)),
                  child: Row(children: [
                    Icon(Icons.check_circle_rounded, color: AppColors.success, size: 16),
                    const SizedBox(width: 8),
                    const Text('Subida exitosa — aparecerá en el panel web',
                        style: TextStyle(fontSize: 12, color: AppColors.success)),
                  ]),
                ),
              ],
              if (_error != null && slot.status == SlotStatus.error) ...[
                const SizedBox(height: 10),
                Text(_error!, style: TextStyle(fontSize: 12, color: AppColors.error)),
              ],
            ]),
          ),

          const SizedBox(height: 14),

          if (slot.status != SlotStatus.done) ...[
            // 3 botones: cámara, galería, PDF
            Row(children: [
              Expanded(child: _UploadBtn(
                icon: Icons.camera_alt_rounded,
                label: isUploading ? 'Subiendo...' : 'Cámara',
                color: AppColors.primary,
                loading: isUploading,
                onTap: isUploading ? null : _captureCamera,
              )),
              const SizedBox(width: 8),
              Expanded(child: _UploadBtn(
                icon: Icons.photo_library_rounded,
                label: 'Galería',
                color: AppColors.success,
                loading: false,
                onTap: isUploading ? null : _pickGallery,
              )),
              const SizedBox(width: 8),
              Expanded(child: _UploadBtn(
                icon: Icons.picture_as_pdf_rounded,
                label: 'PDF',
                color: const Color(0xFFDC2626),
                loading: false,
                onTap: isUploading ? null : _pickPdf,
              )),
            ]),
            const SizedBox(height: 8),
            TextButton(
              onPressed: isUploading ? null : _skip,
              child: const Text('Saltar este ejercicio',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
            ),
          ] else if (_current < _slots.length - 1) ...[
            SizedBox(height: 50, child: ElevatedButton(
              onPressed: () => setState(() => _current++),
              child: const Text('Siguiente →',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            )),
          ] else ...[
            SizedBox(height: 50, child: ElevatedButton(
              onPressed: _finish,
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
              child: const Text('✓ Finalizar subida',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            )),
          ],
        ]),
      )),
    ]);
  }

  // ── VISTA LISTO ───────────────────────────────────────────────────────────
  Widget _doneView() {
    final done = _slots.where((s) => s.status == SlotStatus.done).length;
    final skip = _slots.where((s) => s.status == SlotStatus.skipped || s.status == SlotStatus.error).length;
    return Center(child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 70, height: 70,
            decoration: BoxDecoration(color: AppColors.success.withOpacity(0.1), shape: BoxShape.circle),
            child: Icon(Icons.check_circle_rounded, color: AppColors.success, size: 38)),
        const SizedBox(height: 18),
        const Text('¡Subida completa!',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text('${_nameCtrl.text}\n$done ejercicios subidos${skip > 0 ? ' · $skip saltados' : ''}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.6)),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primary.withOpacity(0.2))),
          child: const Text(
            '✓ Las imágenes aparecerán inmediatamente en el panel web.\n'
            'La IA comenzará la corrección en breve.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.primary, height: 1.4),
          ),
        ),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(child: OutlinedButton(
            onPressed: () => setState(() {
              _step = UploadStep.name;
              _nameCtrl.clear(); _courseCtrl.clear();
              _studentId = null; _submissionId = null; _current = 0;
              for (final s in _slots) { s.status = SlotStatus.pending; s.uploadedPath = null; }
            }),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 13),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              side: const BorderSide(color: AppColors.border),
            ),
            child: const Text('Otro estudiante'),
          )),
          const SizedBox(width: 10),
          Expanded(child: ElevatedButton(
            onPressed: () => Navigator.pop(context),
            style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 13)),
            child: const Text('Volver', style: TextStyle(fontWeight: FontWeight.w600)),
          )),
        ]),
      ]),
    ));
  }

  Widget _label(String t) => Text(t,
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary));
}

class _UploadBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final bool loading;
  final VoidCallback? onTap;
  const _UploadBtn({required this.icon, required this.label, required this.color,
      required this.loading, this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: onTap == null ? AppColors.border.withOpacity(0.3) : color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: onTap == null ? AppColors.border : color.withOpacity(0.3)),
      ),
      child: Column(children: [
        loading
            ? SizedBox(width: 22, height: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: color))
            : Icon(icon, color: onTap == null ? AppColors.textHint : color, size: 24),
        const SizedBox(height: 5),
        Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
            color: onTap == null ? AppColors.textHint : color)),
      ]),
    ),
  );
}
