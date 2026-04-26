import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final controller = TextEditingController();
  bool loading = false;
  String msg = "";

  Future<void> changePassword() async {
    setState(() {
      loading = true;
      msg = "";
    });

    try {
      await Supabase.instance.client.auth.updateUser(
        UserAttributes(password: controller.text),
      );

      setState(() {
        msg = "✅ Contraseña actualizada";
        controller.clear();
      });
    } catch (e) {
      setState(() {
        msg = "❌ Error: $e";
      });
    }

    setState(() {
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Cambiar contraseña")),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(
              controller: controller,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: "Nueva contraseña",
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: loading ? null : changePassword,
              child: Text(loading ? "Cargando..." : "Cambiar"),
            ),
            const SizedBox(height: 20),
            Text(msg),
          ],
        ),
      ),
    );
  }
}