"""Kroger integration — OAuth callback, product matching, cart add."""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import KrogerToken, User, Recipe, RecipeIngredient, Ingredient, KrogerCartAdd
from app.services.kroger import kroger_client
from app.config import get_settings

logger = logging.getLogger("dukecook.kroger")
router = APIRouter(prefix="/api/kroger", tags=["kroger"])
settings = get_settings()

REDIRECT_URI = "https://cook.trevorduke.com/api/kroger/callback"


# ── OAuth Flow ──

@router.get("/connect")
async def kroger_connect(user_id: int = Query(...)):
    """Redirect user to Kroger OAuth login. One-time setup."""
    url = kroger_client.get_authorize_url(
        redirect_uri=REDIRECT_URI,
        state=str(user_id),
    )
    return RedirectResponse(url)


@router.get("/callback")
async def kroger_callback(
    code: str = Query(None),
    state: str = Query(""),
    error: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle Kroger OAuth callback — store tokens."""
    if error:
        logger.error(f"Kroger OAuth error: {error}")
        return RedirectResponse(f"/?kroger_error={error}")

    if not code:
        raise HTTPException(400, "Missing authorization code")

    user_id = int(state) if state.isdigit() else 1

    # Exchange code for tokens
    token_data = await kroger_client.exchange_code(code, REDIRECT_URI)

    expires_at = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 1800))

    # Upsert token
    result = await db.execute(select(KrogerToken).where(KrogerToken.user_id == user_id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.access_token = token_data["access_token"]
        existing.refresh_token = token_data["refresh_token"]
        existing.expires_at = expires_at
    else:
        db.add(KrogerToken(
            user_id=user_id,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_at=expires_at,
        ))

    await db.commit()
    logger.info(f"Kroger connected for user {user_id}")

    # Redirect back to the app with success
    return RedirectResponse("/?kroger_connected=1")


@router.get("/status")
async def kroger_status(user_id: int = Query(1), db: AsyncSession = Depends(get_db)):
    """Check if there's a valid Kroger connection.

    Household-shared: returns connected=true if ANY user has connected.
    """
    # Try this user first; fall back to any token
    result = await db.execute(select(KrogerToken).where(KrogerToken.user_id == user_id))
    token = result.scalar_one_or_none()
    shared_from = None
    if not token:
        result = await db.execute(
            select(KrogerToken).order_by(KrogerToken.expires_at.desc()).limit(1)
        )
        token = result.scalar_one_or_none()
        if token:
            shared_from = token.user_id

    if not token:
        return {"connected": False}

    expired = datetime.utcnow() > token.expires_at
    resp = {
        "connected": True,
        "expired": expired,
        "store_id": token.store_id,
        "shared_from_user_id": shared_from,
    }

    # Try to get profile email if token is valid
    if not expired:
        import httpx as httpx_mod
        try:
            async with httpx_mod.AsyncClient() as client:
                profile_resp = await client.get(
                    "https://api.kroger.com/v1/identity/profile",
                    headers={"Authorization": f"Bearer {token.access_token}", "Accept": "application/json"},
                )
                if profile_resp.status_code == 200:
                    profile = profile_resp.json().get("data", {})
                    resp["email"] = profile.get("email", "")
                    resp["first_name"] = profile.get("firstName", "")
        except Exception:
            pass

    return resp


# ── Ensure valid user token ──

async def _get_user_token(user_id: int, db: AsyncSession) -> str:
    """Get a valid Kroger access token, refreshing if needed.

    Household-shared: prefers the token bound to user_id, but falls back to ANY
    connected token so the household can share one Kroger account.
    """
    result = await db.execute(select(KrogerToken).where(KrogerToken.user_id == user_id))
    token = result.scalar_one_or_none()
    if not token:
        # Fall back to any token in the household
        result = await db.execute(
            select(KrogerToken).order_by(KrogerToken.expires_at.desc()).limit(1)
        )
        token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(401, "Kroger not connected. Please connect first.")

    # Refresh if expired
    if datetime.utcnow() > token.expires_at - timedelta(minutes=2):
        try:
            new_data = await kroger_client.refresh_user_token(token.refresh_token)
            token.access_token = new_data["access_token"]
            token.refresh_token = new_data.get("refresh_token", token.refresh_token)
            token.expires_at = datetime.utcnow() + timedelta(seconds=new_data.get("expires_in", 1800))
            await db.commit()
            logger.info(f"Refreshed Kroger token for user {user_id}")
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            raise HTTPException(401, "Kroger session expired. Please reconnect.")

    return token.access_token


# ── Product Matching ──

@router.get("/match/{recipe_id}")
async def match_recipe_ingredients(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Match all recipe ingredients to Kroger products. No user auth needed."""
    # Get recipe ingredients
    result = await db.execute(
        select(RecipeIngredient)
        .where(RecipeIngredient.recipe_id == recipe_id)
        .order_by(RecipeIngredient.sort_order)
    )
    recipe_ings = result.scalars().all()

    if not recipe_ings:
        raise HTTPException(404, "Recipe not found or has no ingredients")

    # Get ingredient names
    ing_ids = [ri.ingredient_id for ri in recipe_ings if ri.ingredient_id]
    names = []
    if ing_ids:
        result = await db.execute(select(Ingredient).where(Ingredient.id.in_(ing_ids)))
        ing_map = {i.id: i.name for i in result.scalars().all()}
    else:
        ing_map = {}

    # Build search terms — prefer ingredient name over raw_text
    search_items = []
    for ri in recipe_ings:
        name = ing_map.get(ri.ingredient_id, "") or ri.raw_text or ""
        # Clean up: strip quantities/measurements from raw_text if no ingredient name
        if not ing_map.get(ri.ingredient_id) and ri.raw_text:
            name = ri.raw_text
        search_items.append({
            "name": name,
            "quantity": ri.quantity,
            "unit": ri.unit or "",
        })

    store_id = settings.kroger_store_id
    matches = await kroger_client.match_ingredients(
        [s["name"] for s in search_items], store_id
    )

    # Merge back with quantities
    for i, m in enumerate(matches):
        if i < len(search_items):
            m["needed_quantity"] = search_items[i]["quantity"]
            m["needed_unit"] = search_items[i]["unit"]

    total_price = sum(m.get("price", 0) or 0 for m in matches if m.get("matched"))
    matched_count = sum(1 for m in matches if m.get("matched"))

    return {
        "recipe_id": recipe_id,
        "store_id": store_id,
        "matched": matched_count,
        "total": len(matches),
        "estimated_cost": round(total_price, 2),
        "items": matches,
    }


# ── Add to Cart ──

@router.post("/cart/add/{recipe_id}")
async def add_recipe_to_cart(
    recipe_id: int,
    user_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
):
    """Match recipe ingredients to Kroger products + bulk-add to Kroger cart.

    Note: items added via PUT /v1/cart/add land in the user's PICKUP/DELIVERY
    cart, NOT the in-store/savings cart at kroger.com/cart. The UI directs
    users to the delivery cart URL accordingly.
    """
    user_token = await _get_user_token(user_id, db)

    # Match ingredients to products
    match_data = await match_recipe_ingredients(recipe_id, db)
    items = match_data["items"]

    matched = [i for i in items if i.get("matched") and i.get("upc")]
    skipped = [i["ingredient"] for i in items if not (i.get("matched") and i.get("upc"))]

    if not matched:
        raise HTTPException(400, "No products matched — nothing to send to Kroger")

    # Bulk-add via Kroger API. Items appear in the Pickup/Delivery cart.
    cart_items = [{"upc": i["upc"], "quantity": 1} for i in matched]
    cart_result = await kroger_client.add_to_cart(user_token, cart_items)
    succeeded = bool(cart_result.get("success", False))

    # Audit log so we can undo this batch (or replay quantity=0 to clear later).
    log_items = [
        {"upc": i["upc"], "quantity": 1, "description": i.get("description", "")}
        for i in matched
    ]
    log_row = KrogerCartAdd(
        user_id=user_id,
        recipe_id=recipe_id,
        items=log_items,
        succeeded=succeeded,
    )
    db.add(log_row)
    await db.commit()
    await db.refresh(log_row)

    return {
        "success": True,
        "added": len(matched),
        "skipped": skipped,
        "estimated_cost": match_data["estimated_cost"],
        "message": f"Added {len(matched)} items to your Kroger pickup/delivery cart!",
        "api_cart_added": succeeded,
        "items": items,  # Each item also has product_url in case the user wants to substitute
        "batch_id": log_row.id,  # UI uses this for the Undo button
    }


# ── Undo / Clear ──

@router.get("/cart/history")
async def kroger_cart_history(
    user_id: int = Query(1),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Recent batches we've sent to Kroger. Newest first."""
    result = await db.execute(
        select(KrogerCartAdd)
        .order_by(KrogerCartAdd.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "recipe_id": r.recipe_id,
            "item_count": len(r.items or []),
            "succeeded": r.succeeded,
            "undone": r.undone,
            "undone_at": r.undone_at.isoformat() if r.undone_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "items": r.items,
        }
        for r in rows
    ]


@router.post("/cart/undo/{batch_id}")
async def kroger_cart_undo(
    batch_id: int,
    user_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
):
    """Undo a single previously-recorded cart-add batch.

    Sends each UPC with quantity 0 so it disappears from the user's
    pickup/delivery cart.
    """
    result = await db.execute(select(KrogerCartAdd).where(KrogerCartAdd.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")
    if batch.undone:
        return {"success": True, "already_undone": True, "items": len(batch.items or [])}

    user_token = await _get_user_token(user_id, db)

    # Send quantity 0 — Kroger treats this as "remove from cart"
    zero_items = [{"upc": it["upc"], "quantity": 0} for it in (batch.items or []) if it.get("upc")]
    if not zero_items:
        raise HTTPException(400, "Batch has no items to undo")

    cart_result = await kroger_client.add_to_cart(user_token, zero_items)
    if cart_result.get("success"):
        batch.undone = True
        batch.undone_at = datetime.utcnow()
        await db.commit()
        return {"success": True, "items_removed": len(zero_items), "batch_id": batch_id}

    raise HTTPException(
        500,
        f"Kroger returned status {cart_result.get('status')} on undo: {cart_result.get('body', '')[:200]}",
    )


@router.post("/cart/clear-all")
async def kroger_cart_clear_all(
    user_id: int = Query(1),
    only_not_undone: bool = Query(True, description="If true, skip batches we've already undone"),
    db: AsyncSession = Depends(get_db),
):
    """Replay quantity=0 across every UPC we've ever sent to this household's
    Kroger cart. The big-cart rescue button.
    """
    user_token = await _get_user_token(user_id, db)

    query = select(KrogerCartAdd).order_by(KrogerCartAdd.created_at)
    if only_not_undone:
        query = query.where(KrogerCartAdd.undone == False)
    result = await db.execute(query)
    batches = result.scalars().all()

    if not batches:
        return {"success": True, "batches": 0, "items_removed": 0, "message": "Nothing logged to clear"}

    # Dedup UPCs across batches — sending the same UPC twice is wasteful
    seen: set[str] = set()
    zero_items = []
    for b in batches:
        for it in (b.items or []):
            upc = it.get("upc")
            if upc and upc not in seen:
                seen.add(upc)
                zero_items.append({"upc": upc, "quantity": 0})

    if not zero_items:
        return {"success": True, "batches": len(batches), "items_removed": 0}

    # Kroger's API accepts large item lists, but be defensive — chunk by 100
    chunks_ok = 0
    chunks_fail = 0
    for i in range(0, len(zero_items), 100):
        chunk = zero_items[i : i + 100]
        cart_result = await kroger_client.add_to_cart(user_token, chunk)
        if cart_result.get("success"):
            chunks_ok += 1
        else:
            chunks_fail += 1
            logger.warning(f"clear-all chunk {i}-{i+len(chunk)} failed: {cart_result.get('body','')[:200]}")

    # Mark all batches as undone if every chunk succeeded
    if chunks_fail == 0:
        now = datetime.utcnow()
        for b in batches:
            b.undone = True
            b.undone_at = now
        await db.commit()

    return {
        "success": chunks_fail == 0,
        "batches": len(batches),
        "items_removed": len(zero_items),
        "chunks_ok": chunks_ok,
        "chunks_failed": chunks_fail,
    }


# ── Product Search (for manual lookups) ──

@router.get("/debug")
async def kroger_debug(user_id: int = Query(1), db: AsyncSession = Depends(get_db)):
    """Debug endpoint: show Kroger account info and test cart add."""
    import httpx as httpx_mod

    user_token = await _get_user_token(user_id, db)

    # Get profile
    profile = None
    async with httpx_mod.AsyncClient() as client:
        resp = await client.get(
            "https://api.kroger.com/v1/identity/profile",
            headers={"Authorization": f"Bearer {user_token}", "Accept": "application/json"},
        )
        if resp.status_code == 200:
            profile = resp.json().get("data", {})
        else:
            profile = {"error": resp.status_code, "body": resp.text[:500]}

    # Try adding a single test item (Kroger brand milk)
    cart_test = None
    async with httpx_mod.AsyncClient() as client:
        resp = await client.put(
            "https://api.kroger.com/v1/cart/add",
            json={"items": [{"upc": "0001111089305", "quantity": 1}]},
            headers={
                "Authorization": f"Bearer {user_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        cart_test = {
            "status": resp.status_code,
            "headers": dict(resp.headers),
            "body": resp.text[:500] if resp.text else "(empty)",
        }

    return {
        "profile": profile,
        "cart_test": cart_test,
        "token_scopes": "cart.basic:write product.compact",
    }


@router.get("/search")
async def search_products(
    q: str = Query(..., description="Search term"),
    limit: int = Query(5, ge=1, le=50),
):
    """Search Kroger products."""
    products = await kroger_client.search_products(
        q, settings.kroger_store_id, limit
    )
    results = []
    for p in products:
        item = p.get("items", [{}])[0] if p.get("items") else {}
        price = item.get("price", {})
        results.append({
            "upc": p["upc"],
            "description": p.get("description", ""),
            "brand": p.get("brand", ""),
            "size": item.get("size", ""),
            "price": price.get("promo") if price.get("promo", 0) > 0 else price.get("regular"),
            "on_sale": bool(price.get("promo", 0) > 0),
        })
    return results
