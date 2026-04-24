"""
extract_ocr.py
Tres proveedores OCR con interfaz unificada.
Todos retornan: { "text": str, "confidence": float, "blocks": list }
"""

import io
import logging
from PIL import Image

logger = logging.getLogger(__name__)


# ─── SURYA ────────────────────────────────────────────────────────────────────

def extract_with_surya(image: Image.Image, subject: str = "math") -> dict:
    """
    Surya: OCR principal con soporte de math, layout y handwriting.
    Usa --math mode para asignaturas de matemática.
    """
    from surya.ocr import run_ocr
    from surya.model.detection.model import load_model as load_det_model
    from surya.model.detection.processor import load_processor as load_det_processor
    from surya.model.recognition.model import load_model as load_rec_model
    from surya.model.recognition.processor import load_processor as load_rec_processor

    # Cargar modelos (se cachean automáticamente después de la primera carga)
    det_processor, det_model = load_det_processor(), load_det_model()
    rec_model, rec_processor = load_rec_model(), load_rec_processor()

    langs = ["es"]  # Español (Chile)

    predictions = run_ocr(
        [image],
        [langs],
        det_model,
        det_processor,
        rec_model,
        rec_processor
    )

    if not predictions:
        return {"text": "", "confidence": 0.0, "blocks": []}

    page = predictions[0]
    lines = page.text_lines

    if not lines:
        return {"text": "", "confidence": 0.0, "blocks": []}

    # Extraer texto y confianza
    texts = [line.text for line in lines]
    confidences = [line.confidence for line in lines if hasattr(line, "confidence")]

    full_text = "\n".join(texts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5

    blocks = [
        {
            "text": line.text,
            "bbox": line.bbox,
            "confidence": getattr(line, "confidence", 0.5)
        }
        for line in lines
    ]

    logger.info(f"[Surya] {len(lines)} líneas | conf avg={avg_confidence:.2f}")

    return {
        "text": full_text,
        "confidence": avg_confidence,
        "blocks": blocks,
        "provider": "surya"
    }


# ─── CHANDRA OCR ──────────────────────────────────────────────────────────────

def extract_with_chandra(image: Image.Image) -> dict:
    """
    Chandra OCR 2: excelente en manuscritos, math, tablas.
    Retorna markdown/HTML que luego limpiamos.
    """
    import tempfile
    import os
    import subprocess
    import json

    # Guardar imagen temporal
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        image.save(tmp.name, "PNG")
        tmp_path = tmp.name

    try:
        with tempfile.TemporaryDirectory() as out_dir:
            result = subprocess.run(
                ["chandra", tmp_path, out_dir, "--method", "hf"],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                logger.warning(f"[Chandra] Error: {result.stderr[:200]}")
                return {"text": "", "confidence": 0.0, "blocks": []}

            # Leer output JSON
            json_files = [f for f in os.listdir(out_dir) if f.endswith(".json")]
            if json_files:
                with open(os.path.join(out_dir, json_files[0])) as f:
                    data = json.load(f)
                text = data.get("text", data.get("markdown", ""))
                confidence = data.get("confidence", 0.75)
            else:
                # Fallback: leer markdown
                md_files = [f for f in os.listdir(out_dir) if f.endswith(".md")]
                if md_files:
                    with open(os.path.join(out_dir, md_files[0])) as f:
                        text = f.read()
                    confidence = 0.7
                else:
                    return {"text": "", "confidence": 0.0, "blocks": []}

        text = _clean_markdown(text)
        logger.info(f"[Chandra] {len(text)} chars | conf={confidence:.2f}")

        return {
            "text": text,
            "confidence": confidence,
            "blocks": [],
            "provider": "chandra"
        }

    finally:
        os.unlink(tmp_path)


# ─── PADDLEOCR ────────────────────────────────────────────────────────────────

_paddle_instance = None

def extract_with_paddle(image: Image.Image) -> dict:
    """
    PaddleOCR: fallback con salida estructurada.
    Muy estable, buena en documentos impresos y mixtos.
    """
    global _paddle_instance

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
        return {"text": "", "confidence": 0.0, "blocks": []}

    texts = []
    confidences = []
    blocks = []

    for line in result[0]:
        if line and len(line) == 2:
            bbox, (text, conf) = line
            texts.append(text)
            confidences.append(conf)
            blocks.append({"text": text, "bbox": bbox, "confidence": conf})

    full_text = "\n".join(texts)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    logger.info(f"[PaddleOCR] {len(texts)} líneas | conf avg={avg_conf:.2f}")

    return {
        "text": full_text,
        "confidence": avg_conf,
        "blocks": blocks,
        "provider": "paddleocr"
    }


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _clean_markdown(text: str) -> str:
    """Limpia markdown a texto plano manteniendo estructura matemática."""
    import re
    # Mantener fórmulas LaTeX pero limpiar markdown
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # headers
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)                 # bold
    text = re.sub(r'\*(.*?)\*', r'\1', text)                     # italic
    text = re.sub(r'\n{3,}', '\n\n', text)                       # múltiples saltos
    return text.strip()
