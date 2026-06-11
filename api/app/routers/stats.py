"""Cooking stats & history — DESIGN.md §3.5.

Everything here is read-side aggregation over data the app already records:
CookingHistory (written when ratings come in), meal_plan rows marked cooked,
ratings, and recipe tags. "A cook" is the union of CookingHistory and
cooked meal-plan rows, deduped on (recipe_id, date) so a rating that also
flipped the plan row doesn't count twice.
"""

import logging
from datetime import date, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import (
    CookingHistory, MealPlan, Rating, Recipe, RecipeTag, Tag, User,
)

logger = logging.getLogger("dukecook.routers.stats")
router = APIRouter(prefix="/api/stats", tags=["stats"])

FORGOTTEN_MIN_STARS = 4.0
FORGOTTEN_DAYS = 60


async def _cook_events(db: AsyncSession, since: date) -> list[tuple[int, date]]:
    """Deduped (recipe_id, date) cook events from history + cooked plans."""
    events: set[tuple[int, date]] = set()

    hist = await db.execute(
        select(CookingHistory.recipe_id, CookingHistory.cooked_at)
        .where(CookingHistory.cooked_at >= since, CookingHistory.recipe_id.isnot(None))
    )
    for rid, d in hist.all():
        events.add((rid, d))

    plans = await db.execute(
        select(MealPlan.recipe_id, MealPlan.date)
        .where(MealPlan.date >= since, MealPlan.status == "cooked")
    )
    for rid, d in plans.all():
        events.add((rid, d))

    return sorted(events, key=lambda e: e[1])


@router.get("/overview")
async def stats_overview(days: int = Query(default=365, ge=7, le=1095), db: AsyncSession = Depends(get_db)):
    """Headline numbers: cooks, distinct recipes, avg rating, weekly streak."""
    since = date.today() - timedelta(days=days)
    events = await _cook_events(db, since)

    distinct_recipes = len({rid for rid, _ in events})

    # Average stars across all ratings in the window
    avg_row = await db.execute(
        select(func.avg(Rating.stars), func.count(Rating.id))
        .where(Rating.created_at >= since)
    )
    avg_stars, rating_count = avg_row.one()

    # Weekly streak: consecutive ISO weeks ending with the current week that
    # each contain at least one cook. The current week counts even if it has
    # no cook YET (it isn't over), so the streak doesn't reset every Monday.
    weeks_with_cooks = {d.isocalendar()[:2] for _, d in events}
    streak = 0
    probe = date.today()
    this_week = probe.isocalendar()[:2]
    if this_week in weeks_with_cooks:
        streak = 1
    probe -= timedelta(days=7)
    while probe >= since:
        if probe.isocalendar()[:2] in weeks_with_cooks:
            streak += 1
            probe -= timedelta(days=7)
        else:
            break
    # current week pending: don't show 0 if last week cooked
    if streak == 0 and (date.today() - timedelta(days=7)).isocalendar()[:2] in weeks_with_cooks:
        back = date.today() - timedelta(days=7)
        while back >= since and back.isocalendar()[:2] in weeks_with_cooks:
            streak += 1
            back -= timedelta(days=7)

    # Cooks in the last 30 days vs the 30 before — simple trend signal
    d30 = date.today() - timedelta(days=30)
    d60 = date.today() - timedelta(days=60)
    last30 = sum(1 for _, d in events if d >= d30)
    prior30 = sum(1 for _, d in events if d60 <= d < d30)

    return {
        "days": days,
        "total_cooks": len(events),
        "distinct_recipes": distinct_recipes,
        "avg_stars": round(float(avg_stars), 2) if avg_stars is not None else None,
        "rating_count": rating_count,
        "streak_weeks": streak,
        "cooks_last_30": last30,
        "cooks_prior_30": prior30,
    }


@router.get("/timeline")
async def stats_timeline(weeks: int = Query(default=26, ge=4, le=104), db: AsyncSession = Depends(get_db)):
    """Cooks per week, oldest → newest, for the bar chart."""
    since = date.today() - timedelta(weeks=weeks)
    events = await _cook_events(db, since)

    counts: dict[date, int] = defaultdict(int)
    for _, d in events:
        week_start = d - timedelta(days=d.weekday())
        counts[week_start] += 1

    out = []
    cursor = date.today() - timedelta(days=date.today().weekday()) - timedelta(weeks=weeks - 1)
    for _ in range(weeks):
        out.append({"week_of": str(cursor), "cooks": counts.get(cursor, 0)})
        cursor += timedelta(weeks=1)
    return out


async def _distribution(db: AsyncSession, since: date, dimension: str) -> list[dict]:
    """Cook counts grouped by a recipe dimension (protein tag or cuisine)."""
    events = await _cook_events(db, since)
    if not events:
        return []
    recipe_ids = list({rid for rid, _ in events})
    cooks_per_recipe: dict[int, int] = defaultdict(int)
    for rid, _ in events:
        cooks_per_recipe[rid] += 1

    values: dict[int, list[str]] = defaultdict(list)
    if dimension == "protein":
        rows = await db.execute(
            select(RecipeTag.recipe_id, Tag.name)
            .join(Tag, Tag.id == RecipeTag.tag_id)
            .where(RecipeTag.recipe_id.in_(recipe_ids), Tag.type == "protein")
        )
        for rid, name in rows.all():
            values[rid].append(name.lower())
    else:  # cuisine
        rows = await db.execute(
            select(Recipe.id, Recipe.cuisine).where(Recipe.id.in_(recipe_ids))
        )
        for rid, cuisine in rows.all():
            if cuisine:
                values[rid].append(cuisine.lower())

    counts: dict[str, int] = defaultdict(int)
    for rid, cook_count in cooks_per_recipe.items():
        labels = values.get(rid) or ["other"]
        for label in labels:
            counts[label] += cook_count

    total = sum(counts.values()) or 1
    return sorted(
        [
            {"name": k, "cooks": v, "pct": round(v / total * 100, 1)}
            for k, v in counts.items()
        ],
        key=lambda x: -x["cooks"],
    )


@router.get("/proteins")
async def stats_proteins(days: int = Query(default=90, ge=7, le=1095), db: AsyncSession = Depends(get_db)):
    """Protein-variety distribution of what actually got cooked."""
    return await _distribution(db, date.today() - timedelta(days=days), "protein")


@router.get("/cuisines")
async def stats_cuisines(days: int = Query(default=90, ge=7, le=1095), db: AsyncSession = Depends(get_db)):
    return await _distribution(db, date.today() - timedelta(days=days), "cuisine")


@router.get("/most-cooked")
async def most_cooked(limit: int = Query(default=10, ge=1, le=50), db: AsyncSession = Depends(get_db)):
    """All-time most-cooked recipes with last-cooked date and avg rating."""
    events = await _cook_events(db, date(2000, 1, 1))
    per_recipe: dict[int, list[date]] = defaultdict(list)
    for rid, d in events:
        per_recipe[rid].append(d)

    top = sorted(per_recipe.items(), key=lambda kv: -len(kv[1]))[: limit * 2]
    if not top:
        return []
    recipe_ids = [rid for rid, _ in top]

    recipes = await db.execute(
        select(Recipe).where(Recipe.id.in_(recipe_ids), Recipe.archived == False)  # noqa: E712
    )
    by_id = {r.id: r for r in recipes.scalars().all()}

    avg_rows = await db.execute(
        select(Rating.recipe_id, func.avg(Rating.stars))
        .where(Rating.recipe_id.in_(recipe_ids))
        .group_by(Rating.recipe_id)
    )
    avg_by_id = {rid: round(float(a), 1) for rid, a in avg_rows.all()}

    out = []
    for rid, dates in top:
        r = by_id.get(rid)
        if not r:
            continue
        out.append({
            "recipe_id": rid,
            "title": r.title,
            "image_url": r.image_url,
            "image_path": r.image_path,
            "cook_count": len(dates),
            "last_cooked": str(max(dates)),
            "avg_stars": avg_by_id.get(rid),
        })
        if len(out) >= limit:
            break
    return out


@router.get("/forgotten-favorites")
async def forgotten_favorites(db: AsyncSession = Depends(get_db)):
    """Recipes you both loved but haven't cooked in 60+ days.

    Loved = average rating >= 4 stars. Sorted by how long it's been.
    """
    cutoff = date.today() - timedelta(days=FORGOTTEN_DAYS)

    rated = await db.execute(
        select(Rating.recipe_id, func.avg(Rating.stars), func.count(Rating.id))
        .group_by(Rating.recipe_id)
        .having(func.avg(Rating.stars) >= FORGOTTEN_MIN_STARS)
    )
    loved = {rid: (round(float(avg), 1), n) for rid, avg, n in rated.all()}
    if not loved:
        return []

    events = await _cook_events(db, date(2000, 1, 1))
    last_cooked: dict[int, date] = {}
    for rid, d in events:
        if rid not in last_cooked or d > last_cooked[rid]:
            last_cooked[rid] = d

    candidates = [
        rid for rid in loved
        if rid not in last_cooked or last_cooked[rid] < cutoff
    ]
    if not candidates:
        return []

    recipes = await db.execute(
        select(Recipe).where(Recipe.id.in_(candidates), Recipe.archived == False)  # noqa: E712
    )
    out = []
    for r in recipes.scalars().all():
        lc = last_cooked.get(r.id)
        out.append({
            "recipe_id": r.id,
            "title": r.title,
            "image_url": r.image_url,
            "image_path": r.image_path,
            "avg_stars": loved[r.id][0],
            "rating_count": loved[r.id][1],
            "last_cooked": str(lc) if lc else None,
            "days_since": (date.today() - lc).days if lc else None,
            "total_time_min": r.total_time_min,
        })
    out.sort(key=lambda x: -(x["days_since"] or 9999))
    return out
