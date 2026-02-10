"""Dietary rules routes."""

import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import DietaryRule
from app.schemas import RuleCreate, RuleUpdate, RuleOut, RuleEvaluation
from app.services.rules_engine import evaluate_rules, get_rule_status_for_week

logger = logging.getLogger("dukecook.routers.rules")
router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[RuleOut])
async def list_rules(db: AsyncSession = Depends(get_db)):
    """List all dietary rules."""
    logger.info("Listing dietary rules")
    result = await db.execute(select(DietaryRule).order_by(DietaryRule.id))
    rules = result.scalars().all()
    logger.info(f"Found {len(rules)} rules ({sum(1 for r in rules if r.active)} active)")
    return rules


@router.post("", response_model=RuleOut, status_code=201)
async def create_rule(data: RuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new dietary rule."""
    logger.info(f"Creating rule: {data.name} (type={data.rule_type})", extra={
        "extra_data": {"name": data.name, "type": data.rule_type, "config": data.config}
    })

    rule = DietaryRule(
        name=data.name,
        rule_type=data.rule_type,
        config=data.config,
        active=data.active,
    )
    db.add(rule)
    await db.flush()

    logger.info(f"Rule created: {rule.name} (id={rule.id})")
    return RuleOut.model_validate(rule)


@router.put("/{rule_id}", response_model=RuleOut)
async def update_rule(rule_id: int, data: RuleUpdate, db: AsyncSession = Depends(get_db)):
    """Update a dietary rule."""
    logger.info(f"Updating rule {rule_id}")

    result = await db.execute(select(DietaryRule).where(DietaryRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if data.name is not None:
        rule.name = data.name
    if data.config is not None:
        rule.config = data.config
    if data.active is not None:
        rule.active = data.active

    await db.flush()
    logger.info(f"Rule updated: {rule.name} (id={rule.id})")
    return RuleOut.model_validate(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a dietary rule."""
    logger.info(f"Deleting rule {rule_id}")
    result = await db.execute(select(DietaryRule).where(DietaryRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()
    logger.info(f"Rule deleted: {rule.name} (id={rule_id})")


@router.post("/evaluate", response_model=list[RuleEvaluation])
async def evaluate(
    recipe_id: int = Query(...),
    plan_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate all rules against a proposed meal plan entry."""
    logger.info(f"Evaluating rules: recipe {recipe_id} on {plan_date}")
    evaluations = await evaluate_rules(db, plan_date, recipe_id)
    return [RuleEvaluation(**e) for e in evaluations]


@router.get("/status")
async def week_rule_status(
    week_start: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get rule status for an entire week."""
    logger.info(f"Getting rule status for week of {week_start}")
    statuses = await get_rule_status_for_week(db, week_start)
    return {"week_start": str(week_start), "rules": statuses}
