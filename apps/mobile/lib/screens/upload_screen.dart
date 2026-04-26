// lib/screens/upload_screen.dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/assessment.dart';
import '../services/assessment_service.dart';
import '../services/upload_service.dart';

enum UploadStep { name, upload, done }

class UploadScreen extends StatefulWidget {
  final Assessment assessment;

  const UploadScreen({
    super.key,
    required this.assessment,
  });

  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  final AssessmentService _assessmentSvc = AssessmentService();
  final UploadService _uploadSvc = UploadService();
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _nameCtrl = TextEditingController();

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
    super.dispose();
  }

  Future<void> _start() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Ingresa el nombre del estudiante');
      return;
    }

    if (_slots.isEmpty) {
      setState(() {
        _error = 'Sin estructura detectada.\nAnaliza el PDF desde el panel web primero.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      _studentId = await _assessmentSvc.findOrCreateStudent(_nameCtrl.text.trim());

      _submissionId = await _assessmentSvc.createSubmission(
        assessmentId: widget.assessment.id,
        studentId: _studentId!,
      );

      setState(() {
        _step = UploadStep.upload;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Error: $e';
        _loading = false;
      });
    }
  }

  Future<void> _capture() async {
    if (_submissionId == null || _studentId == null) {
      setState(() => _error = 'No se pudo iniciar la subida. Vuelve a comenzar.');
      return;
    }

    final ExerciseSlot slot = _slots[_current];

    setState(() {
      _slots[_current].status = SlotStatus.uploading;
      _error = null;
    });

    try {
      final XFile? picked = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1920,
        maxHeight: 2560,
      );

      if (picked == null) {
        setState(() => _slots[_current].status = SlotStatus.pending);
        return;
      }

      final String path = await _uploadSvc.uploadExerciseImage(
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
      setState(() {
        _slots[_current].status = SlotStatus.error;
        _error = 'Error: $e';
      });
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
    if (_submissionId == null) {
      setState(() => _error = 'No se encontró la entrega del estudiante.');
      return;
    }

    try {
      await _assessmentSvc.markSubmissionReady(_submissionId!);
      setState(() => _step = UploadStep.done);
    } catch (e) {
      setState(() => _error = 'Error al finalizar: $e');
    }
  }

  Widget _currentView() {
    switch (_step) {
      case UploadStep.name:
        return _nameView();
      case UploadStep.upload:
        return _uploadView();
      case UploadStep.done:
        return _doneView();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F4),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.assessment.title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(0.5),
          child: Container(
            height: 0.5,
            color: const Color(0xFFE5E5E4),
          ),
        ),
      ),
      body: SafeArea(child: _currentView()),
    );
  }

  Widget _nameView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Nombre del estudiante',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            widget.assessment.subjectLabel,
            style: const TextStyle(fontSize: 13, color: Color(0xFF78716C)),
          ),
          const SizedBox(height: 22),
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _error!,
                style: const TextStyle(
                  color: Color(0xFFDC2626),
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          TextField(
            controller: _nameCtrl,
            textCapitalization: TextCapitalization.words,
            onSubmitted: (_) => _start(),
            autofocus: true,
            style: const TextStyle(fontSize: 15),
            decoration: InputDecoration(
              hintText: 'Nombre completo',
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                  color: Color(0xFFE5E5E4),
                  width: 0.5,
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                  color: Color(0xFFE5E5E4),
                  width: 0.5,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                  color: Color(0xFF3B82F6),
                  width: 1.5,
                ),
              ),
              filled: true,
              fillColor: Colors.white,
            ),
          ),
          const SizedBox(height: 14),
          if (!widget.assessment.hasStructure)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'Sin estructura detectada. Analiza el PDF desde el panel web.',
                style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
              ),
            ),
          const SizedBox(height: 22),
          SizedBox(
            height: 50,
            child: ElevatedButton(
              onPressed: (_loading || !widget.assessment.hasStructure) ? null : _start,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      'Comenzar →',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _uploadView() {
    final ExerciseSlot slot = _slots[_current];
    final int done = _slots.where((s) => s.status == SlotStatus.done).length;

    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      _nameCtrl.text,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '$done/${_slots.length}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF78716C),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: _slots.asMap().entries.map((entry) {
                  final int i = entry.key;
                  final ExerciseSlot s = entry.value;

                  Color color;

                  if (i == _current) {
                    color = const Color(0xFF2563EB);
                  } else if (s.status == SlotStatus.done) {
                    color = const Color(0xFF22C55E);
                  } else if (s.status == SlotStatus.skipped || s.status == SlotStatus.error) {
                    color = const Color(0xFFF97316);
                  } else {
                    color = const Color(0xFFE5E5E4);
                  }

                  return Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _current = i),
                      child: Container(
                        height: 4,
                        margin: const EdgeInsets.symmetric(horizontal: 1.5),
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: const Color(0xFFE5E5E4),
                      width: 0.5,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEFF6FF),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              slot.itemLabel,
                              style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xFF2563EB),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${slot.maxPoints.toStringAsFixed(0)} pts',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF78716C),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Ejercicio ${_current + 1} de ${_slots.length}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF78716C),
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        slot.statement.isNotEmpty
                            ? slot.statement
                            : 'Sube la foto de este ejercicio',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (slot.status == SlotStatus.done) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0FDF4),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Row(
                            children: [
                              Icon(
                                Icons.check_circle_rounded,
                                color: Color(0xFF22C55E),
                                size: 16,
                              ),
                              SizedBox(width: 7),
                              Expanded(
                                child: Text(
                                  'Imagen subida correctamente',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: Color(0xFF16A34A),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (_error != null && slot.status == SlotStatus.error) ...[
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (slot.status != SlotStatus.done) ...[
                  SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: slot.status == SlotStatus.uploading ? null : _capture,
                      icon: slot.status == SlotStatus.uploading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.camera_alt_rounded),
                      label: Text(
                        slot.status == SlotStatus.uploading ? 'Subiendo...' : 'Tomar foto',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: slot.status == SlotStatus.uploading ? null : _skip,
                    child: const Text(
                      'Saltar este ejercicio',
                      style: TextStyle(
                        color: Color(0xFF78716C),
                        fontSize: 14,
                      ),
                    ),
                  ),
                ] else if (_current < _slots.length - 1) ...[
                  SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () => setState(() => _current++),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: const Text(
                        'Siguiente →',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ] else ...[
                  SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _finish,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16A34A),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: const Text(
                        '✓ Finalizar subida',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _doneView() {
    final int done = _slots.where((s) => s.status == SlotStatus.done).length;
    final int skip = _slots.where((s) {
      return s.status == SlotStatus.skipped || s.status == SlotStatus.error;
    }).length;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: const BoxDecoration(
                color: Color(0xFFF0FDF4),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_circle_rounded,
                color: Color(0xFF22C55E),
                size: 38,
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              '¡Subida completa!',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              '${_nameCtrl.text}\n$done ejercicios subidos'
              '${skip > 0 ? ' · $skip saltados' : ''}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF78716C),
                height: 1.6,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'La corrección automática comenzará en los próximos minutos.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF1D4ED8),
                  height: 1.4,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _step = UploadStep.name;
                      _nameCtrl.clear();
                      _studentId = null;
                      _submissionId = null;
                      _current = 0;

                      for (final ExerciseSlot slot in _slots) {
                        slot.status = SlotStatus.pending;
                        slot.uploadedPath = null;
                      }
                    }),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      side: const BorderSide(color: Color(0xFFE5E5E4)),
                    ),
                    child: const Text('Otro estudiante'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                    child: const Text(
                      'Volver',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
