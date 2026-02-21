"""Guest Menus — shareable themed menu pages with guest voting."""

import hashlib
import re
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import get_db
from app.models import GuestMenu, GuestMenuItem, GuestVote, MenuView, RecipePhoto, Recipe, RecipeIngredient, RecipeStep, User
from app.schemas import (
    GuestMenuCreate, GuestMenuUpdate, GuestMenuOut, GuestMenuSummary,
    GuestMenuItemOut, GuestVoteCreate, GuestMenuResults, GuestVoteTally,
    VoterDetail, IngredientOut, StepOut,
)
from app.services.theme_generator import generate_menu_theme

logger = logging.getLogger("dukecook.routers.guest_menus")

router = APIRouter(prefix="/api/guest-menus", tags=["guest-menus"])


# ---------- Helpers ----------

def normalize_slug(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    return slug


def validate_slug(slug: str) -> str:
    """Validate and normalize a slug. Raises HTTPException if invalid."""
    slug = normalize_slug(slug)
    if len(slug) < 3:
        raise HTTPException(status_code=400, detail="Slug must be at least 3 characters")
    if len(slug) > 100:
        raise HTTPException(status_code=400, detail="Slug must be 100 characters or fewer")
    return slug


def recipe_to_menu_item(recipe, ingredients, steps, subtext="") -> dict:
    """Convert a Recipe + its ingredients/steps to a GuestMenuItemOut dict."""
    return {
        "recipe_id": recipe.id,
        "title": recipe.title,
        "description": recipe.description or "",
        "subtext": subtext,
        "image_path": recipe.image_path or "",
        "image_url": recipe.image_url or "",
        "prep_time_min": recipe.prep_time_min,
        "cook_time_min": recipe.cook_time_min,
        "servings": recipe.servings or 4,
        "cuisine": recipe.cuisine or "",
        "difficulty": recipe.difficulty or "",
        "notes": recipe.notes or "",
        "ingredients": [
            IngredientOut(
                id=ing.id,
                raw_text=ing.raw_text,
                quantity=ing.quantity,
                unit=ing.unit or "",
                preparation=ing.preparation or "",
                group_name=ing.group_name or "",
            ) for ing in ingredients
        ],
        "steps": [
            StepOut(
                id=s.id,
                step_number=s.step_number,
                instruction=s.instruction,
                duration_minutes=s.duration_minutes,
                timer_label=s.timer_label or "",
            ) for s in steps
        ],
    }


async def build_menu_out(menu: GuestMenu, db: AsyncSession) -> dict:
    """Build a full GuestMenuOut dict for a menu."""
    # Load recipes with ingredients and steps
    items_out = []
    for item in menu.items:
        recipe = item.recipe
        if not recipe:
            continue
        # Load ingredients and steps
        ing_result = await db.execute(
            select(RecipeIngredient)
            .where(RecipeIngredient.recipe_id == recipe.id)
            .order_by(RecipeIngredient.sort_order)
        )
        ingredients = ing_result.scalars().all()

        step_result = await db.execute(
            select(RecipeStep)
            .where(RecipeStep.recipe_id == recipe.id)
            .order_by(RecipeStep.step_number)
        )
        steps = step_result.scalars().all()

        items_out.append(recipe_to_menu_item(recipe, ingredients, steps, subtext=item.subtext or ""))

    # Look up host name from creating user
    host_name = ""
    if menu.created_by:
        user = await db.scalar(select(User).where(User.id == menu.created_by))
        if user:
            host_name = user.name

    # Count votes and unique guests
    vote_count = await db.scalar(
        select(func.count(GuestVote.id)).where(GuestVote.menu_id == menu.id)
    ) or 0
    guest_count = await db.scalar(
        select(func.count(func.distinct(GuestVote.guest_name))).where(GuestVote.menu_id == menu.id)
    ) or 0

    return {
        "id": menu.id,
        "title": menu.title,
        "slug": menu.slug,
        "theme_prompt": menu.theme_prompt or "",
        "theme": menu.theme or {},
        "active": menu.active,
        "created_by": menu.created_by,
        "host_name": host_name,
        "items": items_out,
        "vote_count": vote_count,
        "guest_count": guest_count,
        "created_at": menu.created_at,
    }


# ---------- Admin Endpoints ----------

@router.post("", response_model=GuestMenuOut)
async def create_guest_menu(
    data: GuestMenuCreate,
    user_id: int = Query(default=1),
    db: AsyncSession = Depends(get_db),
):
    """Create a new guest menu with AI-generated theme."""
    slug = validate_slug(data.slug or data.title)

    # Check slug uniqueness
    existing = await db.scalar(select(GuestMenu.id).where(GuestMenu.slug == slug))
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug '{slug}' is already taken")

    # Validate recipes exist
    if len(data.recipe_ids) < 1:
        raise HTTPException(status_code=400, detail="At least 1 recipe is required")

    result = await db.execute(
        select(Recipe).where(Recipe.id.in_(data.recipe_ids))
    )
    recipes = result.scalars().all()
    recipe_map = {r.id: r for r in recipes}

    missing = set(data.recipe_ids) - set(recipe_map.keys())
    if missing:
        raise HTTPException(status_code=404, detail=f"Recipes not found: {missing}")

    # Generate AI theme
    recipe_titles = [recipe_map[rid].title for rid in data.recipe_ids]
    theme = await generate_menu_theme(data.theme_prompt, data.title, recipe_titles)

    # Create menu
    menu = GuestMenu(
        title=data.title,
        slug=slug,
        theme_prompt=data.theme_prompt or "",
        theme=theme or {},
        created_by=user_id,
    )
    db.add(menu)
    await db.flush()

    # Add menu items
    for i, recipe_id in enumerate(data.recipe_ids):
        db.add(GuestMenuItem(menu_id=menu.id, recipe_id=recipe_id, sort_order=i))
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu.id)
    )
    menu = result.scalar_one()

    logger.info(f"Created guest menu: {menu.title} (slug={menu.slug})", extra={
        "extra_data": {"menu_id": menu.id, "slug": menu.slug, "recipe_count": len(data.recipe_ids)}
    })

    return await build_menu_out(menu, db)


@router.get("", response_model=list[GuestMenuSummary])
async def list_guest_menus(db: AsyncSession = Depends(get_db)):
    """List all guest menus."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items))
        .order_by(GuestMenu.created_at.desc())
    )
    menus = result.scalars().all()

    out = []
    for menu in menus:
        vote_count = await db.scalar(
            select(func.count(GuestVote.id)).where(GuestVote.menu_id == menu.id)
        ) or 0
        guest_count = await db.scalar(
            select(func.count(func.distinct(GuestVote.guest_name))).where(GuestVote.menu_id == menu.id)
        ) or 0
        out.append({
            "id": menu.id,
            "title": menu.title,
            "slug": menu.slug,
            "active": menu.active,
            "item_count": len(menu.items),
            "vote_count": vote_count,
            "guest_count": guest_count,
            "created_at": menu.created_at,
        })

    return out


@router.get("/check-slug/{slug}")
async def check_slug(slug: str, db: AsyncSession = Depends(get_db)):
    """Check if a slug is available."""
    normalized = normalize_slug(slug)
    existing = await db.scalar(select(GuestMenu.id).where(GuestMenu.slug == normalized))
    return {"available": existing is None, "normalized": normalized}


@router.get("/{menu_id}", response_model=GuestMenuOut)
async def get_guest_menu(menu_id: int, db: AsyncSession = Depends(get_db)):
    """Get a guest menu with full details."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu_id)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    return await build_menu_out(menu, db)


@router.put("/{menu_id}", response_model=GuestMenuOut)
async def update_guest_menu(
    menu_id: int,
    data: GuestMenuUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a guest menu."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu_id)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    if data.title is not None:
        menu.title = data.title
    if data.slug is not None:
        new_slug = validate_slug(data.slug)
        if new_slug != menu.slug:
            existing = await db.scalar(select(GuestMenu.id).where(GuestMenu.slug == new_slug))
            if existing:
                raise HTTPException(status_code=409, detail=f"Slug '{new_slug}' is already taken")
            menu.slug = new_slug
    if data.active is not None:
        menu.active = data.active
    if data.theme is not None:
        # Merge partial theme overrides into existing theme
        merged = dict(menu.theme or {})
        merged.update(data.theme)
        menu.theme = merged

    if data.recipe_ids is not None:
        # Validate recipes
        result = await db.execute(select(Recipe).where(Recipe.id.in_(data.recipe_ids)))
        recipes = result.scalars().all()
        recipe_map = {r.id: r for r in recipes}
        missing = set(data.recipe_ids) - set(recipe_map.keys())
        if missing:
            raise HTTPException(status_code=404, detail=f"Recipes not found: {missing}")

        # Replace items (preserve subtexts from existing items)
        existing_subtexts = {item.recipe_id: item.subtext or "" for item in menu.items}
        await db.execute(delete(GuestMenuItem).where(GuestMenuItem.menu_id == menu.id))
        for i, recipe_id in enumerate(data.recipe_ids):
            db.add(GuestMenuItem(
                menu_id=menu.id, recipe_id=recipe_id, sort_order=i,
                subtext=existing_subtexts.get(recipe_id, ""),
            ))

    # Update subtexts on existing items (without replacing recipe list)
    if data.subtexts is not None and data.recipe_ids is None:
        for item in menu.items:
            if item.recipe_id in data.subtexts:
                item.subtext = data.subtexts[item.recipe_id]

    await db.flush()

    # Reload
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu.id)
    )
    menu = result.scalar_one()

    logger.info(f"Updated guest menu: {menu.title}", extra={"extra_data": {"menu_id": menu.id}})
    return await build_menu_out(menu, db)


@router.delete("/{menu_id}")
async def delete_guest_menu(menu_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a guest menu and all its items/votes."""
    result = await db.execute(select(GuestMenu).where(GuestMenu.id == menu_id))
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    await db.delete(menu)
    logger.info(f"Deleted guest menu: {menu.title}", extra={"extra_data": {"menu_id": menu.id}})
    return {"ok": True}


@router.post("/{menu_id}/regenerate-theme", response_model=GuestMenuOut)
async def regenerate_theme(
    menu_id: int,
    new_prompt: str = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate the AI theme for a menu."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu_id)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    if new_prompt is not None:
        menu.theme_prompt = new_prompt

    recipe_titles = [item.recipe.title for item in menu.items if item.recipe]
    theme = await generate_menu_theme(menu.theme_prompt, menu.title, recipe_titles)
    if theme:
        menu.theme = theme

    await db.flush()
    logger.info(f"Regenerated theme for: {menu.title}", extra={"extra_data": {"menu_id": menu.id}})
    return await build_menu_out(menu, db)


@router.get("/{menu_id}/results", response_model=GuestMenuResults)
async def get_menu_results(menu_id: int, db: AsyncSession = Depends(get_db)):
    """Get vote tally for a menu."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.id == menu_id)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Build tally per recipe
    tally = []
    for item in menu.items:
        if not item.recipe:
            continue
        votes = await db.execute(
            select(GuestVote)
            .where(GuestVote.menu_id == menu.id, GuestVote.recipe_id == item.recipe_id)
        )
        vote_list = votes.scalars().all()
        tally.append(GuestVoteTally(
            recipe_id=item.recipe_id,
            recipe_title=item.recipe.title,
            vote_count=len(vote_list),
            voters=[v.guest_name for v in vote_list],
            voter_details=[
                VoterDetail(guest_name=v.guest_name, comment=v.comment or "")
                for v in vote_list
            ],
        ))

    # Sort by vote count descending
    tally.sort(key=lambda t: t.vote_count, reverse=True)

    total_guests = await db.scalar(
        select(func.count(func.distinct(GuestVote.guest_name))).where(GuestVote.menu_id == menu.id)
    ) or 0

    return GuestMenuResults(
        menu_id=menu.id,
        title=menu.title,
        total_guests=total_guests,
        tally=tally,
    )


# ---------- Public Endpoints (no auth) ----------

@router.get("/public/{slug}")
async def get_public_menu(slug: str, db: AsyncSession = Depends(get_db)):
    """Get full menu data for the public guest page."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items).selectinload(GuestMenuItem.recipe))
        .where(GuestMenu.slug == slug)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    if not menu.active:
        raise HTTPException(status_code=410, detail="This menu is no longer active")

    return await build_menu_out(menu, db)


@router.post("/public/{slug}/vote")
async def submit_guest_vote(
    slug: str,
    data: GuestVoteCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit or update votes for a guest. Upserts: replaces all votes for this guest name."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items))
        .where(GuestMenu.slug == slug)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    if not menu.active:
        raise HTTPException(status_code=410, detail="This menu is no longer active")

    # Validate recipe_ids are on this menu
    menu_recipe_ids = {item.recipe_id for item in menu.items}
    invalid = set(data.recipe_ids) - menu_recipe_ids
    if invalid:
        raise HTTPException(status_code=400, detail=f"Recipes not on this menu: {invalid}")

    guest_name = data.guest_name.strip()

    # Delete existing votes for this guest on this menu
    await db.execute(
        delete(GuestVote).where(
            GuestVote.menu_id == menu.id,
            GuestVote.guest_name == guest_name,
        )
    )

    # Insert new votes
    for recipe_id in data.recipe_ids:
        comment = (data.comments or {}).get(recipe_id, "").strip()
        db.add(GuestVote(
            menu_id=menu.id,
            recipe_id=recipe_id,
            guest_name=guest_name,
            comment=comment,
        ))

    await db.flush()

    logger.info(f"Guest '{guest_name}' voted on menu '{menu.title}'", extra={
        "extra_data": {"menu_id": menu.id, "guest": guest_name, "votes": len(data.recipe_ids)}
    })

    return {"ok": True, "votes": len(data.recipe_ids)}


@router.get("/public/{slug}/votes/{guest_name}")
async def get_guest_votes(
    slug: str,
    guest_name: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a guest's existing votes for pre-selecting on return visit."""
    result = await db.execute(
        select(GuestMenu).where(GuestMenu.slug == slug)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    votes = await db.execute(
        select(GuestVote).where(
            GuestVote.menu_id == menu.id,
            GuestVote.guest_name == guest_name,
        )
    )
    vote_rows = votes.scalars().all()
    recipe_ids = [v.recipe_id for v in vote_rows]
    comments = {v.recipe_id: v.comment for v in vote_rows if v.comment}

    return {"guest_name": guest_name, "recipe_ids": recipe_ids, "comments": comments}


@router.post("/public/{slug}/view")
async def track_menu_view(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Track a page view for analytics. Fire-and-forget from the client."""
    result = await db.execute(
        select(GuestMenu.id).where(GuestMenu.slug == slug)
    )
    menu_id = result.scalar_one_or_none()
    if not menu_id:
        return {"ok": True}  # Don't error on tracking — just silently skip

    # Get IP from X-Forwarded-For (nginx) or direct connection
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")

    db.add(MenuView(
        menu_id=menu_id,
        ip_address=ip,
        user_agent=request.headers.get("user-agent", "")[:500],
        referrer=request.headers.get("referer", "")[:500],
    ))
    return {"ok": True}


@router.get("/{menu_id}/views")
async def get_menu_views(
    menu_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get view analytics for a menu."""
    result = await db.execute(select(GuestMenu).where(GuestMenu.id == menu_id))
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Total views
    total = await db.scalar(
        select(func.count(MenuView.id)).where(MenuView.menu_id == menu_id)
    ) or 0

    # Unique IPs
    unique_ips = await db.scalar(
        select(func.count(func.distinct(MenuView.ip_address)))
        .where(MenuView.menu_id == menu_id)
        .where(MenuView.ip_address != "")
    ) or 0

    # Recent views with details
    recent_result = await db.execute(
        select(MenuView)
        .where(MenuView.menu_id == menu_id)
        .order_by(MenuView.viewed_at.desc())
        .limit(50)
    )
    recent = recent_result.scalars().all()

    return {
        "menu_id": menu_id,
        "total_views": total,
        "unique_visitors": unique_ips,
        "views": [
            {
                "ip": v.ip_address,
                "user_agent": v.user_agent,
                "referrer": v.referrer,
                "viewed_at": v.viewed_at.isoformat() if v.viewed_at else None,
            }
            for v in recent
        ],
    }


# ---------- Guest Photo Uploads ----------

@router.post("/public/{slug}/photos")
async def upload_guest_photo(
    slug: str,
    file: UploadFile = File(...),
    recipe_id: int = Form(...),
    guest_name: str = Form(""),
    caption: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    """Guest uploads a photo for a recipe on this menu."""
    result = await db.execute(
        select(GuestMenu)
        .options(selectinload(GuestMenu.items))
        .where(GuestMenu.slug == slug)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Validate recipe is on this menu
    menu_recipe_ids = {item.recipe_id for item in menu.items}
    if recipe_id not in menu_recipe_ids:
        raise HTTPException(status_code=400, detail="Recipe not on this menu")

    # Validate file
    content_type = file.content_type or "image/jpeg"
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {content_type}")

    image_data = await file.read()
    if len(image_data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Max 20MB.")

    # Save file
    settings = get_settings()
    image_dir = Path(settings.image_dir)
    image_dir.mkdir(parents=True, exist_ok=True)

    file_hash = hashlib.md5(image_data).hexdigest()[:12]
    ext = ".jpg" if "jpeg" in content_type or "jpg" in content_type or "heic" in content_type else (
        ".png" if "png" in content_type else ".webp"
    )
    filename = f"guest_{menu.id}_{recipe_id}_{file_hash}{ext}"
    (image_dir / filename).write_bytes(image_data)

    photo = RecipePhoto(
        recipe_id=recipe_id,
        menu_id=menu.id,
        guest_name=guest_name.strip()[:200],
        image_path=f"/images/{filename}",
        caption=caption.strip()[:500],
    )
    db.add(photo)
    await db.flush()

    logger.info(f"Guest photo uploaded: recipe={recipe_id}, menu={menu.slug}, guest={guest_name}")
    return {
        "id": photo.id,
        "image_path": photo.image_path,
        "recipe_id": recipe_id,
        "guest_name": photo.guest_name,
    }


@router.get("/public/{slug}/photos")
async def get_menu_photos(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all photos uploaded for recipes on this menu."""
    result = await db.execute(
        select(GuestMenu).where(GuestMenu.slug == slug)
    )
    menu = result.scalar_one_or_none()
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    photos_result = await db.execute(
        select(RecipePhoto)
        .where(RecipePhoto.menu_id == menu.id)
        .order_by(RecipePhoto.created_at.desc())
    )
    photos = photos_result.scalars().all()

    return [
        {
            "id": p.id,
            "recipe_id": p.recipe_id,
            "image_path": p.image_path,
            "guest_name": p.guest_name,
            "caption": p.caption,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in photos
    ]


@router.get("/{menu_id}/photos")
async def get_menu_photos_admin(
    menu_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Admin view: all photos for a menu event."""
    photos_result = await db.execute(
        select(RecipePhoto)
        .options(selectinload(RecipePhoto.recipe))
        .where(RecipePhoto.menu_id == menu_id)
        .order_by(RecipePhoto.created_at.desc())
    )
    photos = photos_result.scalars().all()

    return [
        {
            "id": p.id,
            "recipe_id": p.recipe_id,
            "recipe_title": p.recipe.title if p.recipe else "",
            "image_path": p.image_path,
            "guest_name": p.guest_name,
            "caption": p.caption,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in photos
    ]
