"""Recipe import routes."""

import logging
import time
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import ImportRequest, BulkImportRequest, ImportResult
from app.services.recipe_importer import import_recipe_from_url, save_recipe_data
from app.services.ai_extractor import extract_recipe_from_image, enrich_recipe_tags

logger = logging.getLogger("dukecook.routers.import_recipe")
router = APIRouter(prefix="/api/recipes", tags=["import"])


@router.post("/import", response_model=ImportResult)
async def import_from_url(data: ImportRequest, db: AsyncSession = Depends(get_db)):
    """Import a recipe from a URL.

    Tries structured data extraction first (recipe-scrapers),
    falls back to AI extraction via Claude.
    """
    logger.info(f"Import request for URL: {data.url}", extra={
        "extra_data": {"url": data.url, "user_id": data.user_id}
    })

    result = await import_recipe_from_url(db, data.url, data.user_id)
    return ImportResult(**result)


@router.post("/import/photo")
async def import_from_photo(
    file: UploadFile = File(...),
    user_id: int = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Import a recipe from a photo.

    Accepts photos of cookbook pages, handwritten recipes, recipe cards,
    magazine clippings, screenshots, etc. Uses Claude Vision to extract
    all recipe data.
    """
    start_time = time.time()

    # Validate file type
    allowed_types = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/webp": "image/webp",
        "image/gif": "image/gif",
        "image/heic": "image/jpeg",  # Will need conversion
        "image/heif": "image/jpeg",
    }

    content_type = file.content_type or "image/jpeg"
    media_type = allowed_types.get(content_type)
    if not media_type:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {content_type}. Use JPEG, PNG, or WebP."
        )

    # Read image data
    image_data = await file.read()
    if len(image_data) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="Image too large. Max 20MB.")

    logger.info(f"Photo import: {file.filename} ({len(image_data)} bytes, {content_type})", extra={
        "extra_data": {"filename": file.filename, "size": len(image_data), "content_type": content_type, "user_id": user_id}
    })

    # Extract recipe via Claude Vision
    recipe_data = await extract_recipe_from_image(image_data, media_type, file.filename or "photo")
    if not recipe_data:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "status": "failed",
            "url": f"photo:{file.filename}",
            "recipe_id": None,
            "recipe_title": None,
            "error": "Could not extract recipe from image. Try a clearer photo.",
            "extraction_method": "photo",
            "duration_ms": duration_ms,
        }

    # Enrich tags if not present
    if not recipe_data.get("tags"):
        recipe_data["tags"] = await enrich_recipe_tags(recipe_data)

    # Save to database using shared save logic
    try:
        result = await save_recipe_data(
            db,
            recipe_data,
            source_url=f"photo:{file.filename}",
            extraction_method="photo",
            user_id=user_id,
            start_time=start_time,
        )
        return result
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Failed to save photo-imported recipe: {e}", exc_info=True)
        return {
            "status": "failed",
            "url": f"photo:{file.filename}",
            "recipe_id": None,
            "recipe_title": None,
            "error": str(e),
            "extraction_method": "photo",
            "duration_ms": duration_ms,
        }


@router.post("/import/bulk", response_model=list[ImportResult])
async def bulk_import(data: BulkImportRequest, db: AsyncSession = Depends(get_db)):
    """Import multiple recipes from URLs."""
    logger.info(f"Bulk import request: {len(data.urls)} URLs", extra={
        "extra_data": {"url_count": len(data.urls), "user_id": data.user_id}
    })

    results = []
    for url in data.urls:
        url = url.strip()
        if not url:
            continue
        logger.info(f"Bulk importing: {url}")
        result = await import_recipe_from_url(db, url, data.user_id)
        results.append(ImportResult(**result))

    success = sum(1 for r in results if r.status == "success")
    failed = sum(1 for r in results if r.status == "failed")
    logger.info(f"Bulk import complete: {success} succeeded, {failed} failed", extra={
        "extra_data": {"success": success, "failed": failed, "total": len(results)}
    })

    return results
