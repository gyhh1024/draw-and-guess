"""FastAPI application entry point (Rust main.rs equivalent)."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from db import init_db, load_all_rooms
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

static_dir = os.getenv("STATIC_DIR", "client/dist")
static_path = Path(static_dir)
if static_path.is_dir():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")
    logger.info(f"Serving static files from {static_path.resolve()}")
else:
    logger.warning(f"Static dir not found: {static_path.resolve()} — not serving frontend")
