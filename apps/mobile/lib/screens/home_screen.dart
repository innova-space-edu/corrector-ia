// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/assessment_service.dart';
import '../models/assessment.dart';
import 'login_screen.dart';
import 'upload_screen.dart';
import 'assessments_screen.dart';

// ── HOME SCREEN (raíz con drawer + bottom nav) ────────────────────────────────

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  void switchTab(int index) => setState(() => _tab = index);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // FIX 1: drawer en el Scaffold raíz — Builder da el ctx correcto al menu button
      drawer: const _AppDrawer(),
      body: IndexedStack(index: _tab, children: [
        _HomeTab(onSwitchTab: switchTab),
        const AssessmentsScreen(),
        _QuickUploadTab(onSwitchTab: switchTab),
      ]),
      bottomNavigationBar: _BottomNav(tab: _tab, onTap: switchTab),
    );
  }
}

// ── BOTTOM NAV ────────────────────────────────────────────────────────────────

class _BottomNav extends StatelessWidget {
  final int tab;
  final ValueChanged<int> onTap;
  const _BottomNav({required this.tab, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.home_rounded, Icons.home_outlined, 'Inicio'),
      (Icons.assignment_rounded, Icons.assignment_outlined, 'Evaluaciones'),
      (Icons.camera_alt_rounded, Icons.camera_alt_outlined, 'Subir'),
    ];

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: items.asMap().entries.map((e) {
              final i = e.key;
              final (activeIcon, icon, label) = e.value;
              final active = tab == i;
              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: active
                          ? AppColors.primary.withOpacity(0.08)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(active ? activeIcon : icon,
                          color: active ? AppColors.primary : AppColors.textHint,
                          size: 24),
                      const SizedBox(height: 3),
                      Text(label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                            color: active ? AppColors.primary : AppColors.textHint,
                          )),
                    ]),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

// ── DRAWER ─────────────────────────────────────────────────────────────────────

class _AppDrawer extends StatelessWidget {
  const _AppDrawer();

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;

    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Header azul
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.primary, Color(0xFF1D4ED8)],
              ),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 56, height: 56,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.asset(
                    'assets/icon/corrector_ia_docente.png',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.school_rounded, color: AppColors.primary, size: 28),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text('Corrector IA',
                  style: TextStyle(color: Colors.white, fontSize: 18,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(user?.email ?? '',
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),

          const SizedBox(height: 8),

          // Items del drawer
          _item(context, Icons.home_rounded, 'Inicio', () {
            Navigator.pop(context);
            _homeState(context)?.switchTab(0);
          }),
          _item(context, Icons.assignment_rounded, 'Mis evaluaciones', () {
            Navigator.pop(context);
            _homeState(context)?.switchTab(1);
          }),
          _item(context, Icons.camera_alt_rounded, 'Subir ejercicios', () {
            Navigator.pop(context);
            _homeState(context)?.switchTab(2);
          }),

          const Divider(indent: 20, endIndent: 20, color: AppColors.border),

          _item(context, Icons.info_outline_rounded, 'Cómo usar la app', () {
            Navigator.pop(context);
            _showHowToUse(context);
          }),
          _item(context, Icons.sync_rounded, 'Sincronizar', () {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Sincronizando con el panel web...'),
              backgroundColor: AppColors.success,
            ));
          }),

          const Spacer(),
          const Divider(color: AppColors.border),

          // Cerrar sesión
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: ListTile(
              leading: const Icon(Icons.logout_rounded, color: AppColors.error, size: 22),
              title: const Text('Cerrar sesión',
                  style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w500)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              onTap: () async {
                Navigator.pop(context);
                await Supabase.instance.client.auth.signOut();
                if (context.mounted) {
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (_) => false,
                  );
                }
              },
            ),
          ),
        ]),
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: ListTile(
        leading: Icon(icon, color: AppColors.textSecondary, size: 22),
        title: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        onTap: onTap,
        dense: true,
      ),
    );
  }

  // FIX 2: accede al HomeScreen state desde el context del drawer
  _HomeScreenState? _homeState(BuildContext context) {
    return context.findRootAncestorStateOfType<_HomeScreenState>();
  }

  void _showHowToUse(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Cómo usar la app',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ...[
            ('1. Crea evaluaciones en la web',
                'Entra a corrector-ia-beryl.vercel.app'),
            ('2. Activa la evaluación',
                'Cámbiala a estado "Activa" desde el panel web'),
            ('3. Abre la app y recarga',
                'Las evaluaciones activas aparecerán automáticamente'),
            ('4. Ingresa nombre del estudiante',
                'Antes de subir sus ejercicios'),
            ('5. Toma foto de cada ejercicio',
                'La app te guía ítem por ítem'),
            ('6. La IA corrige en minutos',
                'Revisa los resultados en el panel web'),
          ].map((s) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 7, height: 7, margin: const EdgeInsets.only(top: 5, right: 10),
                decoration: const BoxDecoration(
                    color: AppColors.primary, shape: BoxShape.circle)),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(s.$2,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ])),
            ]),
          )),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }
}

// ── HOME TAB ──────────────────────────────────────────────────────────────────

class _HomeTab extends StatefulWidget {
  final ValueChanged<int> onSwitchTab;
  const _HomeTab({required this.onSwitchTab});
  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  List<Assessment> _recent = [];
  bool _loading = true;
  final _svc = AssessmentService();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _recent = data.take(3).toList(); _loading = false; });
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final name = user?.email?.split('@')[0] ?? 'Docente';
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    // FIX 3: NO crear Scaffold nuevo aquí — usar AppBar directamente en column
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        // FIX 4: Builder correcto para abrir el drawer del Scaffold padre
        leading: Builder(builder: (ctx) => IconButton(
          icon: const Icon(Icons.menu_rounded, color: AppColors.textPrimary),
          onPressed: () => Scaffold.of(ctx).openDrawer(),
        )),
        title: Row(children: [
          Container(
            width: 30, height: 30,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              color: AppColors.primary.withOpacity(0.1),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(9),
              child: Image.asset('assets/icon/corrector_ia_docente.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(
                      Icons.school_rounded, size: 16, color: AppColors.primary)),
            ),
          ),
          const SizedBox(width: 9),
          const Text('Corrector IA'),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
            onPressed: _load,
            tooltip: 'Sincronizar',
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(0.5),
          child: Divider(height: 0.5, color: AppColors.border),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

            // Bienvenida
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, Color(0xFF1D4ED8)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$greeting,',
                      style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(name, style: const TextStyle(
                      color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Panel docente activo',
                        style: TextStyle(color: Colors.white, fontSize: 12,
                            fontWeight: FontWeight.w500)),
                  ),
                ])),
                const SizedBox(width: 12),
                Container(
                  width: 58, height: 58,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.school_rounded, color: Colors.white, size: 30),
                ),
              ]),
            ),

            const SizedBox(height: 22),

            // Acciones rápidas — FIX 5: usar widget.onSwitchTab en vez de findAncestorState
            const Text('Acciones rápidas',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _QuickAction(
                icon: Icons.camera_alt_rounded,
                label: 'Subir\nEjercicios',
                color: AppColors.primary,
                onTap: () => widget.onSwitchTab(2), // tab Subir
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickAction(
                icon: Icons.assignment_rounded,
                label: 'Ver\nEvaluaciones',
                color: AppColors.success,
                onTap: () => widget.onSwitchTab(1), // tab Evaluaciones
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickAction(
                icon: Icons.sync_rounded,
                label: 'Sincro-\nnizar',
                color: AppColors.warning,
                onTap: _load,
              )),
            ]),

            const SizedBox(height: 22),

            // Evaluaciones recientes
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Evaluaciones activas',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary)),
              TextButton(
                onPressed: () => widget.onSwitchTab(1),
                child: const Text('Ver todas', style: TextStyle(fontSize: 13)),
              ),
            ]),
            const SizedBox(height: 8),

            if (_loading)
              const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: AppColors.primary),
              ))
            else if (_recent.isEmpty)
              _EmptyState(
                icon: Icons.assignment_outlined,
                title: 'Sin evaluaciones activas',
                subtitle: 'Crea y activa una evaluación desde el panel web',
                onAction: _load,
                actionLabel: 'Recargar',
              )
            else
              ..._recent.map((a) => _AssessmentCard(
                assessment: a,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => UploadScreen(assessment: a))),
              )),

            const SizedBox(height: 16),

            // Tip
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.success.withOpacity(0.25)),
              ),
              child: const Row(children: [
                Icon(Icons.tips_and_updates_rounded, color: AppColors.success, size: 19),
                SizedBox(width: 10),
                Expanded(child: Text(
                  'Las evaluaciones creadas en el panel web aparecen aquí automáticamente.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4),
                )),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

// ── QUICK UPLOAD TAB ──────────────────────────────────────────────────────────

class _QuickUploadTab extends StatefulWidget {
  final ValueChanged<int> onSwitchTab;
  const _QuickUploadTab({required this.onSwitchTab});
  @override
  State<_QuickUploadTab> createState() => _QuickUploadTabState();
}

class _QuickUploadTabState extends State<_QuickUploadTab> {
  List<Assessment> _assessments = [];
  bool _loading = true;
  String? _error;
  final _svc = AssessmentService();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _assessments = data; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Subir ejercicios'),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
            onPressed: _load,
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(0.5),
          child: Divider(height: 0.5, color: AppColors.border),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.wifi_off_rounded, size: 48, color: AppColors.textHint),
                  const SizedBox(height: 12),
                  const Text('Error de conexión',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(_error!, style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 12),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('Reintentar'),
                  ),
                ]))
              : _assessments.isEmpty
                  ? Center(child: _EmptyState(
                      icon: Icons.assignment_outlined,
                      title: 'Sin evaluaciones',
                      subtitle: 'Activa una evaluación desde el panel web para que aparezca aquí',
                      onAction: _load,
                    ))
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: AppColors.primary,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _assessments.length,
                        itemBuilder: (_, i) => _AssessmentCard(
                          assessment: _assessments[i],
                          onTap: !_assessments[i].hasStructure
                              ? () => ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                        'Analiza el PDF de esta evaluación desde el panel web primero'),
                                    backgroundColor: AppColors.warning,
                                  ))
                              : () => Navigator.push(context, MaterialPageRoute(
                                  builder: (_) => UploadScreen(assessment: _assessments[i]))),
                        ),
                      ),
                    ),
    );
  }
}

// ── WIDGETS COMPARTIDOS ────────────────────────────────────────────────────────

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction(
      {required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(children: [
        Icon(icon, color: color, size: 26),
        const SizedBox(height: 6),
        Text(label, textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                color: color, height: 1.2)),
      ]),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onAction;
  final String? actionLabel;
  const _EmptyState({required this.icon, required this.title,
      required this.subtitle, this.onAction, this.actionLabel});

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 20),
    decoration: BoxDecoration(
      color: Colors.white, borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 44, color: AppColors.textHint),
      const SizedBox(height: 12),
      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600,
          color: AppColors.textPrimary)),
      const SizedBox(height: 4),
      Text(subtitle, textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4)),
      if (onAction != null) ...[
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: onAction,
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.primary),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: Text(actionLabel ?? 'Recargar'),
        ),
      ],
    ]),
  );
}

class _AssessmentCard extends StatelessWidget {
  final Assessment assessment;
  final VoidCallback onTap;
  const _AssessmentCard({required this.assessment, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.subjectColor(assessment.subject);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(AppTheme.subjectIcon(assessment.subject), color: color, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(assessment.title,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary),
                maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 5),
            Wrap(spacing: 6, children: [
              _Pill(assessment.subjectLabel, color),
              if (assessment.gradeLevel != null)
                _Pill(assessment.gradeLevel!, AppColors.textSecondary),
              if (assessment.totalPoints != null)
                _Pill('${assessment.totalPoints!.toStringAsFixed(0)} pts',
                    AppColors.textSecondary),
              _StatusBadge(assessment.status),
            ]),
          ])),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: assessment.hasStructure ? color : AppColors.warning,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(assessment.hasStructure ? 'Subir' : 'Sin PDF',
                style: const TextStyle(color: Colors.white, fontSize: 11,
                    fontWeight: FontWeight.w600)),
          ),
        ]),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text; final Color color;
  const _Pill(this.text, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
        color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(text, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
  );
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge(this.status);
  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'active' => ('Activa', AppColors.success),
      'draft' => ('Borrador', AppColors.textSecondary),
      'closed' => ('Cerrada', AppColors.primary),
      _ => ('—', AppColors.textHint),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
          color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
