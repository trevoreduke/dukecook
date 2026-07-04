"""Write planned meals to the family calendar via Home Assistant.

Complements ``ha_calendar.py`` (which only *reads* HA calendars to detect busy
nights). When a dinner is planned in DukeCook, this pushes a matching timed
event onto the household's writable Google calendar (``calendar.28582_house_calendar``)
so it shows up on everyone's phones.

HA only exposes ``calendar.create_event`` and ``calendar.get_events`` as REST
services — there is no delete/update service — so:

  * create : POST /api/services/calendar/create_event            (REST)
  * find   : GET  /api/calendars/<entity>?start=&end=            (REST, returns uid)
  * delete : {"type": "calendar/event/delete", uid=...}          (WebSocket API)

Every event we create carries a ``[dukecook#<plan_id>]`` marker in its
description, which is how we find our own events again to update or remove them.

All operations are best-effort and never raise into the caller — a meal is still
planned in DukeCook even if HA is unreachable. Callers schedule these via
``schedule()`` so the user's action returns immediately.
"""

import asyncio
import json
import logging
import ssl
from datetime import date, timedelta

import httpx

from app.config import get_settings

logger = logging.getLogger("dukecook.services.meal_calendar")

_HTTP_TIMEOUT = 10.0

# Keep references to fire-and-forget tasks so they aren't garbage collected mid-flight.
_background_tasks: set = set()


# ---------- helpers ----------

def _configured(settings) -> bool:
    if not settings.meal_calendar_sync:
        return False
    if not settings.ha_url or not settings.ha_token or not settings.ha_write_calendar:
        logger.debug("Meal calendar sync off (missing HA_URL/HA_TOKEN/HA_WRITE_CALENDAR)")
        return False
    return True


def _sync_meal_types(settings) -> set:
    return {t.strip() for t in settings.meal_calendar_meal_types.split(",") if t.strip()}


def _marker(plan_id: int) -> str:
    return f"[dukecook#{plan_id}]"


def _summary(meal_type: str, recipe_title: str) -> str:
    if meal_type and meal_type != "dinner":
        return f"🍽️ {meal_type.title()}: {recipe_title}"
    return f"🍽️ {recipe_title}"


def _headers(settings) -> dict:
    return {
        "Authorization": f"Bearer {settings.ha_token}",
        "Content-Type": "application/json",
    }


def _ws_url(ha_url: str) -> str:
    u = ha_url.rstrip("/")
    if u.startswith("https://"):
        return "wss://" + u[len("https://"):] + "/api/websocket"
    if u.startswith("http://"):
        return "ws://" + u[len("http://"):] + "/api/websocket"
    return u + "/api/websocket"


def _ssl_for(ws_url: str):
    if not ws_url.startswith("wss://"):
        return None
    # Match ha_calendar.py's lenient TLS posture (verify=False) so a self-signed
    # local HA still works; Nabu Casa's cert is valid either way.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# ---------- REST: find + create ----------

async def _find_plan_event_uids(client: httpx.AsyncClient, settings, meal_date: date, plan_id: int) -> list[str]:
    """Return the HA event uids on the write calendar carrying this plan's marker.

    Searches a small window around the date so a moved event is still found.
    """
    marker = _marker(plan_id)
    start = f"{meal_date - timedelta(days=2)}T00:00:00Z"
    end = f"{meal_date + timedelta(days=3)}T00:00:00Z"
    url = f"{settings.ha_url}/api/calendars/{settings.ha_write_calendar}"
    resp = await client.get(url, headers=_headers(settings), params={"start": start, "end": end})
    resp.raise_for_status()

    uids = []
    for ev in resp.json():
        description = ev.get("description") or ""
        if marker in description and ev.get("uid"):
            uids.append(ev["uid"])
    return uids


async def _create_event(client: httpx.AsyncClient, settings, plan_id: int, meal_date: date,
                        meal_type: str, recipe_title: str) -> None:
    payload = {
        "entity_id": settings.ha_write_calendar,
        "summary": _summary(meal_type, recipe_title),
        "description": f"{_marker(plan_id)} Planned in DukeCook · https://cook.trevorduke.com",
        "start_date_time": f"{meal_date} {settings.meal_event_start}:00",
        "end_date_time": f"{meal_date} {settings.meal_event_end}:00",
    }
    resp = await client.post(
        f"{settings.ha_url}/api/services/calendar/create_event",
        headers=_headers(settings),
        json=payload,
    )
    resp.raise_for_status()


# ---------- WebSocket: delete ----------

async def _ws_delete_events(settings, uids: list[str]) -> None:
    if not uids:
        return
    ws_url = _ws_url(settings.ha_url)
    ssl_ctx = _ssl_for(ws_url)

    import websockets  # local import so the app still boots if the dep is missing

    async with websockets.connect(ws_url, ssl=ssl_ctx, open_timeout=_HTTP_TIMEOUT,
                                  close_timeout=5) as ws:
        # Auth handshake.
        msg = json.loads(await ws.recv())
        if msg.get("type") == "auth_required":
            await ws.send(json.dumps({"type": "auth", "access_token": settings.ha_token}))
            msg = json.loads(await ws.recv())
        if msg.get("type") != "auth_ok":
            raise RuntimeError(f"HA WebSocket auth failed: {msg.get('type')}")

        mid = 0
        for uid in uids:
            mid += 1
            await ws.send(json.dumps({
                "id": mid,
                "type": "calendar/event/delete",
                "entity_id": settings.ha_write_calendar,
                "uid": uid,
            }))
            # Read frames until we get the matching result for this id.
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == mid and resp.get("type") == "result":
                    if not resp.get("success"):
                        logger.warning(f"HA WS delete failed for uid {uid}: {resp.get('error')}")
                    break


# ---------- public API ----------

async def sync_meal_event(*, plan_id: int, meal_date: date, meal_type: str, recipe_title: str) -> None:
    """Create/refresh the calendar event for a planned meal (idempotent).

    Deletes any prior event for this plan first, then creates a fresh one, so
    recipe swaps don't leave a duplicate. No-op for meal types we don't sync.
    """
    settings = get_settings()
    if not _configured(settings):
        return

    if meal_type not in _sync_meal_types(settings):
        # Meal moved off the synced types (e.g. dinner -> lunch): clean up any event.
        await remove_meal_event(plan_id=plan_id, meal_date=meal_date)
        return

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, verify=False) as client:
            existing = await _find_plan_event_uids(client, settings, meal_date, plan_id)
        await _ws_delete_events(settings, existing)
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, verify=False) as client:
            await _create_event(client, settings, plan_id, meal_date, meal_type, recipe_title)
        logger.info(f"Calendar: synced {meal_type} for plan {plan_id} on {meal_date} ({recipe_title})")
    except Exception as e:  # noqa: BLE001 — best-effort, never break meal planning
        logger.warning(f"Calendar sync failed for plan {plan_id} on {meal_date}: {e}")


async def remove_meal_event(*, plan_id: int, meal_date: date) -> None:
    """Delete the calendar event(s) for a plan (meal removed / skipped)."""
    settings = get_settings()
    if not _configured(settings):
        return
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, verify=False) as client:
            uids = await _find_plan_event_uids(client, settings, meal_date, plan_id)
        await _ws_delete_events(settings, uids)
        if uids:
            logger.info(f"Calendar: removed {len(uids)} event(s) for plan {plan_id} on {meal_date}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Calendar removal failed for plan {plan_id} on {meal_date}: {e}")


async def resync_after_update(*, plan_id: int, old_date: date, new_date: date,
                              meal_type: str, recipe_title: str, status: str) -> None:
    """Reconcile the calendar after a meal-plan edit (date/recipe/status change).

    Runs the steps sequentially inside one coroutine so remove-old then
    create-new can't race each other.
    """
    if old_date != new_date:
        await remove_meal_event(plan_id=plan_id, meal_date=old_date)
    if status == "skipped":
        await remove_meal_event(plan_id=plan_id, meal_date=new_date)
    else:
        await sync_meal_event(plan_id=plan_id, meal_date=new_date,
                              meal_type=meal_type, recipe_title=recipe_title)


def schedule(coro) -> None:
    """Fire-and-forget a calendar-sync coroutine without blocking the request."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
