"""Shopping list generator.

Generates aggregated shopping lists from meal plans.
Subtracts pantry staples, groups by aisle.
"""

import logging
from datetime import date, timedelta
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models import (
    MealPlan, Recipe, RecipeIngredient, Ingredient,
    ShoppingList, ShoppingItem, PantryStaple,
)
from app.services.ingredient_parser import clean_ingredient_name

logger = logging.getLogger("dukecook.services.shopping_generator")

# Default aisle mapping by ingredient category
CATEGORY_TO_AISLE = {
    "produce": "🥬 Produce",
    "dairy": "🥛 Dairy",
    "meat": "🥩 Meat & Seafood",
    "pantry": "🥫 Pantry",
    "spice": "🧂 Spices & Seasonings",
    "frozen": "🧊 Frozen",
    "bakery": "🍞 Bakery",
    "other": "📦 Other",
}


async def generate_shopping_list(
    db: AsyncSession,
    week_of: date,
    name: str = "",
) -> ShoppingList:
    """Generate a shopping list from all planned meals for a given week.

    1. Find all meal plans for the week
    2. Collect all ingredients
    3. Aggregate duplicates (3 recipes need onions → Onions x combined amount)
    4. Subtract pantry staples
    5. Group by aisle
    """
    week_end = week_of + timedelta(days=6)

    logger.info(
        f"Generating shopping list for week of {week_of}",
        extra={"extra_data": {"week_of": str(week_of), "week_end": str(week_end)}}
    )

    # Get planned meals
    result = await db.execute(
        select(MealPlan)
        .where(
            and_(
                MealPlan.date >= week_of,
                MealPlan.date <= week_end,
                MealPlan.status != "skipped",
            )
        )
    )
    plans = result.scalars().all()
    plan_ids = [p.id for p in plans]
    recipe_ids = [p.recipe_id for p in plans]

    logger.info(f"Found {len(plans)} planned meals for the week")

    if not plans:
        shopping_list = ShoppingList(
            name=name or f"Week of {week_of}",
            week_of=week_of,
            meal_plan_ids=plan_ids,
        )
        db.add(shopping_list)
        await db.flush()
        return shopping_list

    # Collect all ingredients from planned recipes
    aggregated = defaultdict(lambda: {"quantity": 0, "unit": "", "aisle": "📦 Other", "recipe_count": 0})

    for recipe_id in recipe_ids:
        result = await db.execute(
            select(RecipeIngredient)
            .where(RecipeIngredient.recipe_id == recipe_id)
        )
        ingredients = result.scalars().all()

        for ing in ingredients:
            # Determine the ingredient name (prefer normalized, fall back to cleaned raw text)
            ing_name = None
            aisle = "📦 Other"

            if ing.ingredient_id:
                ing_result = await db.execute(
                    select(Ingredient).where(Ingredient.id == ing.ingredient_id)
                )
                normalized = ing_result.scalar_one_or_none()
                if normalized:
                    ing_name = normalized.name
                    aisle = CATEGORY_TO_AISLE.get(normalized.category, "📦 Other")

            if not ing_name:
                ing_name = clean_ingredient_name(ing.raw_text) or (ing.raw_text or "").strip()

            if not ing_name:
                continue

            # Title-case for display, but dedup on lowercase
            display_name = ing_name if ing_name[0].isupper() else ing_name.capitalize()
            key = ing_name.lower().strip()

            aggregated[key]["name"] = display_name
            aggregated[key]["aisle"] = aisle
            aggregated[key]["recipe_count"] += 1
            if ing.quantity:
                aggregated[key]["quantity"] += ing.quantity
                if ing.unit and not aggregated[key]["unit"]:
                    aggregated[key]["unit"] = ing.unit

    logger.info(f"Aggregated {len(aggregated)} unique ingredients from {len(recipe_ids)} recipes")

    # Load pantry staples to exclude
    pantry_result = await db.execute(select(PantryStaple))
    pantry_names = {p.name.lower().strip() for p in pantry_result.scalars().all()}

    logger.info(f"Excluding {len(pantry_names)} pantry staples")

    # Create shopping list
    list_name = name or f"Week of {week_of}"
    shopping_list = ShoppingList(
        name=list_name,
        week_of=week_of,
        meal_plan_ids=plan_ids,
    )
    db.add(shopping_list)
    await db.flush()

    # Add items (excluding pantry staples)
    items_added = 0
    items_excluded = 0

    for key, data in sorted(aggregated.items(), key=lambda x: x[1]["aisle"]):
        if key in pantry_names:
            items_excluded += 1
            logger.debug(f"Excluding pantry staple: {data['name']}")
            continue

        item = ShoppingItem(
            list_id=shopping_list.id,
            name=data["name"],
            quantity=data["quantity"] if data["quantity"] > 0 else None,
            unit=data["unit"],
            aisle=data["aisle"],
        )
        db.add(item)
        items_added += 1

    await db.flush()

    logger.info(
        f"Shopping list created: {list_name} ({items_added} items, {items_excluded} excluded as staples)",
        extra={
            "extra_data": {
                "list_id": shopping_list.id,
                "items_added": items_added,
                "items_excluded": items_excluded,
                "meal_count": len(plans),
            }
        },
    )

    return shopping_list
