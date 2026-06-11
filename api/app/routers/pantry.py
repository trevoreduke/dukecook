"""Pantry Mode — DESIGN.md §3.2.

Maintain an actual-inventory list (PantryItem) on top of the assumed
PantryStaple basics, fill it by hand or from a fridge/pantry photo (Claude
vision), and rank the recipe library by what you can cook RIGHT NOW —
flagging near-misses ("you just need cream and dill").
"""

import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models import (
    PantryItem, PantryStaple, Recipe, RecipeIngredient, Ingredient,
)

logger = logging.getLogger("dukecook.routers.pantry")
router = APIRouter(prefix="/api/pantry", tags=["pantry"])

CATEGORIES = ["produce", "dairy", "meat", "pantry", "spice", "frozen", "bakery", "other"]

# Words in ingredient raw_text that are prep/measure noise, not the food itself.
_NOISE = {
    "cup", "cups", "tablespoon", "tablespoons", "tbsp", "teaspoon", "teaspoons",
    "tsp", "ounce", "ounces", "oz", "pound", "pounds", "lb", "lbs", "gram",
    "grams", "g", "kg", "ml", "liter", "liters", "large", "small", "medium",
    "fresh", "freshly", "chopped", "diced", "minced", "sliced", "ground",
    "grated", "shredded", "crushed", "divided", "optional", "plus", "more",
    "taste", "and", "or", "of", "to", "for", "the", "a", "an", "into", "cut",
    "thinly", "finely", "roughly", "about", "can", "cans", "jar", "package",
    "packages", "bag", "boneless", "skinless", "trimmed", "peeled", "seeded",
    "halved", "quartered", "cubed", "softened", "melted", "room", "temperature",
    "cooked", "uncooked", "dry", "dried", "extra", "virgin", "low", "sodium",
    "unsalted", "salted", "whole", "half", "piece", "pieces", "inch", "needed",
}


def _norm_word(w: str) -> str:
    """Lowercase + naive singular: tomatoes→tomato, berries→berry."""
    w = w.lower().strip()
    if len(w) > 3:
        if w.endswith("ies"):
            return w[:-3] + "y"
        if w.endswith("oes"):
            return w[:-2]
        if w.endswith("s") and not w.endswith("ss"):
            return w[:-1]
    return w


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z]+", text.lower())
    return {_norm_word(w) for w in words if _norm_word(w) not in _NOISE and len(w) > 2}


def _matches(ingredient_tokens: set[str], have_tokens: list[set[str]]) -> bool:
    """An ingredient is on hand when some pantry item's tokens all appear in it
    (pantry 'chicken thigh' covers 'boneless chicken thighs') or the pantry
    item is a single word that the ingredient mentions ('chicken' covers
    'chicken breast')."""
    if not ingredient_tokens:
        return True  # un-parseable line ("garnish") — don't block the recipe on it
    for have in have_tokens:
        if have and have <= ingredient_tokens:
            return True
    return False


class PantryItemIn(BaseModel):
    name: str
    category: str = "other"
    quantity_text: str = ""


class PantryItemUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    quantity_text: str | None = None


@router.get("")
async def list_pantry(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PantryItem).order_by(PantryItem.category, PantryItem.name))
    items = result.scalars().all()
    return [
        {
            "id": i.id, "name": i.name, "category": i.category,
            "quantity_text": i.quantity_text, "source": i.source,
            "confidence": i.confidence, "added_at": str(i.added_at),
        }
        for i in items
    ]


@router.post("", status_code=201)
async def add_pantry_item(data: PantryItemIn, db: AsyncSession = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.execute(select(PantryItem).where(PantryItem.name.ilike(name)))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"'{name}' is already in the pantry")
    item = PantryItem(
        name=name,
        category=data.category if data.category in CATEGORIES else "other",
        quantity_text=data.quantity_text.strip(),
        source="manual",
    )
    db.add(item)
    await db.flush()
    return {"id": item.id, "name": item.name, "category": item.category}


@router.put("/{item_id}")
async def update_pantry_item(item_id: int, data: PantryItemUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(PantryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    if data.name is not None:
        item.name = data.name.strip()
    if data.category is not None and data.category in CATEGORIES:
        item.category = data.category
    if data.quantity_text is not None:
        item.quantity_text = data.quantity_text.strip()
    return {"ok": True}


@router.delete("/{item_id}", status_code=204)
async def delete_pantry_item(item_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(PantryItem).where(PantryItem.id == item_id))


@router.post("/clear")
async def clear_pantry(db: AsyncSession = Depends(get_db)):
    """Empty the inventory (staples are untouched — they're settings)."""
    result = await db.execute(delete(PantryItem))
    return {"deleted": result.rowcount}


@router.post("/photo")
async def scan_pantry_photo(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Snap the fridge/pantry → Claude inventories it → merge into PantryItem.

    Synchronous (one vision call, a few seconds) — the UI shows a scanning
    state. Existing items keep their row (quantity/confidence refreshed);
    new ones are inserted with source=photo.
    """
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {content_type}")
    image_data = await file.read()
    if len(image_data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Max 20MB.")

    from app.services.ai_extractor import extract_pantry_from_image
    media_type = "image/jpeg" if content_type in ("image/jpg", "image/heic", "image/heif") else content_type
    found = await extract_pantry_from_image(image_data, media_type)
    if found is None:
        raise HTTPException(status_code=502, detail="AI could not read the photo — try a clearer shot")

    existing = await db.execute(select(PantryItem))
    by_norm = {frozenset(_tokens(i.name)) or frozenset({i.name.lower()}): i for i in existing.scalars().all()}

    added, updated = [], []
    for f in found:
        name = (f.get("name") or "").strip()
        if not name:
            continue
        key = frozenset(_tokens(name)) or frozenset({name.lower()})
        category = f.get("category") if f.get("category") in CATEGORIES else "other"
        confidence = f.get("confidence")
        qty = (f.get("quantity_text") or "").strip()
        if key in by_norm:
            item = by_norm[key]
            if qty:
                item.quantity_text = qty
            item.confidence = confidence
            item.updated_at = datetime.utcnow()
            updated.append(item.name)
        else:
            item = PantryItem(
                name=name, category=category, quantity_text=qty,
                source="photo", confidence=confidence,
            )
            db.add(item)
            by_norm[key] = item
            added.append(name)

    logger.info(f"Pantry photo scan: +{len(added)} new, {len(updated)} refreshed")
    return {"added": added, "updated": updated, "total_found": len(found)}


@router.get("/can-cook")
async def can_cook(db: AsyncSession = Depends(get_db)):
    """Rank the library by pantry coverage.

    ready  = every ingredient matched (staples count as always on hand)
    close  = missing 1–2 ingredients (listed, so one grocery grab fixes it)
    """
    pantry = (await db.execute(select(PantryItem))).scalars().all()
    staples = (await db.execute(select(PantryStaple))).scalars().all()
    if not pantry:
        return {"ready": [], "close": [], "pantry_count": 0}

    have_tokens = [_tokens(p.name) for p in pantry] + [_tokens(s.name) for s in staples]
    # Things nobody keeps an inventory of — never report these as "missing"
    # ("Caramel Sauce — just need: water" was a real result).
    have_tokens += [{"water"}, {"ice"}, {"ice", "water"}, {"ice", "cube"}]
    have_tokens = [t for t in have_tokens if t]

    recipes = (
        await db.execute(
            select(Recipe).where(Recipe.archived == False)  # noqa: E712
        )
    ).scalars().all()

    ing_rows = await db.execute(
        select(RecipeIngredient.recipe_id, RecipeIngredient.raw_text, Ingredient.name)
        .outerjoin(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id)
    )
    by_recipe: dict[int, list[tuple[str, str | None]]] = {}
    for rid, raw, ing_name in ing_rows.all():
        by_recipe.setdefault(rid, []).append((raw, ing_name))

    ready, close = [], []
    for r in recipes:
        ings = by_recipe.get(r.id)
        if not ings:
            continue
        missing = []
        for raw, ing_name in ings:
            # Prefer the parsed ingredient name (cleaner) but fall back to raw text
            tok = _tokens(ing_name) if ing_name else set()
            if not tok:
                tok = _tokens(raw)
            if not _matches(tok, have_tokens):
                missing.append(ing_name or raw)
        entry = {
            "recipe_id": r.id,
            "title": r.title,
            "image_url": r.image_url,
            "image_path": r.image_path,
            "total_time_min": r.total_time_min,
            "ingredient_count": len(ings),
            "missing": missing[:4],
            "missing_count": len(missing),
        }
        if not missing:
            ready.append(entry)
        elif len(missing) <= 2:
            close.append(entry)

    ready.sort(key=lambda e: e["ingredient_count"])
    close.sort(key=lambda e: (e["missing_count"], e["ingredient_count"]))
    return {"ready": ready[:30], "close": close[:30], "pantry_count": len(pantry)}
