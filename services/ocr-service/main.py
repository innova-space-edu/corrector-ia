"""
Microservicio OCR para el Corrector IA
Surya (principal) → Chandra OCR (secundario) → PaddleOCR (fallback)
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
from typing import Optional
import time

from services.image_preprocess import preprocess_image
from services.quality_check import check_image_quality
from services.extract_ocr import extract_with_surya, extract_with_chandra, extract_with_paddle
from services.parse_math_steps import parse_math_response
from services.merge_confidence import merge_and_score

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Corrector IA — OCR Service",
    description="Microservicio de OCR para exámenes manuscritos",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Verifica qué proveedores OCR están disponibles."""
    providers = {}
    try:
        from surya.ocr import run_ocr
        providers["surya"] = True
    except ImportError:
        providers["surya"] = False

    try:
        import chandra_ocr
        providers["chandra"] = True
    except ImportError:
        providers["chandra"] = False

    try:
        from paddleocr import PaddleOCR
        providers["paddleocr"] = True
    except ImportError:
        providers["paddleocr"] = False

    return {"status": "ok", "providers": providers}


@app.post("/ocr", response_model=OCRResponse)
async def process_image(
    file: UploadFile = File(...),
    subject: str = "math",
    question_id: Optional[str] = None,
    force_provider: Optional[str] = None
):
    """
    Endpoint principal OCR.
    Recibe imagen → extrae texto → parsea pasos matemáticos → devuelve JSON.

    Parámetros:
    - subject: math | language | science | history
    - question_id: ID del ejercicio (para logging)
    - force_provider: surya | chandra | paddle (para testing)
    """
    start_time = time.time()
    warnings = []

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Se esperaba imagen, recibido: {file.content_type}"
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 10MB)")

    logger.info(f"[OCR] Procesando {file.filename} | subject={subject} | q={question_id}")

    # 1. Preprocesar imagen
    processed_image, preprocess_meta = preprocess_image(raw_bytes)
    if preprocess_meta.get("was_rotated"):
        warnings.append("Imagen rotada automáticamente")
    if preprocess_meta.get("low_contrast"):
        warnings.append("Contraste bajo detectado, se aplicó mejora")

    # 2. Verificar calidad
    quality_score = check_image_quality(processed_image)
    if quality_score < 0.3:
        warnings.append(f"Calidad de imagen baja ({quality_score:.0%}) — resultado puede ser inexacto")

    # 3. Extraer texto con cascade de proveedores
    ocr_result = None
    provider_used = "none"

    providers_to_try = _get_provider_order(force_provider, subject, quality_score)

    for provider in providers_to_try:
        try:
            logger.info(f"[OCR] Intentando con: {provider}")

            if provider == "surya":
                ocr_result = extract_with_surya(processed_image, subject=subject)
            elif provider == "chandra":
                ocr_result = extract_with_chandra(processed_image)
            elif provider == "paddle":
                ocr_result = extract_with_paddle(processed_image)

            if ocr_result and ocr_result.get("confidence", 0) > 0.15:
                provider_used = provider
                logger.info(f"[OCR] Éxito con {provider} | conf={ocr_result['confidence']:.2f}")
                break
            else:
                warnings.append(f"{provider} retornó confianza baja, intentando siguiente")

        except Exception as e:
            logger.warning(f"[OCR] {provider} falló: {e}")
            warnings.append(f"{provider} no disponible")
            continue

    if not ocr_result:
        raise HTTPException(
            status_code=503,
            detail="Todos los proveedores OCR fallaron. Verifica que estén instalados."
        )

    # 4. Parsear pasos matemáticos (si aplica)
    math_steps, final_answer = [], None
    if subject == "math" and ocr_result.get("text"):
        math_steps, final_answer = parse_math_response(ocr_result["text"])

    # 5. Merge y score final
    final_confidence = merge_and_score(
        ocr_confidence=ocr_result.get("confidence", 0.5),
        quality_score=quality_score,
        has_math_steps=len(math_steps) > 0,
        subject=subject
    )

    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info(f"[OCR] Completado en {elapsed_ms}ms | conf={final_confidence:.2f} | proveedor={provider_used}")

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


def _get_provider_order(force: Optional[str], subject: str, quality: float) -> list[str]:
    """Define el orden de proveedores según contexto."""
    if force:
        return [force]

    # Para math con calidad alta: Surya primero (tiene modo math)
    if subject == "math" and quality >= 0.5:
        return ["surya", "chandra", "paddle"]

    # Para manuscritos difíciles (baja calidad): Chandra primero
    if quality < 0.4:
        return ["chandra", "surya", "paddle"]

    # Default
    return ["surya", "chandra", "paddle"]
