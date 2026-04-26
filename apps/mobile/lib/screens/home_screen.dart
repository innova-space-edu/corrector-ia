// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/assessment_service.dart';
import '../models/assessment.dart';
import 'login_screen.dart';
import 'upload_screen.dart';
import 'assessments_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  final List<_NavItem> _navItems = [
    _NavItem(Icons.home_rounded, Icons.home_outlined, 'Inicio'),
    _NavItem(Icons.assignment_rounded, Icons.assignment_outlined, 'Evaluaciones'),
    _NavItem(Icons.camera_alt_rounded, Icons.camera_alt_outlined, 'Subir'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: _AppDrawer(onClose: () => _scaffoldKey.currentState?.closeDrawer()),
      body: IndexedStack(index: _tab, children: const [
        _HomeTab(),
        AssessmentsScreen(),
        _QuickUploadTab(),
      ]),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: _navItems.asMap().entries.map((e) {
                final i = e.key; final item = e.value;
                final active = _tab == i;
                return Expanded(child: GestureDetector(
                  onTap: () => setState(() => _tab = i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary.withOpacity(0.08) : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(active ? item.activeIcon : item.icon,
                          color: active ? AppColors.primary : AppColors.textHint,
                          size: 24),
                      const SizedBox(height: 3),
                      Text(item.label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                            color: active ? AppColors.primary : AppColors.textHint,
                          )),
                    ]),
                  ),
                ));
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  final IconData activeIcon;
  final IconData icon;
  final String label;
  const _NavItem(this.activeIcon, this.icon, this.label);
}

// ── DRAWER ────────────────────────────────────────────────────────────────────

class _AppDrawer extends StatelessWidget {
  final VoidCallback onClose;
  const _AppDrawer({required this.onClose});

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;

    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header
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
                child: Image.asset('assets/icon/corrector_ia_docente.png',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.school_rounded, color: AppColors.primary, size: 28)),
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

        // Secciones
        _DrawerSection('Principal', [
          _DrawerItem(Icons.home_rounded, 'Inicio', () {
            onClose();
            // ya está en Home
          }),
          _DrawerItem(Icons.assignment_rounded, 'Mis evaluaciones', () {
            onClose();
          }),
          _DrawerItem(Icons.camera_alt_rounded, 'Subir ejercicios', () {
            onClose();
          }),
        ]),

        _DrawerSection('Información', [
          _DrawerItem(Icons.info_outline_rounded, 'Cómo usar la app', () {
            onClose();
            _showHowToUse(context);
          }),
          _DrawerItem(Icons.sync_rounded, 'Sincronizar con web', () {
            onClose();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Sincronizado con el panel web'),
                  backgroundColor: AppColors.success),
            );
          }),
        ]),

        const Spacer(),

        const Divider(color: AppColors.border),

        // Cerrar sesión
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: ListTile(
            leading: const Icon(Icons.logout_rounded, color: AppColors.error, size: 22),
            title: const Text('Cerrar sesión',
                style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w500)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            onTap: () async {
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
        const SizedBox(height: 8),
      ])),
    );
  }

  void _showHowToUse(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Cómo usar la app',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          ...[
            ('1. Crea evaluaciones', 'Desde el panel web en corrector-ia-beryl.vercel.app'),
            ('2. Activa la evaluación', 'Cámbiala a estado "Activa" en el panel web'),
            ('3. Abre la app', 'Aparecerá automáticamente en tu lista'),
            ('4. Selecciona un estudiante', 'Ingresa su nombre completo'),
            ('5. Sube los ejercicios', 'Toma foto de cada ejercicio guiado por la app'),
            ('6. La IA corrige', 'En minutos tendrás la corrección en el panel web'),
          ].map((step) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 8, height: 8, margin: const EdgeInsets.only(top: 5, right: 12),
                decoration: const BoxDecoration(
                    color: AppColors.primary, shape: BoxShape.circle),
              ),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(step.$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(step.$2, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ])),
            ]),
          )),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }
}

class _DrawerSection extends StatelessWidget {
  final String title;
  final List<_DrawerItem> items;
  const _DrawerSection(this.title, this.items);

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
        child: Text(title.toUpperCase(),
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                color: AppColors.textHint, letterSpacing: 0.8)),
      ),
      ...items.map((item) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        child: ListTile(
          leading: Icon(item.icon, color: AppColors.textSecondary, size: 22),
          title: Text(item.label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          onTap: item.onTap,
          dense: true,
        ),
      )),
    ]);
  }
}

class _DrawerItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _DrawerItem(this.icon, this.label, this.onTap);
}

// ── HOME TAB ─────────────────────────────────────────────────────────────────

class _HomeTab extends StatefulWidget {
  const _HomeTab();
  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  List<Assessment> _recent = [];
  bool _loading = true;
  final _svc = AssessmentService();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _recent = data.take(3).toList(); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final name = user?.email?.split('@')[0] ?? 'Docente';
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        leading: Builder(builder: (ctx) => IconButton(
          icon: const Icon(Icons.menu_rounded),
          onPressed: () => Scaffold.of(ctx).openDrawer(),
        )),
        title: Row(children: [
          Container(width: 32, height: 32,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: AppColors.primary.withOpacity(0.1),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset('assets/icon/corrector_ia_docente.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(
                      Icons.school_rounded, size: 18, color: AppColors.primary)),
            ),
          ),
          const SizedBox(width: 10),
          const Text('Corrector IA'),
        ]),
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
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20),
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
                  Text('$greeting,', style: TextStyle(
                      color: Colors.white.withOpacity(0.85), fontSize: 14)),
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
                  width: 60, height: 60,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(Icons.school_rounded, color: Colors.white, size: 32),
                ),
              ]),
            ),

            const SizedBox(height: 24),

            // Acciones rápidas
            const Text('Acciones rápidas',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _QuickAction(
                icon: Icons.camera_alt_rounded,
                label: 'Subir\nEjercicios',
                color: AppColors.primary,
                onTap: () {
                  final state = context.findAncestorStateOfType<_HomeScreenState>();
                  if (state != null) setState(() => state._tab = 2);
                },
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickAction(
                icon: Icons.assignment_rounded,
                label: 'Ver\nEvaluaciones',
                color: AppColors.success,
                onTap: () {
                  final state = context.findAncestorStateOfType<_HomeScreenState>();
                  if (state != null) setState(() => state._tab = 1);
                },
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickAction(
                icon: Icons.sync_rounded,
                label: 'Sincro-\nnizar',
                color: AppColors.warning,
                onTap: _load,
              )),
            ]),

            const SizedBox(height: 24),

            // Evaluaciones recientes
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Evaluaciones activas',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary)),
              TextButton(onPressed: () {
                final state = context.findAncestorStateOfType<_HomeScreenState>();
                if (state != null) setState(() => state._tab = 1);
              }, child: const Text('Ver todas', style: TextStyle(fontSize: 13))),
            ]),
            const SizedBox(height: 8),

            if (_loading)
              ...List.generate(2, (_) => const _ShimmerCard())
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
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success.withOpacity(0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.success.withOpacity(0.3)),
              ),
              child: Row(children: [
                const Icon(Icons.tips_and_updates_rounded,
                    color: AppColors.success, size: 20),
                const SizedBox(width: 12),
                const Expanded(child: Text(
                  'Las evaluaciones creadas en el panel web aparecen aquí automáticamente cuando están activas.',
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

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({required this.icon, required this.label,
      required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
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
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color, height: 1.2)),
        ]),
      ),
    );
  }
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
  Widget build(BuildContext context) {
    return Container(
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
          OutlinedButton(onPressed: onAction,
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.primary),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(actionLabel ?? 'Recargar')),
        ],
      ]),
    );
  }
}

class _ShimmerCard extends StatelessWidget {
  const _ShimmerCard();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      height: 90,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
    );
  }
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
          Container(width: 48, height: 48,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(AppTheme.subjectIcon(assessment.subject), color: color, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(assessment.title, style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Row(children: [
              _Pill(assessment.subjectLabel, color),
              const SizedBox(width: 6),
              if (assessment.gradeLevel != null)
                _Pill(assessment.gradeLevel!, AppColors.textSecondary),
              if (assessment.totalPoints != null) ...[
                const SizedBox(width: 6),
                _Pill('${assessment.totalPoints!.toStringAsFixed(0)} pts',
                    AppColors.textSecondary),
              ],
            ]),
          ])),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: color, borderRadius: BorderRadius.circular(20),
            ),
            child: const Text('Subir', style: TextStyle(
                color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
          ),
        ]),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color color;
  const _Pill(this.text, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(text, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500)),
  );
}

// ── QUICK UPLOAD TAB ──────────────────────────────────────────────────────────

class _QuickUploadTab extends StatefulWidget {
  const _QuickUploadTab();
  @override
  State<_QuickUploadTab> createState() => _QuickUploadTabState();
}

class _QuickUploadTabState extends State<_QuickUploadTab> {
  List<Assessment> _assessments = [];
  bool _loading = true;
  final _svc = AssessmentService();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _assessments = data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Subir ejercicios'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(0.5),
          child: Divider(height: 0.5, color: AppColors.border),
        ),
        automaticallyImplyLeading: false,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _assessments.isEmpty
              ? Center(child: _EmptyState(
                  icon: Icons.assignment_outlined,
                  title: 'Sin evaluaciones activas',
                  subtitle: 'Activa una evaluación desde el panel web',
                  onAction: _load,
                ))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _assessments.length,
                  itemBuilder: (_, i) => _AssessmentCard(
                    assessment: _assessments[i],
                    onTap: () => Navigator.push(context,
                        MaterialPageRoute(
                            builder: (_) => UploadScreen(assessment: _assessments[i]))),
                  ),
                ),
    );
  }
}
