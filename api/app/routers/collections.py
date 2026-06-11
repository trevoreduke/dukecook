"""Cookbooks / Collections — DESIGN.md §3.3.

Themed recipe groupings ("Date Night", "Under 30 Minutes") with a share slug
so a collection can be sent to family read-only at /c/<slug> — same pattern
as guest menus.
"""

import logging
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func

from app.database import get_db
from app.models import Collection, CollectionRecipe, Recipe, Rating

logger = logging.getLogger("dukecook.routers.collections")
router = APIRouter(prefix="/api/collections", tags=["collections"])


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower().strip()).strip("-")
    return slug or "collection"


class CollectionIn(BaseModel):
    name: str
    emoji: str = "📚"
    description: str = ""


class CollectionUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
    description: str | None = None


def _recipe_summary(r: Recipe, avg_stars: float | None = None) -> dict:
    return {
        "recipe_id": r.id,
        "title": r.title,
        "image_url": r.image_url,
        "image_path": r.image_path,
        "total_time_min": r.total_time_min,
        "cuisine": r.cuisine,
        "difficulty": r.difficulty,
        "avg_stars": avg_stars,
    }


async def _avg_stars(db: AsyncSession, recipe_ids: list[int]) -> dict[int, float]:
    if not recipe_ids:
        return {}
    rows = await db.execute(
        select(Rating.recipe_id, func.avg(Rating.stars))
        .where(Rating.recipe_id.in_(recipe_ids))
        .group_by(Rating.recipe_id)
    )
    return {rid: round(float(a), 1) for rid, a in rows.all()}


@router.get("")
async def list_collections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Collection).order_by(Collection.name))
    collections = result.scalars().all()
    counts = await db.execute(
        select(CollectionRecipe.collection_id, func.count(CollectionRecipe.id))
        .group_by(CollectionRecipe.collection_id)
    )
    count_by_id = dict(counts.all())
    # First few recipe images for the card collage
    covers: dict[int, list[str]] = {}
    rows = await db.execute(
        select(CollectionRecipe.collection_id, Recipe.image_url, Recipe.image_path)
        .join(Recipe, Recipe.id == CollectionRecipe.recipe_id)
        .order_by(CollectionRecipe.sort_order)
    )
    for cid, image_url, image_path in rows.all():
        img = image_path or image_url
        if img and len(covers.setdefault(cid, [])) < 3:
            covers[cid].append(img)
    return [
        {
            "id": c.id, "name": c.name, "emoji": c.emoji,
            "description": c.description, "slug": c.slug,
            "recipe_count": count_by_id.get(c.id, 0),
            "covers": covers.get(c.id, []),
        }
        for c in collections
    ]


@router.post("", status_code=201)
async def create_collection(data: CollectionIn, db: AsyncSession = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    slug = f"{_slugify(name)}-{secrets.token_hex(3)}"
    c = Collection(name=name, emoji=data.emoji or "📚", description=data.description.strip(), slug=slug)
    db.add(c)
    await db.flush()
    logger.info(f"Collection created: {name} ({slug})")
    return {"id": c.id, "name": c.name, "emoji": c.emoji, "slug": c.slug}


@router.get("/{collection_id}")
async def get_collection(collection_id: int, db: AsyncSession = Depends(get_db)):
    c = await db.get(Collection, collection_id)
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    rows = await db.execute(
        select(CollectionRecipe, Recipe)
        .join(Recipe, Recipe.id == CollectionRecipe.recipe_id)
        .where(CollectionRecipe.collection_id == collection_id)
        .order_by(CollectionRecipe.sort_order, CollectionRecipe.added_at)
    )
    pairs = rows.all()
    stars = await _avg_stars(db, [r.id for _, r in pairs])
    return {
        "id": c.id, "name": c.name, "emoji": c.emoji,
        "description": c.description, "slug": c.slug,
        "recipes": [_recipe_summary(r, stars.get(r.id)) for _, r in pairs],
    }


@router.put("/{collection_id}")
async def update_collection(collection_id: int, data: CollectionUpdate, db: AsyncSession = Depends(get_db)):
    c = await db.get(Collection, collection_id)
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    if data.name is not None and data.name.strip():
        c.name = data.name.strip()
    if data.emoji is not None:
        c.emoji = data.emoji
    if data.description is not None:
        c.description = data.description.strip()
    return {"ok": True}


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(collection_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Collection).where(Collection.id == collection_id))


@router.post("/{collection_id}/recipes/{recipe_id}", status_code=201)
async def add_recipe(collection_id: int, recipe_id: int, db: AsyncSession = Depends(get_db)):
    if not await db.get(Collection, collection_id):
        raise HTTPException(status_code=404, detail="Collection not found")
    if not await db.get(Recipe, recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")
    existing = await db.execute(
        select(CollectionRecipe).where(
            CollectionRecipe.collection_id == collection_id,
            CollectionRecipe.recipe_id == recipe_id,
        )
    )
    if existing.scalars().first():
        return {"ok": True, "already": True}
    max_order = await db.execute(
        select(func.coalesce(func.max(CollectionRecipe.sort_order), 0))
        .where(CollectionRecipe.collection_id == collection_id)
    )
    db.add(CollectionRecipe(
        collection_id=collection_id, recipe_id=recipe_id,
        sort_order=max_order.scalar_one() + 1,
    ))
    return {"ok": True}


@router.delete("/{collection_id}/recipes/{recipe_id}", status_code=204)
async def remove_recipe(collection_id: int, recipe_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(CollectionRecipe).where(
            CollectionRecipe.collection_id == collection_id,
            CollectionRecipe.recipe_id == recipe_id,
        )
    )


@router.get("/recipe/{recipe_id}/memberships")
async def recipe_memberships(recipe_id: int, db: AsyncSession = Depends(get_db)):
    """Which collections contain this recipe — for the recipe-page picker."""
    rows = await db.execute(
        select(CollectionRecipe.collection_id).where(CollectionRecipe.recipe_id == recipe_id)
    )
    return {"collection_ids": [cid for (cid,) in rows.all()]}


@router.get("/shared/{slug}")
async def shared_collection(slug: str, db: AsyncSession = Depends(get_db)):
    """Public read-only view (consumed by /c/<slug>) — no edit affordances."""
    result = await db.execute(select(Collection).where(Collection.slug == slug))
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    rows = await db.execute(
        select(CollectionRecipe, Recipe)
        .join(Recipe, Recipe.id == CollectionRecipe.recipe_id)
        .where(CollectionRecipe.collection_id == c.id)
        .order_by(CollectionRecipe.sort_order, CollectionRecipe.added_at)
    )
    pairs = rows.all()
    stars = await _avg_stars(db, [r.id for _, r in pairs])
    return {
        "name": c.name, "emoji": c.emoji, "description": c.description,
        "recipes": [_recipe_summary(r, stars.get(r.id)) for _, r in pairs],
    }
