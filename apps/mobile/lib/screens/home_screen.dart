// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../models/assessment.dart';
import '../services/assessment_service.dart';
import 'login_screen.dart';
import 'upload_screen.dart';
import 'assessments_screen.dart';
import 'change_password_screen.dart';

// ═══════════════════════════════════════════════════════════════
// HOME SCREEN — raíz con Scaffold + Drawer + BottomNav
// ═══════════════════════════════════════════════════════════════

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  void switchTab(int i) => setState(() => _tab = i);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Drawer va en el Scaffold RAÍZ para que funcione con cualquier tab
      drawer: _AppDrawer(onSwitchTab: switchTab),
      body: IndexedStack(index: _tab, children: [
        _HomeTab(onSwitchTab: switchTab),
        const AssessmentsScreen(),
        _UploadTab(onSwitchTab: switchTab),
      ]),
      bottomNavigationBar: _BottomNav(tab: _tab, onTap: switchTab),
    );
  }
}

// ─── BOTTOM NAV ───────────────────────────────────────────────

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
              final (ai, ic, lbl) = e.value;
              final active = tab == i;
              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary.withOpacity(0.09) : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(active ? ai : ic,
                          color: active ? AppColors.primary : AppColors.textHint, size: 24),
                      const SizedBox(height: 3),
                      Text(lbl, style: TextStyle(
                        fontSize: 11, fontWeight: active ? FontWeight.w600 : FontWeight.normal,
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

// ─── DRAWER ───────────────────────────────────────────────────

class _AppDrawer extends StatelessWidget {
  final ValueChanged<int> onSwitchTab;
  const _AppDrawer({required this.onSwitchTab});

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final email = user?.email ?? '';
    final initial = email.isNotEmpty ? email[0].toUpperCase() : 'D';

    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(child: Column(children: [

        // Header degradado
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [AppColors.primary, Color(0xFF1D4ED8)],
              begin: Alignment.topLeft, end: Alignment.bottomRight,
            ),
          ),
          child: Row(children: [
            // Avatar con inicial o ícono
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Image.asset(
                  'assets/icon/corrector_ia_docente.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Center(
                    child: Text(initial,
                        style: const TextStyle(color: AppColors.primary,
                            fontWeight: FontWeight.w800, fontSize: 22)),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Corrector IA',
                  style: TextStyle(color: Colors.white, fontSize: 16,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(email,
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 11),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('Docente activo',
                    style: TextStyle(color: Colors.white, fontSize: 10,
                        fontWeight: FontWeight.w500)),
              ),
            ])),
          ]),
        ),

        // Sección: Navegación
        _DrawerSection('Navegación', [
          _DrawerTile(Icons.home_rounded, 'Inicio', () {
            Navigator.pop(context);
            onSwitchTab(0);
          }),
          _DrawerTile(Icons.assignment_rounded, 'Evaluaciones', () {
            Navigator.pop(context);
            onSwitchTab(1);
          }),
          _DrawerTile(Icons.camera_alt_rounded, 'Subir ejercicios', () {
            Navigator.pop(context);
            onSwitchTab(2);
          }),
        ]),

        // Sección: Cuenta
        _DrawerSection('Mi cuenta', [
          _DrawerTile(Icons.lock_outline_rounded, 'Cambiar contraseña', () {
            Navigator.pop(context);
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const ChangePasswordScreen()));
          }),
          _DrawerTile(Icons.sync_rounded, 'Sincronizar', () {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('✓ Sincronizado con el panel web'),
                  backgroundColor: AppColors.success),
            );
          }),
          _DrawerTile(Icons.info_outline_rounded, 'Cómo usar la app', () {
            Navigator.pop(context);
            _showHelp(context);
          }),
        ]),

        const Spacer(),
        const Divider(color: AppColors.border, indent: 16, endIndent: 16),

        // Cerrar sesión
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: ListTile(
            leading: const Icon(Icons.logout_rounded, color: AppColors.error, size: 22),
            title: const Text('Cerrar sesión',
                style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            tileColor: AppColors.error.withOpacity(0.05),
            onTap: () async {
              Navigator.pop(context);
              await Supabase.instance.client.auth.signOut();
              if (context.mounted) {
                Navigator.pushAndRemoveUntil(context,
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (_) => false);
              }
            },
          ),
        ),
      ])),
    );
  }

  void _showHelp(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (_, ctrl) => SingleChildScrollView(
          controller: ctrl,
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: AppColors.border,
                    borderRadius: BorderRadius.circular(2)))),
            const Text('Cómo usar la app',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            ...[
              ('1', 'Crea la evaluación en la web',
                  'Entra a corrector-ia-beryl.vercel.app y crea la prueba'),
              ('2', 'Actívala en el panel web',
                  'Cambia el estado a "Activa" para que aparezca en la app'),
              ('3', 'Selecciona la evaluación',
                  'Toca en una evaluación activa en el tab "Evaluaciones"'),
              ('4', 'Ingresa el nombre del estudiante',
                  'Escribe el nombre completo antes de subir'),
              ('5', 'Toma fotos guiadas',
                  'La app te muestra cada ejercicio para fotografiarlo'),
              ('6', 'La IA corrige automáticamente',
                  'En minutos tendrás los resultados en el panel web'),
            ].map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 28, height: 28,
                  decoration: const BoxDecoration(
                      color: AppColors.primary, shape: BoxShape.circle),
                  child: Center(child: Text(s.$1,
                      style: const TextStyle(color: Colors.white,
                          fontWeight: FontWeight.w700, fontSize: 12))),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.$2, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(s.$3, style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 12, height: 1.4)),
                ])),
              ]),
            )),
          ]),
        ),
      ),
    );
  }
}

class _DrawerSection extends StatelessWidget {
  final String title;
  final List<_DrawerTile> tiles;
  const _DrawerSection(this.title, this.tiles);
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
        child: Text(title.toUpperCase(),
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                color: AppColors.textHint, letterSpacing: 1)),
      ),
      ...tiles.map((t) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 1),
        child: ListTile(
          leading: Icon(t.icon, color: AppColors.textSecondary, size: 21),
          title: Text(t.label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          dense: true,
          onTap: t.onTap,
        ),
      )),
    ]);
  }
}

class _DrawerTile {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _DrawerTile(this.icon, this.label, this.onTap);
}

// ═══════════════════════════════════════════════════════════════
// HOME TAB — dashboard principal
// ═══════════════════════════════════════════════════════════════

class _HomeTab extends StatefulWidget {
  final ValueChanged<int> onSwitchTab;
  const _HomeTab({required this.onSwitchTab});
  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  final _svc = AssessmentService();
  List<Assessment> _recent = [];
  bool _loading = true;
  int _total = 0, _active = 0;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await _svc.getAllAssessments();
      setState(() {
        _recent = data.take(3).toList();
        _total = data.length;
        _active = data.where((a) => a.status == 'active').length;
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final name = user?.email?.split('@')[0] ?? 'Docente';
    final h = DateTime.now().hour;
    final greeting = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        // Builder indispensable para que openDrawer acceda al Scaffold raíz
        leading: Builder(builder: (ctx) => IconButton(
          icon: const Icon(Icons.menu_rounded, color: AppColors.textPrimary),
          tooltip: 'Menú',
          onPressed: () => Scaffold.of(ctx).openDrawer(),
        )),
        title: Row(children: [
          Container(width: 28, height: 28,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(8),
                color: AppColors.primary.withOpacity(0.1)),
            child: ClipRRect(borderRadius: BorderRadius.circular(8),
              child: Image.asset('assets/icon/corrector_ia_docente.png', fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(
                      Icons.school_rounded, size: 16, color: AppColors.primary))),
          ),
          const SizedBox(width: 8),
          const Text('Corrector IA'),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
            tooltip: 'Sincronizar',
            onPressed: _load,
          ),
        ],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(0.5),
            child: Divider(height: 0.5, color: AppColors.border)),
      ),
      body: RefreshIndicator(
        onRefresh: _load, color: AppColors.primary,
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
                    begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$greeting,',
                      style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(name, style: const TextStyle(
                      color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('Panel docente activo',
                        style: TextStyle(color: Colors.white, fontSize: 11,
                            fontWeight: FontWeight.w500)),
                  ),
                ])),
                const SizedBox(width: 12),
                Container(width: 56, height: 56,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.school_rounded, color: Colors.white, size: 28)),
              ]),
            ),

            const SizedBox(height: 20),

            // Stats
            Row(children: [
              _StatCard('Total', _total, Icons.list_alt_rounded, AppColors.primary),
              const SizedBox(width: 10),
              _StatCard('Activas', _active, Icons.check_circle_rounded, AppColors.success),
              const SizedBox(width: 10),
              _StatCard('Borradores', _total - _active,
                  Icons.edit_note_rounded, AppColors.warning),
            ]),

            const SizedBox(height: 20),

            // Acciones rápidas
            const Text('Acciones rápidas',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _QuickBtn(
                icon: Icons.camera_alt_rounded, label: 'Subir\nEjercicios',
                color: AppColors.primary, onTap: () => widget.onSwitchTab(2),
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickBtn(
                icon: Icons.assignment_rounded, label: 'Ver\nEvaluaciones',
                color: AppColors.success, onTap: () => widget.onSwitchTab(1),
              )),
              const SizedBox(width: 10),
              Expanded(child: _QuickBtn(
                icon: Icons.sync_rounded, label: 'Sincro-\nnizar',
                color: AppColors.warning, onTap: _load,
              )),
            ]),

            const SizedBox(height: 20),

            // Evaluaciones recientes
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Evaluaciones recientes',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary)),
              TextButton(
                onPressed: () => widget.onSwitchTab(1),
                child: const Text('Ver todas', style: TextStyle(fontSize: 13)),
              ),
            ]),
            const SizedBox(height: 8),

            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(color: AppColors.primary)))
            else if (_recent.isEmpty)
              _EmptyCard(
                icon: Icons.assignment_outlined,
                title: 'Sin evaluaciones',
                body: 'Crea y activa una evaluación desde el panel web.\nAparecerá aquí automáticamente.',
                actionLabel: 'Recargar',
                onAction: _load,
              )
            else
              ..._recent.map((a) => _AssCard(
                assessment: a,
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => UploadScreen(assessment: a))),
              )),

            const SizedBox(height: 16),
            // Tip
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withOpacity(0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFF10B981).withOpacity(0.25)),
              ),
              child: const Row(children: [
                Icon(Icons.tips_and_updates_rounded, color: Color(0xFF10B981), size: 18),
                SizedBox(width: 10),
                Expanded(child: Text(
                  'Las evaluaciones del panel web se sincronizan automáticamente. '
                  'Toca el ícono ↺ para actualizar.',
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

class _StatCard extends StatelessWidget {
  final String label; final int value; final IconData icon; final Color color;
  const _StatCard(this.label, this.value, this.icon, this.color);
  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.2))),
      child: Column(children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 5),
        Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
      ]),
    ),
  );
}

class _QuickBtn extends StatelessWidget {
  final IconData icon; final String label; final Color color; final VoidCallback onTap;
  const _QuickBtn({required this.icon, required this.label, required this.color, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.2))),
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

class _EmptyCard extends StatelessWidget {
  final IconData icon; final String title; final String body;
  final String? actionLabel; final VoidCallback? onAction;
  const _EmptyCard({required this.icon, required this.title, required this.body,
      this.actionLabel, this.onAction});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border)),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 40, color: AppColors.textHint),
      const SizedBox(height: 10),
      Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
          color: AppColors.textPrimary)),
      const SizedBox(height: 4),
      Text(body, textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.5)),
      if (onAction != null) ...[
        const SizedBox(height: 14),
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

class _AssCard extends StatelessWidget {
  final Assessment assessment; final VoidCallback onTap;
  const _AssCard({required this.assessment, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final c = AppTheme.subjectColor(assessment.subject);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border)),
        child: Row(children: [
          Container(width: 44, height: 44,
            decoration: BoxDecoration(color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Icon(AppTheme.subjectIcon(assessment.subject), color: c, size: 22)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(assessment.title, style: const TextStyle(fontSize: 13,
                fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Row(children: [
              _Tag(assessment.subjectLabel, c),
              if (assessment.gradeLevel != null) ...[
                const SizedBox(width: 5),
                _Tag(assessment.gradeLevel!, AppColors.textSecondary),
              ],
              const SizedBox(width: 5),
              _StatusDot(assessment.status),
            ]),
          ])),
          Icon(Icons.chevron_right_rounded, color: AppColors.textHint, size: 20),
        ]),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String t; final Color c;
  const _Tag(this.t, this.c);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(t, style: TextStyle(fontSize: 10, color: c, fontWeight: FontWeight.w500)),
  );
}

class _StatusDot extends StatelessWidget {
  final String status;
  const _StatusDot(this.status);
  @override
  Widget build(BuildContext context) {
    final (lbl, c) = switch (status) {
      'active' => ('Activa', AppColors.success),
      'draft' => ('Borrador', AppColors.textSecondary),
      'closed' => ('Cerrada', AppColors.primary),
      _ => ('—', AppColors.textHint),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: c.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(lbl, style: TextStyle(fontSize: 10, color: c, fontWeight: FontWeight.w600)),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD TAB — subida rápida (tab 3)
// ═══════════════════════════════════════════════════════════════

class _UploadTab extends StatefulWidget {
  final ValueChanged<int> onSwitchTab;
  const _UploadTab({required this.onSwitchTab});
  @override
  State<_UploadTab> createState() => _UploadTabState();
}

class _UploadTabState extends State<_UploadTab> {
  final _svc = AssessmentService();
  List<Assessment> _list = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _svc.getAllAssessments();
      setState(() { _list = data; _loading = false; });
    } catch (e) {
      setState(() { _error = 'Error de conexión. Verifica tu internet.'; _loading = false; });
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
          IconButton(icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
              onPressed: _load),
        ],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(0.5),
            child: Divider(height: 0.5, color: AppColors.border)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.wifi_off_rounded, size: 44, color: AppColors.textHint),
                  const SizedBox(height: 12),
                  Text(_error!, textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(onPressed: _load,
                      icon: const Icon(Icons.refresh_rounded, size: 18),
                      label: const Text('Reintentar')),
                ]))
              : _list.isEmpty
                  ? Center(child: _EmptyCard(
                      icon: Icons.assignment_outlined,
                      title: 'Sin evaluaciones',
                      body: 'Crea una evaluación en el panel web y actívala para que aparezca aquí.',
                      actionLabel: 'Recargar',
                      onAction: _load,
                    ))
                  : RefreshIndicator(
                      onRefresh: _load, color: AppColors.primary,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _list.length,
                        itemBuilder: (_, i) {
                          final a = _list[i];
                          return _AssCard(
                            assessment: a,
                            onTap: !a.hasStructure
                                ? () => ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          '⚠ Esta evaluación no tiene PDF analizado. '
                                          'Analízalo desde el panel web primero.'),
                                      backgroundColor: AppColors.warning,
                                      duration: Duration(seconds: 4),
                                    ))
                                : () => Navigator.push(context,
                                    MaterialPageRoute(builder: (_) => UploadScreen(assessment: a))),
                          );
                        },
                      ),
                    ),
    );
  }
}
