"""FastAPI application entry point (Rust main.rs equivalent)."""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from db import init_db, load_all_rooms, save_drawing, get_drawings, get_drawing_categories
from admin import router as admin_router
from models import RoomCheckResponse, CreateRoomResponse, RoomSummary
from room_manager import RoomManager
from ws_handler import handle_ws

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log_level = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AppState (stores the RoomManager singleton)
# ---------------------------------------------------------------------------


class AppState:
    manager: RoomManager


# ---------------------------------------------------------------------------
# Lifespan — startup & shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    state = AppState()
    state.manager = RoomManager()
    init_db()
    load_all_rooms(state.manager)
    app.state.app_state = state

    # Background cleanup task (runs every 60s, same as Rust version)
    async def cleanup_loop() -> None:
        while True:
            await asyncio.sleep(60)
            try:
                removed = await state.manager.cleanup_stale_rooms()
                if removed:
                    logger.info(f"Cleanup removed {removed} stale rooms")
            except Exception:
                logger.exception("Cleanup task error")

    cleanup_task = asyncio.create_task(cleanup_loop())

    logger.info("Server started")
    yield

    # Shutdown
    cleanup_task.cancel()
    logger.info("Server stopped")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(title="Draw and Guess", lifespan=lifespan)


def _get_manager(request: Request) -> RoomManager:
    app_state = getattr(request.app.state, "app_state", None)
    if app_state is None:
        # Lazy-init for test environments where lifespan doesn't run
        app_state = AppState()
        app_state.manager = RoomManager()
        request.app.state.app_state = app_state
    return app_state.manager


# ---------------------------------------------------------------------------
# REST routes
# ---------------------------------------------------------------------------


@app.post("/api/rooms")
async def create_room(request: Request) -> JSONResponse:
    import uuid

    manager = _get_manager(request)
    player_id = uuid.uuid4().hex
    password = ""
    try:
        body = await request.json()
        password = body.get("password", "")
    except Exception:
        pass
    rid = manager.create_room(password=password)
    return JSONResponse(
        CreateRoomResponse(room_id=rid, player_id=player_id, has_password=bool(password)).model_dump()
    )


@app.get("/api/rooms")
async def list_rooms(request: Request) -> JSONResponse:
    manager = _get_manager(request)
    rooms = manager.get_active_rooms()
    return JSONResponse(rooms)


@app.get("/api/rooms/{room_id}")
async def check_room(room_id: str, request: Request) -> JSONResponse:
    manager = _get_manager(request)
    exists = manager.get_room(room_id) is not None
    return JSONResponse(RoomCheckResponse(exists=exists).model_dump())


@app.get("/api/config")
async def get_config() -> dict:
    return {"public_url": os.getenv("PUBLIC_URL", None)}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Drawing upload & gallery
# ---------------------------------------------------------------------------

DRAWINGS_DIR = os.environ.get("DRAWINGS_DIR", "drawings")
MAX_STORAGE_BYTES = 1024 * 1024 * 1024  # 1 GB

os.makedirs(DRAWINGS_DIR, exist_ok=True)


def _get_storage_used() -> int:
    total = 0
    for f in Path(DRAWINGS_DIR).iterdir():
        if f.is_file():
            total += f.stat().st_size
    return total


def _cleanup_oldest_invisible() -> None:
    """Delete oldest invisible drawings until storage is under 90% of limit."""
    import sqlite3
    conn = sqlite3.connect(os.environ.get("DB_PATH", "game.db"))
    conn.row_factory = sqlite3.Row
    threshold = int(MAX_STORAGE_BYTES * 0.9)
    while _get_storage_used() > threshold:
        row = conn.execute(
            "SELECT id, filename FROM drawings WHERE is_visible = 0 ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        if not row:
            break
        filepath = os.path.join(DRAWINGS_DIR, row["filename"])
        try:
            os.remove(filepath)
        except Exception:
            pass
        conn.execute("DELETE FROM drawings WHERE id = ?", (row["id"],))
        conn.commit()
    conn.close()


@app.post("/api/drawings")
async def upload_drawing(request: Request) -> JSONResponse:
    body = await request.json()
    image_b64 = body.get("image", "")
    if not image_b64:
        return JSONResponse({"error": "no image data"}, status_code=400)

    # Decode base64 data URL or raw base64
    b64_data = image_b64
    if image_b64.startswith("data:"):
        b64_data = image_b64.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(b64_data)
    except Exception:
        return JSONResponse({"error": "invalid base64"}, status_code=400)

    file_size = len(img_bytes)
    if file_size == 0:
        return JSONResponse({"error": "empty image"}, status_code=400)

    room_id = body.get("room_id", "UNKN")
    word = body.get("word", "")
    word_category = body.get("word_category", "")
    drawer_name = body.get("drawer_name", "")
    round_num = body.get("round", 1)

    # Storage check
    if _get_storage_used() + file_size > MAX_STORAGE_BYTES:
        _cleanup_oldest_invisible()
        if _get_storage_used() + file_size > MAX_STORAGE_BYTES:
            logger.warning("Drawing upload rejected: storage full")
            return JSONResponse({"error": "storage full"}, status_code=413)

    filename = f"{room_id}_{int(time.time() * 1000)}_{round_num}.png"
    filepath = os.path.join(DRAWINGS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    drawing_id = save_drawing(filename, room_id, drawer_name, word,
                              word_category, round_num, file_size)
    logger.info(f"Drawing saved: {filename} ({file_size} bytes)")
    return JSONResponse({"id": drawing_id, "filename": filename})


@app.get("/api/gallery")
async def gallery(page: int = 1, category_id: int = 0) -> JSONResponse:
    drawings, total = get_drawings(page=page, category_id=category_id, visible_only=True)
    categories = get_drawing_categories()
    return JSONResponse({
        "drawings": drawings,
        "categories": categories,
        "total": total,
    })

# Admin routes
app.include_router(admin_router)


# ---------------------------------------------------------------------------
# WebSocket route
# ---------------------------------------------------------------------------


@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str):
    manager = _get_manager_from_ws(websocket)
    await handle_ws(websocket, room_id, manager)


def _get_manager_from_ws(websocket: WebSocket) -> RoomManager:
    app_state = getattr(websocket.app.state, "app_state", None)
    if app_state is None:
        app_state = AppState()
        app_state.manager = RoomManager()
        websocket.app.state.app_state = app_state
    return app_state.manager


# ---------------------------------------------------------------------------
# Static files (production) — must be last
# ---------------------------------------------------------------------------

# Serve drawing images
drawings_dir = Path(DRAWINGS_DIR)
if not drawings_dir.is_dir():
    drawings_dir.mkdir(parents=True, exist_ok=True)
app.mount("/drawings", StaticFiles(directory=str(drawings_dir)), name="drawings")

static_dir = os.getenv("STATIC_DIR", "client/dist")
static_path = Path(static_dir)
if static_path.is_dir():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")
    logger.info(f"Serving static files from {static_path.resolve()}")
else:
    logger.warning(f"Static dir not found: {static_path.resolve()} — not serving frontend")
