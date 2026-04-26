"""
Microservicio OCR — Corrector IA
Cascade: Gemini Vision → PaddleOCR → Surya → Chandra
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
import time

from services.image_preprocess import preprocess_image
from services.quality_check import check_image_quality
from services.extract_ocr import (
    extract_with_gemini_vision,
    extract_with_paddle,
    extract_with_surya,
    extract_with_chandra,
)
from services.parse_math_steps import parse_math_response
from services.merge_confidence import merge_and_score
from orchestrate_endpoint import router as orchestrate_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Corrector IA — OCR Service",
    description="Gemini Vision + PaddleOCR para exámenes manuscritos",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orchestrate_router)


class OCRResponse(BaseModel):
    success: bool
    text: str
    math_steps: list[str]
    final_answer: Optional[str]
    confidence: float
    provider_used: str
    quality_score: float
    warnings: list[str]
    processing_time_ms: int


class HealthResponse(BaseModel):
    status: str
    providers: dict[str, bool]
    endpoints: list[str]


@app.get("/health", response_model=HealthResponse)
async def health_check():
    import os
    providers: dict[str, bool] = {}

    # Gemini Vision
    providers["gemini_vision"] = bool(
        os.getenv("GOOGLE_AI_API_KEY") or os.getenv("AI_PROVIDER_API_KEY")
    )

    # Surya
    try:
        from surya.ocr import run_ocr  # type: ignore
        providers["surya"] = True
    except ImportError:
        providers["surya"] = False

    # Chandra
    try:
        import chandra_ocr  # type: ignore
        providers["chandra"] = True
    except ImportError:
        providers["chandra"] = False

    # PaddleOCR
    try:
        from paddleocr import PaddleOCR  # type: ignore
        providers["paddleocr"] = True
    except ImportError:
        providers["paddleocr"] = False

    return {
        "status": "ok",
        "providers": providers,
        "endpoints": ["/health", "/ocr", "/orchestrate"]
    }


@app.post("/ocr", response_model=OCRResponse)
async def process_image(
    file: UploadFile = File(...),
    subject: str = "math",
    question_id: Optional[str] = None,
    force_provider: Optional[str] = None,
):
    start_time = time.time()
    warnings: list[str] = []

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, f"Se esperaba imagen, recibido: {file.content_type}")

    raw_bytes = await file.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "Imagen demasiado grande (máx 10MB)")

    logger.info(f"[OCR] {file.filename} | subject={subject} | q={question_id}")

    # 1. Preprocesar
    processed_image, meta = preprocess_image(raw_bytes)
    if meta.get("was_rotated"):
        warnings.append("Imagen rotada automáticamente")
    if meta.get("low_contrast"):
        warnings.append("Contraste bajo — se aplicó mejora")

    # 2. Calidad
    quality_score = check_image_quality(processed_image)
    if quality_score < 0.3:
        warnings.append(f"Calidad baja ({quality_score:.0%})")

    # 3. Cascade de proveedores
    # Gemini Vision va PRIMERO para manuscritos (maneja garabatos mucho mejor)
    providers_to_try = _get_provider_order(force_provider, subject, quality_score)

    ocr_result = None
    provider_used = "none"

    for provider in providers_to_try:
        try:
            logger.info(f"[OCR] Intentando: {provider}")
            result = _run_provider(provider, processed_image, subject)

            if result and result.get("confidence", 0) > 0.10:
                ocr_result = result
                provider_used = provider
                logger.info(f"[OCR] OK con {provider} | conf={result['confidence']:.2f}")
                break
            else:
                warnings.append(f"{provider}: confianza baja, siguiente...")
        except Exception as e:
            logger.warning(f"[OCR] {provider} falló: {e}")
            warnings.append(f"{provider} no disponible")

    if not ocr_result:
        raise HTTPException(503, "Todos los proveedores OCR fallaron.")

    # 4. Parsear pasos matemáticos
    math_steps: list[str] = []
    final_answer: Optional[str] = None
    if subject == "math" and ocr_result.get("text"):
        math_steps, final_answer = parse_math_response(ocr_result["text"])

    # 5. Score final
    final_confidence = merge_and_score(
        ocr_confidence=ocr_result.get("confidence", 0.5),
        quality_score=quality_score,
        has_math_steps=len(math_steps) > 0,
        subject=subject
    )

    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"[OCR] {elapsed_ms}ms | conf={final_confidence:.2f} | {provider_used}")

    return OCRResponse(
        success=True,
        text=ocr_result.get("text", ""),
        math_steps=math_steps,
        final_answer=final_answer,
        confidence=final_confidence,
        provider_used=provider_used,
        quality_score=quality_score,
        warnings=warnings,
        processing_time_ms=elapsed_ms
    )


def _run_provider(provider: str, image, subject: str) -> dict:
    if provider == "gemini_vision":
        return extract_with_gemini_vision(image, subject)
    if provider == "paddleocr":
        return extract_with_paddle(image)
    if provider == "surya":
        return extract_with_surya(image, subject)
    if provider == "chandra":
        return extract_with_chandra(image)
    return {"text": "", "confidence": 0.0}


def _get_provider_order(force: Optional[str], subject: str, quality: float) -> list[str]:
    """
    Gemini Vision siempre primero para manuscripts.
    PaddleOCR como fallback estable.
    """
    if force:
        return [force]

    import os
    has_gemini = bool(os.getenv("GOOGLE_AI_API_KEY") or os.getenv("AI_PROVIDER_API_KEY"))

    order = []
    if has_gemini:
        order.append("gemini_vision")

    # Surya/Chandra si están disponibles (servidor paid)
    try:
        from surya.ocr import run_ocr  # type: ignore
        order.append("surya")
    except ImportError:
        pass

    try:
        import chandra_ocr  # type: ignore
        order.append("chandra")
    except ImportError:
        pass

    order.append("paddleocr")
    return order
