"""Re-import every recipe with the new (verbatim-fidelity) prompt.

For each recipe:
  - photo:* → re-extract from the saved image_path
  - http(s) → re-fetch the page and re-extract from HTML

Existing rating, meal-plan, and tag rows are preserved (recipe.id never changes).
Ingredients and steps are wiped + replaced atomically per recipe.

Usage (inside container):
    docker compose exec api python /app/scripts/reimport_all.py            # all
    docker compose exec api python /app/scripts/reimport_all.py --ids 81,82
    docker compose exec api python /app/scripts/reimport_all.py --photos-only
    docker compose exec api python /app/scripts/reimport_all.py --urls-only
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# Make `app` importable when running from /app
sys.path.insert(0, "/app")

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Recipe, RecipeIngredient, RecipeStep
from app.services.ai_extractor import extract_recipe_from_html, extract_recipe_from_image
from app.services.recipe_importer import (
    get_or_create_ingredient,
    get_or_create_tag,
    save_recipe_data,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("reimport")


def _media_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")


async def _replace_recipe_data(
    db: AsyncSession,
    recipe: Recipe,
    extracted: dict,
) -> tuple[int, int]:
    """Update existing recipe row in place with re-extracted data.

    Returns (n_ingredients, n_steps).
    """
    # Wipe existing ingredients + steps for this recipe
    await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    await db.execute(delete(RecipeStep).where(RecipeStep.recipe_id == recipe.id))

    # Update top-level fields (don't touch source_url, image_path, archived, created_at, etc.)
    for field in (
        "title",
        "description",
        "prep_time_min",
        "cook_time_min",
        "total_time_min",
        "servings",
        "cuisine",
        "difficulty",
        "notes",
    ):
        v = extracted.get(field)
        if v is not None and v != "":
            setattr(recipe, field, v)

    # Re-add ingredients
    n_ing = 0
    for sort_order, ing in enumerate(extracted.get("ingredients", []) or []):
        name = (ing.get("name") or "").strip()
        ing_id = None
        if name:
            normalized = await get_or_create_ingredient(db, name)
            ing_id = normalized.id
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_id=ing_id,
                raw_text=ing.get("raw_text", "") or name,
                quantity=ing.get("quantity"),
                unit=ing.get("unit") or "",
                preparation=ing.get("preparation") or "",
                group_name=ing.get("group") or "",
                sort_order=sort_order,
            )
        )
        n_ing += 1

    # Re-add steps
    n_steps = 0
    for step_number, step in enumerate(extracted.get("steps", []) or [], start=1):
        instruction = (step.get("instruction") or "").strip()
        if not instruction:
            continue
        db.add(
            RecipeStep(
                recipe_id=recipe.id,
                step_number=step_number,
                instruction=instruction,
                duration_minutes=step.get("duration_minutes"),
                timer_label=step.get("timer_label") or "",
            )
        )
        n_steps += 1

    return n_ing, n_steps


async def reimport_one(db: AsyncSession, recipe: Recipe, settings) -> dict:
    src = recipe.source_url or ""
    started = time.time()
    out = {"id": recipe.id, "title": recipe.title, "source": src}

    extracted = None
    if src.startswith("photo:"):
        # Re-extract from saved image
        if not recipe.image_path:
            return {**out, "status": "skipped", "reason": "no image_path"}
        # image_path looks like "/images/photo_import_xxx.jpg"
        # Inside the api container, /data/images is the bind mount.
        local = Path("/data") / recipe.image_path.lstrip("/")
        if not local.exists():
            return {**out, "status": "skipped", "reason": f"image not on disk: {local}"}
        data = local.read_bytes()
        extracted = await extract_recipe_from_image(data, _media_type_for(local), local.name)
    elif src.startswith("http://") or src.startswith("https://"):
        # Re-fetch HTML and re-extract
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=30,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
                                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                },
            ) as client:
                resp = await client.get(src)
                resp.raise_for_status()
                html = resp.text
        except Exception as e:
            return {**out, "status": "failed", "reason": f"fetch error: {e}"}
        extracted = await extract_recipe_from_html(html, src)
    else:
        return {**out, "status": "skipped", "reason": "unknown source kind"}

    if not extracted:
        return {**out, "status": "failed", "reason": "extractor returned None"}

    n_ing, n_steps = await _replace_recipe_data(db, recipe, extracted)
    await db.commit()
    dur_ms = int((time.time() - started) * 1000)
    return {
        **out,
        "status": "ok",
        "ingredients": n_ing,
        "steps": n_steps,
        "ms": dur_ms,
        "title_after": recipe.title,
    }


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--ids", help="Comma-separated recipe ids to re-import (default: all)")
    p.add_argument("--photos-only", action="store_true")
    p.add_argument("--urls-only", action="store_true")
    p.add_argument("--limit", type=int, default=0, help="Process at most N recipes")
    args = p.parse_args()

    settings = get_settings()

    target_ids: list[int] | None = None
    if args.ids:
        target_ids = [int(x) for x in args.ids.split(",") if x.strip()]

    async with AsyncSessionLocal() as db:
        query = select(Recipe).order_by(Recipe.id)
        if target_ids:
            query = query.where(Recipe.id.in_(target_ids))
        result = await db.execute(query)
        recipes = result.scalars().all()

    if args.photos_only:
        recipes = [r for r in recipes if (r.source_url or "").startswith("photo:")]
    elif args.urls_only:
        recipes = [r for r in recipes if (r.source_url or "").startswith("http")]

    if args.limit:
        recipes = recipes[: args.limit]

    log.info("Re-importing %d recipes", len(recipes))

    ok = fail = skip = 0
    for r in recipes:
        async with AsyncSessionLocal() as db:
            # Re-fetch in this session
            res = await db.execute(select(Recipe).where(Recipe.id == r.id))
            fresh = res.scalar_one()
            try:
                summary = await reimport_one(db, fresh, settings)
            except Exception as e:
                log.exception("recipe %d crashed: %s", r.id, e)
                summary = {"id": r.id, "status": "failed", "reason": str(e)}

        status = summary.get("status")
        if status == "ok":
            ok += 1
            log.info(
                "OK   #%d %-50s ing=%d steps=%d (%dms)",
                summary["id"], (summary.get("title_after") or "")[:50],
                summary["ingredients"], summary["steps"], summary["ms"],
            )
        elif status == "skipped":
            skip += 1
            log.warning("SKIP #%d %-50s — %s", summary["id"], (r.title or "")[:50], summary.get("reason"))
        else:
            fail += 1
            log.error("FAIL #%d %-50s — %s", summary["id"], (r.title or "")[:50], summary.get("reason"))

    log.info("Done. ok=%d fail=%d skip=%d total=%d", ok, fail, skip, len(recipes))


if __name__ == "__main__":
    asyncio.run(main())
