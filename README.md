# Corrector IA Docente

Plataforma web de corrección automática de exámenes manuscritos con IA.

## Stack

| Servicio | Tecnología | Hosting |
|---------|-----------|---------|
| Panel docente | Next.js + Supabase | Vercel |
| OCR + Agentes | FastAPI + LangGraph | Render |
| Base de datos | Supabase (Postgres) | Supabase |
| Repositorio | Git | GitHub |

---

## Estructura del proyecto

```
corrector-ia/
├── apps/
│   └── web/                  ← Panel docente Next.js
├── services/
│   └── ocr-service/          ← Microservicio Python OCR
├── supabase/
│   └── migration.sql         ← Schema completo
├── .github/
│   └── workflows/ci.yml      ← CI automático
├── render.yaml               ← Config Render
├── vercel.json               ← Config Vercel
└── .gitignore
```

---

## Setup paso a paso

### PASO 1 — GitHub

```bash
git init
git add .
git commit -m "feat: base inicial corrector IA"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/corrector-ia.git
git push -u origin main
```

---

### PASO 2 — Supabase

1. Ir a **supabase.com → New project**
2. Nombre: `corrector-ia` | Región: South America (São Paulo)
3. Guardar la contraseña del proyecto
4. Ir a **SQL Editor** → pegar y ejecutar `supabase/migration.sql`
5. Verificar en **Table Editor** que existen las tablas
6. Ir a **Settings → API** y copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

---

### PASO 3 — Render (OCR Service Python)

1. Ir a **render.com → New → Web Service**
2. Conectar cuenta de GitHub
3. Seleccionar el repo `corrector-ia`
4. Configurar:
   - **Name:** `corrector-ia-ocr`
   - **Branch:** `main`
   - **Root Directory:** `services/ocr-service`
   - **Runtime:** `Docker`
   - **Plan:** `Free`
5. En **Environment Variables** agregar:

| Key | Value |
|-----|-------|
| `AI_PROVIDER_API_KEY` | tu key de Google AI Studio |
| `AI_PARSE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| `AI_MODEL` | `gemini-2.5-flash-preview-05-20` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key de Supabase |
| `PORT` | `8001` |

6. Click **Create Web Service**
7. Esperar el primer deploy (~5-10 min por descarga de modelos)
8. Copiar la URL pública: `https://corrector-ia-ocr.onrender.com`

> ⚠️ El free tier de Render se **duerme** después de 15 min sin uso.
> El primer request tras el sleep tarda ~30 segundos.
> Para producción real, considera el plan de $7/mes.

---

### PASO 4 — Vercel (Panel Web)

1. Ir a **vercel.com → Add New Project**
2. Importar el repo `corrector-ia` desde GitHub
3. Configurar:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
4. En **Environment Variables** agregar:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key de Supabase |
| `AI_PROVIDER_API_KEY` | tu key de Google AI Studio |
| `AI_PARSE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| `AI_MODEL` | `gemini-2.5-flash-preview-05-20` |
| `OCR_SERVICE_URL` | URL pública de Render (paso 3.8) |

5. Click **Deploy**
6. Tu panel queda en: `https://corrector-ia.vercel.app`

---

### PASO 5 — Verificar todo

```bash
# 1. Verificar OCR Service
curl https://corrector-ia-ocr.onrender.com/health

# Respuesta esperada:
# {"status":"ok","providers":{"surya":true,"chandra":true,"paddleocr":true}}

# 2. Verificar panel
# Abrir https://corrector-ia.vercel.app en el navegador
```

---

## APIs gratuitas — cómo obtenerlas

### Google AI Studio (Gemini 2.5 Flash)
- Ir a: https://aistudio.google.com/app/apikey
- Click "Create API Key"
- **Límite gratis:** 1,500 req/día, sin tarjeta de crédito

### Groq (Llama 3.3 70B — alternativa)
- Ir a: https://console.groq.com
- Crear cuenta → API Keys → Create
- **Límite gratis:** 6,000 tokens/min

### OpenRouter (30+ modelos gratis)
- Ir a: https://openrouter.ai/keys
- **Modelos free:** añadir `:free` al nombre
  - `deepseek/deepseek-r1:free`
  - `google/gemma-3-27b-it:free`
  - `qwen/qwen3-32b:free`

---

## Flujo de deploy automático

```
git push origin main
        ↓
   GitHub Actions (CI)
     ↓           ↓
  test-web    test-ocr
     ↓           ↓
  Vercel      Render
(auto-deploy) (auto-deploy)
```

Cada push a `main` dispara deploy automático en Vercel y Render.

---

## Desarrollo local

```bash
# Terminal 1 — OCR Service
cd services/ocr-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # llenar variables
uvicorn main:app --reload --port 8001

# Terminal 2 — Panel Web
cd apps/web
npm install
cp .env.example .env.local   # llenar variables
# OCR_SERVICE_URL=http://localhost:8001
npm run dev
```
