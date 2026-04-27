// lib/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() => setState(() => _error = null));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  // FIX CLAVE: trim() + toLowerCase() para que "Emorales@..." funcione igual que "emorales@..."
  String get _cleanEmail => _emailCtrl.text.trim().toLowerCase();

  Future<void> _login() async {
    if (_cleanEmail.isEmpty || _passCtrl.text.isEmpty) {
      setState(() => _error = 'Completa todos los campos');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: _cleanEmail,
        password: _passCtrl.text,
      );
      if (mounted) {
        Navigator.pushReplacement(context,
            MaterialPageRoute(builder: (_) => const HomeScreen()));
      }
    } catch (e) {
      setState(() {
        _error = e.toString().contains('Invalid login credentials')
            ? 'Email o contraseña incorrectos'
            : e.toString().replaceAll('AuthApiException', '').replaceAll('Exception:', '').trim();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _register() async {
    if (_cleanEmail.isEmpty || _passCtrl.text.isEmpty) {
      setState(() => _error = 'Completa email y contraseña');
      return;
    }
    if (_passCtrl.text.length < 6) {
      setState(() => _error = 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final res = await Supabase.instance.client.auth.signUp(
        email: _cleanEmail,
        password: _passCtrl.text,
      );
      if (res.user != null) {
        // Crear registro en teachers
        await Supabase.instance.client.from('teachers').insert({
          'user_id': res.user!.id,
          'email': _cleanEmail,
          'full_name': _nameCtrl.text.trim().isNotEmpty
              ? _nameCtrl.text.trim()
              : _cleanEmail.split('@')[0],
        });
        if (mounted) {
          Navigator.pushReplacement(context,
              MaterialPageRoute(builder: (_) => const HomeScreen()));
        }
      }
    } catch (e) {
      setState(() {
        _error = e.toString().contains('already registered')
            ? 'Este email ya está registrado. Inicia sesión.'
            : e.toString().replaceAll('AuthApiException', '').trim();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [

              // Logo + título
              Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [BoxShadow(
                    color: AppColors.primary.withOpacity(0.2),
                    blurRadius: 20, offset: const Offset(0, 8),
                  )],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(22),
                  child: Image.asset(
                    'assets/icon/corrector_ia_docente.png',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.school_rounded, color: AppColors.primary, size: 40),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text('Corrector IA',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary, letterSpacing: -0.5)),
              const SizedBox(height: 4),
              const Text('Plataforma docente inteligente',
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              const SizedBox(height: 32),

              // Card
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 20, offset: const Offset(0, 4),
                  )],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [

                  // Tabs
                  Container(
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: AppColors.border, width: 0.5)),
                    ),
                    child: TabBar(
                      controller: _tabCtrl,
                      labelColor: AppColors.primary,
                      unselectedLabelColor: AppColors.textSecondary,
                      indicatorColor: AppColors.primary,
                      indicatorSize: TabBarIndicatorSize.tab,
                      labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                      tabs: const [Tab(text: 'Ingresar'), Tab(text: 'Registrarse')],
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [

                      // Error
                      if (_error != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: AppColors.error.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppColors.error.withOpacity(0.3)),
                          ),
                          child: Row(children: [
                            Icon(Icons.error_outline_rounded, color: AppColors.error, size: 16),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_error!,
                                style: TextStyle(color: AppColors.error, fontSize: 13))),
                          ]),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Campo nombre (solo en registro)
                      if (_tabCtrl.index == 1) ...[
                        _Field(
                          ctrl: _nameCtrl,
                          label: 'Nombre completo',
                          hint: 'Juan Pérez',
                          icon: Icons.person_outline_rounded,
                          type: TextInputType.name,
                          cap: TextCapitalization.words,
                        ),
                        const SizedBox(height: 14),
                      ],

                      // Email
                      _Field(
                        ctrl: _emailCtrl,
                        label: 'Correo electrónico',
                        hint: 'docente@colegio.cl',
                        icon: Icons.email_outlined,
                        type: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 14),

                      // Contraseña
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Contraseña',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500,
                                color: AppColors.textPrimary)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _passCtrl,
                          obscureText: _obscure,
                          onSubmitted: (_) => _tabCtrl.index == 0 ? _login() : _register(),
                          decoration: InputDecoration(
                            hintText: '••••••••',
                            prefixIcon: const Icon(Icons.lock_outline_rounded,
                                color: AppColors.textHint, size: 20),
                            suffixIcon: IconButton(
                              icon: Icon(_obscure ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                                  color: AppColors.textHint, size: 20),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 20),

                      // Botón principal
                      SizedBox(
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _loading ? null
                              : (_tabCtrl.index == 0 ? _login : _register),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                            elevation: 0,
                            disabledBackgroundColor: AppColors.primary.withOpacity(0.5),
                          ),
                          child: _loading
                              ? const SizedBox(width: 22, height: 22,
                                  child: CircularProgressIndicator(
                                      color: Colors.white, strokeWidth: 2.5))
                              : Text(_tabCtrl.index == 0 ? 'Ingresar' : 'Crear cuenta',
                                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ]),
                  ),
                ]),
              ),

              const SizedBox(height: 20),
              Text('Corrector IA Docente v1.0',
                  style: TextStyle(fontSize: 11, color: AppColors.textHint)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType type;
  final TextCapitalization cap;
  const _Field({
    required this.ctrl, required this.label, required this.hint,
    required this.icon, this.type = TextInputType.text,
    this.cap = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500,
          color: AppColors.textPrimary)),
      const SizedBox(height: 6),
      TextField(
        controller: ctrl,
        keyboardType: type,
        textCapitalization: cap,
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: Icon(icon, color: AppColors.textHint, size: 20),
        ),
      ),
    ]);
  }
}
