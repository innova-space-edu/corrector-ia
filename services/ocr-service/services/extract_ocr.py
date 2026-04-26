"""
services/extract_ocr.py

OCR cascade:
  1. Gemini Vision  — mejor para manuscritos, math, garabatos (GRATIS con tu key)
  2. PaddleOCR      — fallback para documentos impresos
  3. Surya/Chandra  — opcionales si están instalados
"""

import io
import os
import base64
import logging
import json
import re
import httpx
from PIL import Image

logger = logging.getLogger(__name__)

GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("AI_PROVIDER_API_KEY", "")
GEMINI_OCR_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# ─── GEMINI VISION — OCR PRINCIPAL ────────────────────────────────────────────

def extract_with_gemini_vision(image: Image.Image, subject: str = "math") -> dict:
    """
    Usa Gemini Vision para leer escritura manuscrita.
    Gemini 2.0 Flash: gratis, 1500 req/día, maneja garabatos y math.
    """
    if not GOOGLE_AI_API_KEY:
        logger.warning("[Gemini OCR] Sin API key — saltando")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "gemini_vision"}

    subject_instructions = {
        "math": (
            "Presta especial atención a: fracciones (a/b), exponentes (x²), raíces (√), "
            "signos (+ - × ÷ = ≠ ≤ ≥), decimales (0,25), porcentajes (%), "
            "paréntesis, y operaciones paso a paso. "
            "Si ves una fracción escrita verticalmente, escríbela como a/b."
        ),
        "language": (
            "Presta atención a puntuación, tildes y la estructura del texto. "
            "Preserva saltos de párrafo."
        ),
        "science": "Presta atención a fórmulas químicas, unidades de medida y vocabulario científico.",
        "history": "Presta atención a fechas, nombres propios y términos históricos.",
    }

    prompt = f"""Eres un experto en leer escritura manuscrita de estudiantes chilenos de enseñanza media.

Tu tarea: transcribe EXACTAMENTE todo el texto manuscrito visible en esta imagen.

INSTRUCCIONES:
- Transcribe todo lo que ves, incluyendo tachones si son legibles
- Si una palabra es ilegible, escribe [ilegible]
- NO interpretes ni corrijas errores del estudiante
- NO agregues texto que no esté en la imagen
- Preserva la estructura: si hay pasos numerados, mantenlos
- {subject_instructions.get(subject, "")}

Responde SOLO con el texto transcrito, sin explicaciones adicionales."""

    try:
        # Convertir imagen a base64
        buffer = io.BytesIO()
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.save(buffer, format="JPEG", quality=92)
        img_b64 = base64.b64encode(buffer.getvalue()).decode()

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": img_b64
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 1000,
            }
        }

        response = httpx.post(
            f"{GEMINI_OCR_URL}?key={GOOGLE_AI_API_KEY}",
            json=payload,
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()

        text = ""
        if data.get("candidates"):
            candidate = data["candidates"][0]
            if candidate.get("content", {}).get("parts"):
                text = candidate["content"]["parts"][0].get("text", "").strip()

        # Calcular confianza basada en longitud y contenido
        confidence = _estimate_gemini_confidence(text, subject)

        logger.info(f"[Gemini OCR] {len(text)} chars | conf={confidence:.2f}")
        return {
            "text": text,
            "confidence": confidence,
            "blocks": [{"text": text, "confidence": confidence}],
            "provider": "gemini_vision"
        }

    except httpx.HTTPStatusError as e:
        logger.warning(f"[Gemini OCR] HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "gemini_vision"}
    except Exception as e:
        logger.warning(f"[Gemini OCR] Error: {e}")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "gemini_vision"}


def _estimate_gemini_confidence(text: str, subject: str) -> float:
    """
    Estima confianza del resultado de Gemini Vision.
    No hay score nativo → usamos heurísticas.
    """
    if not text or len(text.strip()) < 3:
        return 0.05

    score = 0.75  # Gemini base confidence es alta

    # Penalizar si hay muchos [ilegible]
    illegible_count = text.lower().count("[ilegible]")
    score -= illegible_count * 0.1

    # Bonificar si tiene contenido matemático en preguntas de math
    if subject == "math":
        math_patterns = [r'\d', r'[+\-×÷=/]', r'[a-zA-Z]\s*=', r'\d[,\.]\d']
        hits = sum(1 for p in math_patterns if re.search(p, text))
        score += hits * 0.04

    # Penalizar texto muy corto para desarrollo
    if subject in ("math", "language") and len(text) < 10:
        score -= 0.2

    return round(max(0.0, min(1.0, score)), 3)


# ─── PADDLEOCR — FALLBACK ─────────────────────────────────────────────────────

_paddle_instance = None

def extract_with_paddle(image: Image.Image) -> dict:
    """PaddleOCR: fallback estable para texto impreso."""
    global _paddle_instance
    try:
        import numpy as np
        from paddleocr import PaddleOCR

        if _paddle_instance is None:
            _paddle_instance = PaddleOCR(
                use_angle_cls=True,
                lang="es",
                use_gpu=False,
                show_log=False
            )

        img_array = np.array(image)
        result = _paddle_instance.ocr(img_array, cls=True)

        if not result or not result[0]:
            return {"text": "", "confidence": 0.0, "blocks": [], "provider": "paddleocr"}

        texts, confidences, blocks = [], [], []
        for line in result[0]:
            if line and len(line) == 2:
                bbox, (text, conf) = line
                texts.append(text)
                confidences.append(conf)
                blocks.append({"text": text, "bbox": bbox, "confidence": conf})

        full_text = "\n".join(texts)
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        logger.info(f"[PaddleOCR] {len(texts)} líneas | conf={avg_conf:.2f}")
        return {"text": full_text, "confidence": avg_conf, "blocks": blocks, "provider": "paddleocr"}

    except ImportError:
        logger.warning("[PaddleOCR] No instalado")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "paddleocr"}
    except Exception as e:
        logger.warning(f"[PaddleOCR] Error: {e}")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "paddleocr"}


# ─── SURYA — OPCIONAL ─────────────────────────────────────────────────────────

def extract_with_surya(image: Image.Image, subject: str = "math") -> dict:
    """Surya OCR: disponible solo si está instalado (requiere >1GB RAM)."""
    try:
        from surya.ocr import run_ocr
        from surya.model.detection.model import load_model as load_det_model
        from surya.model.detection.processor import load_processor as load_det_processor
        from surya.model.recognition.model import load_model as load_rec_model
        from surya.model.recognition.processor import load_processor as load_rec_processor

        det_processor, det_model = load_det_processor(), load_det_model()
        rec_model, rec_processor = load_rec_model(), load_rec_processor()

        predictions = run_ocr([image], [["es"]], det_model, det_processor, rec_model, rec_processor)
        if not predictions:
            return {"text": "", "confidence": 0.0, "blocks": [], "provider": "surya"}

        lines = predictions[0].text_lines
        if not lines:
            return {"text": "", "confidence": 0.0, "blocks": [], "provider": "surya"}

        texts = [l.text for l in lines]
        confs = [getattr(l, "confidence", 0.5) for l in lines]
        avg_conf = sum(confs) / len(confs) if confs else 0.5

        logger.info(f"[Surya] {len(lines)} líneas | conf={avg_conf:.2f}")
        return {
            "text": "\n".join(texts),
            "confidence": avg_conf,
            "blocks": [{"text": l.text, "confidence": getattr(l, "confidence", 0.5)} for l in lines],
            "provider": "surya"
        }
    except ImportError:
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "surya"}
    except Exception as e:
        logger.warning(f"[Surya] Error: {e}")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "surya"}


# ─── CHANDRA — OPCIONAL ───────────────────────────────────────────────────────

def extract_with_chandra(image: Image.Image) -> dict:
    """Chandra OCR: disponible solo si está instalado."""
    try:
        import tempfile
        import os
        import subprocess

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            image.save(tmp.name, "PNG")
            tmp_path = tmp.name

        with tempfile.TemporaryDirectory() as out_dir:
            result = subprocess.run(
                ["chandra", tmp_path, out_dir, "--method", "hf"],
                capture_output=True, text=True, timeout=60
            )
            os.unlink(tmp_path)

            if result.returncode != 0:
                return {"text": "", "confidence": 0.0, "blocks": [], "provider": "chandra"}

            md_files = [f for f in os.listdir(out_dir) if f.endswith(".md")]
            if not md_files:
                return {"text": "", "confidence": 0.0, "blocks": [], "provider": "chandra"}

            with open(os.path.join(out_dir, md_files[0])) as f:
                text = f.read().strip()

        logger.info(f"[Chandra] {len(text)} chars")
        return {"text": text, "confidence": 0.75, "blocks": [], "provider": "chandra"}

    except Exception as e:
        logger.warning(f"[Chandra] Error: {e}")
        return {"text": "", "confidence": 0.0, "blocks": [], "provider": "chandra"}
