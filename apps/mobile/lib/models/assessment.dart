// lib/models/assessment.dart

class Assessment {
  final String id;
  final String title;
  final String subject;
  final String? gradeLevel;
  final double? totalPoints;
  final String status;
  final AssessmentStructure? structure;

  Assessment({
    required this.id,
    required this.title,
    required this.subject,
    this.gradeLevel,
    this.totalPoints,
    required this.status,
    this.structure,
  });

  factory Assessment.fromJson(Map<String, dynamic> json) {
    return Assessment(
      id: json['id'] as String,
      title: json['title'] as String,
      subject: json['subject'] as String,
      gradeLevel: json['grade_level'] as String?,
      totalPoints: (json['total_points'] as num?)?.toDouble(),
      status: json['status'] as String? ?? 'draft',
      structure: json['official_test_json'] != null
          ? AssessmentStructure.fromJson(
              json['official_test_json'] as Map<String, dynamic>)
          : null,
    );
  }

  String get subjectLabel {
    const labels = {
      'math': 'Matemática', 'language': 'Lenguaje',
      'science': 'Ciencias', 'history': 'Historia', 'english': 'Inglés',
    };
    return labels[subject] ?? subject;
  }

  bool get hasStructure =>
      structure != null && structure!.items.isNotEmpty;
}

class AssessmentStructure {
  final String? assessmentTitle;
  final double? totalPoints;
  final List<AssessmentItem> items;

  AssessmentStructure({
    this.assessmentTitle,
    this.totalPoints,
    required this.items,
  });

  factory AssessmentStructure.fromJson(Map<String, dynamic> json) {
    final itemsList = json['items'] as List<dynamic>? ?? [];
    return AssessmentStructure(
      assessmentTitle: json['assessment_title'] as String?,
      totalPoints: (json['total_points'] as num?)?.toDouble(),
      items: itemsList
          .map((i) => AssessmentItem.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }
}

class AssessmentItem {
  final String itemId;
  final String label;
  final String? pointsRule;
  final List<AssessmentQuestion> questions;

  AssessmentItem({
    required this.itemId,
    required this.label,
    this.pointsRule,
    required this.questions,
  });

  factory AssessmentItem.fromJson(Map<String, dynamic> json) {
    final qList = json['questions'] as List<dynamic>? ?? [];
    return AssessmentItem(
      itemId: json['item_id'] as String,
      label: json['label'] as String,
      pointsRule: json['points_rule'] as String?,
      questions: qList
          .map((q) => AssessmentQuestion.fromJson(q as Map<String, dynamic>))
          .toList(),
    );
  }
}

class AssessmentQuestion {
  final String questionId;
  final String statement;
  final double maxPoints;
  final String questionType;

  AssessmentQuestion({
    required this.questionId,
    required this.statement,
    required this.maxPoints,
    required this.questionType,
  });

  factory AssessmentQuestion.fromJson(Map<String, dynamic> json) {
    return AssessmentQuestion(
      questionId: json['question_id'] as String,
      statement: json['statement'] as String? ?? '',
      maxPoints: (json['max_points'] as num?)?.toDouble() ?? 0,
      questionType: json['question_type'] as String? ?? 'development',
    );
  }
}

// ─── Exercise slot para subida guiada ────────────────────────────────────────

enum SlotStatus { pending, uploading, done, skipped, error }

class ExerciseSlot {
  final String itemId;
  final String itemLabel;
  final String questionId;
  final String statement;
  final double maxPoints;
  final String questionType;
  SlotStatus status;
  String? uploadedPath;

  ExerciseSlot({
    required this.itemId,
    required this.itemLabel,
    required this.questionId,
    required this.statement,
    required this.maxPoints,
    required this.questionType,
    this.status = SlotStatus.pending,
    this.uploadedPath,
  });

  static List<ExerciseSlot> fromStructure(AssessmentStructure structure) {
    final slots = <ExerciseSlot>[];
    for (final item in structure.items) {
      for (final q in item.questions) {
        slots.add(ExerciseSlot(
          itemId: item.itemId,
          itemLabel: item.label,
          questionId: q.questionId,
          statement: q.statement,
          maxPoints: q.maxPoints,
          questionType: q.questionType,
        ));
      }
    }
    return slots;
  }
}
