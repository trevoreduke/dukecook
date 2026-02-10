"""Recipe import routes."""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import ImportRequest, BulkImportRequest, ImportResult
from app.services.recipe_importer import import_recipe_from_url

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
