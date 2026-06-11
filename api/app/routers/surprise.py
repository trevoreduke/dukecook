"""Surprise Me — the decision-fatigue killer (DESIGN.md §3.4).

Three modes:
  favorites — spin the wheel across your highly-rated recipes
  new       — something from the library you've never cooked or rated
  similar   — "like <recipe> but different": Claude picks from the library

favorites/new are pure SQL + random. similar uses one small Claude call and
falls back to tag/cuisine overlap when the API is unavailable, so the button
always produces something.
"""

import json
import logging
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.config import get_settings
from app.database import get_db
from app.models import (
    CookingHistory, MealPlan, Rating, Recipe, RecipeTag, Tag,
)

logger = logging.getLogger("dukecook.routers.surprise")
router = APIRouter(prefix="/api/surprise", tags=["surprise"])


class SurpriseRequest(BaseModel):
    mode: str = "favorites"  # favorites | new | similar
    recipe_id: int | None = None  # required for similar
    exclude_ids: list[int] = []   # "spin again" — don't repeat these


def _summary(r: Recipe, reason: str, avg_stars: float | None = None) -> dict:
    return {
        "recipe_id": r.id,
        "title": r.title,
        "description": (r.description or "")[:200],
        "image_url": r.image_url,
        "image_path": r.image_path,
        "total_time_min": r.total_time_min,
        "cuisine": r.cuisine,
        "difficulty": r.difficulty,
        "avg_stars": avg_stars,
        "reason": reason,
    }


async def _recipe_tags(db: AsyncSession, recipe_ids: list[int]) -> dict[int, list[str]]:
    if not recipe_ids:
        return {}
    rows = await db.execute(
        select(RecipeTag.recipe_id, Tag.name)
        .join(Tag, Tag.id == RecipeTag.tag_id)
        .where(RecipeTag.recipe_id.in_(recipe_ids))
    )
    out: dict[int, list[str]] = {}
    for rid, name in rows.all():
        out.setdefault(rid, []).append(name)
    return out


@router.post("")
async def surprise(data: SurpriseRequest, db: AsyncSession = Depends(get_db)):
    exclude = set(data.exclude_ids or [])

    if data.mode == "favorites":
        rows = await db.execute(
            select(Rating.recipe_id, func.avg(Rating.stars))
            .group_by(Rating.recipe_id)
            .having(func.avg(Rating.stars) >= 4)
        )
        loved = {rid: round(float(a), 1) for rid, a in rows.all() if rid not in exclude}
        if not loved:
            raise HTTPException(status_code=404, detail="No 4★+ favorites yet — rate some dinners first!")
        recipes = (
            await db.execute(
                select(Recipe).where(Recipe.id.in_(list(loved)), Recipe.archived == False)  # noqa: E712
            )
        ).scalars().all()
        if not recipes:
            raise HTTPException(status_code=404, detail="No favorites available")
        pick = random.choice(recipes)
        return _summary(pick, "A proven favorite — you both rated this 4★+", loved.get(pick.id))

    if data.mode == "new":
        cooked_ids = {rid for (rid,) in (await db.execute(select(CookingHistory.recipe_id))).all() if rid}
        planned_ids = {rid for (rid,) in (await db.execute(
            select(MealPlan.recipe_id).where(MealPlan.status == "cooked")
        )).all()}
        rated_ids = {rid for (rid,) in (await db.execute(select(Rating.recipe_id).distinct())).all()}
        seen = cooked_ids | planned_ids | rated_ids | exclude
        recipes = (
            await db.execute(
                select(Recipe).where(Recipe.archived == False)  # noqa: E712
            )
        ).scalars().all()
        untried = [r for r in recipes if r.id not in seen]
        if not untried:
            raise HTTPException(status_code=404, detail="You've tried everything — import something new!")
        pick = random.choice(untried)
        return _summary(pick, "Never cooked, never rated — a fresh adventure")

    if data.mode == "similar":
        if not data.recipe_id:
            raise HTTPException(status_code=400, detail="recipe_id required for similar mode")
        base = await db.get(Recipe, data.recipe_id)
        if not base:
            raise HTTPException(status_code=404, detail="Recipe not found")
        candidates = (
            await db.execute(
                select(Recipe).where(
                    Recipe.archived == False,  # noqa: E712
                    Recipe.id != base.id,
                )
            )
        ).scalars().all()
        candidates = [c for c in candidates if c.id not in exclude]
        if not candidates:
            raise HTTPException(status_code=404, detail="No other recipes to compare against")

        tags = await _recipe_tags(db, [base.id] + [c.id for c in candidates])
        pick, reason = await _similar_via_ai(base, candidates, tags)
        if pick is None:
            pick, reason = _similar_via_tags(base, candidates, tags)
        return _summary(pick, reason)

    raise HTTPException(status_code=400, detail=f"Unknown mode: {data.mode}")


def _similar_via_tags(base: Recipe, candidates: list[Recipe], tags: dict[int, list[str]]):
    """Fallback: rank by tag overlap + same-cuisine bonus, minus exact-cuisine
    sameness so 'but different' means something. Random among the top 5."""
    base_tags = set(t.lower() for t in tags.get(base.id, []))
    scored = []
    for c in candidates:
        c_tags = set(t.lower() for t in tags.get(c.id, []))
        overlap = len(base_tags & c_tags)
        cuisine_bonus = 1 if (c.cuisine and c.cuisine == base.cuisine) else 0
        scored.append((overlap + cuisine_bonus * 0.5, c))
    scored.sort(key=lambda x: -x[0])
    top = [c for _, c in scored[:5]] or candidates
    pick = random.choice(top)
    return pick, f"Shares the vibe of {base.title} — different enough to feel new"


async def _similar_via_ai(base: Recipe, candidates: list[Recipe], tags: dict[int, list[str]]):
    """One small Claude call: pick the best 'like X but different' candidate."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None, None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        listing = "\n".join(
            f"- id {c.id}: {c.title} (cuisine: {c.cuisine or '?'}; tags: {', '.join(tags.get(c.id, [])) or 'none'})"
            for c in candidates[:120]
        )
        prompt = f"""We loved this recipe and want something LIKE it but DIFFERENT (not a near-duplicate):

BASE: {base.title} (cuisine: {base.cuisine or '?'}; tags: {', '.join(tags.get(base.id, [])) or 'none'})
{(base.description or '')[:300]}

LIBRARY:
{listing}

Pick the single best candidate. Return ONLY JSON: {{"id": <id>, "reason": "<one playful sentence, max 120 chars, why it scratches the same itch differently>"}}"""
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text[: text.rfind("```")] if "```" in text else text
        choice = json.loads(text.strip())
        by_id = {c.id: c for c in candidates}
        pick = by_id.get(int(choice.get("id", 0)))
        if pick:
            return pick, choice.get("reason") or f"Like {base.title}, but different"
    except Exception as e:
        logger.warning(f"similar-via-AI failed, falling back to tags: {e}")
    return None, None
