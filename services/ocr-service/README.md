# Corrector IA — OCR Service

Microservicio Python para corrección de exámenes manuscritos.

## Stack

| Componente | Tecnología |
|-----------|-----------|
| OCR principal | Surya + Chandra OCR 2 |
| OCR fallback | PaddleOCR |
| Orquestador | LangGraph |
| LLM evaluador | Gemini 2.5 Flash (free) / Groq / OpenRouter |
| Validación math | SymPy |
| API server | FastAPI + Uvicorn |

## Instalación

### 1. Clonar y entrar al directorio

```bash
cd services/ocr-service
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

> Nota: PaddleOCR descarga modelos en la primera ejecución (~500MB).
> Surya y Chandra descargan modelos desde HuggingFace automáticamente.

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus claves
```

Claves mínimas para empezar:
- `AI_PROVIDER_API_KEY` → tu key de Google AI Studio (gratis en ai.google.dev)
- `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`

### 4. Levantar el servidor

```bash
uvicorn main:app --reload --port 8001
```

El servicio queda en: `http://localhost:8001`

### 5. Verificar health

```bash
curl http://localhost:8001/health
```

Debes ver algo como:
```json
{
  "status": "ok",
  "providers": {
    "surya": true,
    "chandra": true,
    "paddleocr": true
  }
}
```

## Endpoints

### POST /ocr
Extrae texto de una imagen de examen.

```bash
curl -X POST http://localhost:8001/ocr \
  -F "file=@ejercicio.jpg" \
  -F "subject=math" \
  -F "question_id=item_1_q1"
```

### POST /orchestrate
Pipeline completo: OCR → evaluación IA → resultado.

```bash
curl -X POST http://localhost:8001/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://xxx.supabase.co/storage/v1/object/public/...",
    "assessment_id": "uuid",
    "submission_id": "uuid",
    "student_id": "uuid",
    "question_id": "item_1_q1",
    "subject": "math",
    "question_statement": "Convierte 0.333... a fracción",
    "max_points": 2.0,
    "rubric": {}
  }'
```

## Arquitectura del pipeline

```
POST /orchestrate
        ↓
  [LangGraph]
        ↓
  node_ocr_extract          ← llama a /ocr interno
        ↓
  node_parse_response       ← limpia texto OCR
        ↓
  node_evaluate_with_rubric ← llama a Gemini/Groq
        ↓
  node_apply_rubric_limits  ← CRÍTICO: limita puntaje máximo
        ↓
  node_decide_review        ← ¿auto o revisión manual?
        ↓
  node_finalize_result      ← listo para guardar en Supabase
```

## Notas de producción

- El servicio **no** va en Vercel. Despliégalo en Railway, Render, o un VPS.
- Los modelos Surya y PaddleOCR se cachean en disco después de la primera descarga.
- La variable `OCR_SERVICE_URL` en tu `.env` de Next.js debe apuntar a este servidor.
- Para producción, agrega autenticación al endpoint con un header `X-Service-Key`.
