"""
image_preprocess.py
Limpia, endereza y mejora la imagen antes del OCR.
"""

import io
import math
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
import numpy as np


def preprocess_image(raw_bytes: bytes) -> tuple[Image.Image, dict]:
    """
    Pipeline de preprocesamiento de imagen.
    Retorna: (imagen_procesada, metadatos)
    """
    meta = {
        "was_rotated": False,
        "low_contrast": False,
        "original_size": None,
        "final_size": None,
    }

    image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    meta["original_size"] = image.size

    # 1. Rotar si viene de móvil con EXIF
    image = _fix_exif_rotation(image)

    # 2. Redimensionar si es muy grande o muy pequeña
    image = _normalize_resolution(image)

    # 3. Detectar y corregir rotación del texto (deskew)
    image, was_rotated = _deskew(image)
    meta["was_rotated"] = was_rotated

    # 4. Mejorar contraste si es muy bajo
    contrast_score = _measure_contrast(image)
    if contrast_score < 0.3:
        meta["low_contrast"] = True
        image = _enhance_contrast(image)

    # 5. Reducir ruido leve
    image = image.filter(ImageFilter.MedianFilter(size=3))

    meta["final_size"] = image.size
    return image, meta


def _fix_exif_rotation(image: Image.Image) -> Image.Image:
    """Corrige orientación EXIF de fotos tomadas con móvil."""
    try:
        from PIL.ExifTags import TAGS
        exif = image._getexif()
        if exif:
            for tag, value in exif.items():
                if TAGS.get(tag) == "Orientation":
                    rotation_map = {3: 180, 6: 270, 8: 90}
                    degrees = rotation_map.get(value)
                    if degrees:
                        return image.rotate(degrees, expand=True)
    except Exception:
        pass
    return image


def _normalize_resolution(image: Image.Image) -> Image.Image:
    """
    Surya funciona mejor con texto suficientemente grande.
    Target: ancho entre 800px y 2048px.
    """
    w, h = image.size
    if w < 800:
        scale = 800 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    elif w > 2048:
        scale = 2048 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return image


def _deskew(image: Image.Image) -> tuple[Image.Image, bool]:
    """
    Detecta si el texto está inclinado y lo endereza.
    Usa proyección horizontal para encontrar el ángulo óptimo.
    """
    try:
        import cv2

        img_array = np.array(image.convert("L"))
        _, binary = cv2.threshold(img_array, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        coords = np.column_stack(np.where(binary > 0))
        if len(coords) < 100:
            return image, False

        angle = cv2.minAreaRect(coords)[-1]

        # Normalizar ángulo
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        # Solo corregir si la inclinación es significativa (>1.5°)
        if abs(angle) > 1.5:
            (h, w) = img_array.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(
                np.array(image),
                M,
                (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
            return Image.fromarray(rotated), True

    except ImportError:
        pass

    return image, False


def _measure_contrast(image: Image.Image) -> float:
    """Retorna un score de contraste 0-1."""
    gray = np.array(image.convert("L"), dtype=float)
    std = gray.std()
    return min(std / 80.0, 1.0)


def _enhance_contrast(image: Image.Image) -> Image.Image:
    """Mejora contraste usando CLAHE-like (PIL)."""
    image = ImageOps.autocontrast(image, cutoff=2)
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.8)
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(1.5)
    return image
