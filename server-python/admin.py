"""Admin API: login, word CRUD, category listing, word seeding."""

from __future__ import annotations

import os
import secrets
import time
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import (
    get_all_words,
    get_categories,
    create_word,
    update_word,
    delete_word,
    seed_words_from_pool,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin")

# ---------------------------------------------------------------------------
# Auth — simple in-memory token store
# ---------------------------------------------------------------------------

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
TOKEN_EXPIRY_SECS = 86400  # 24 hours

# token -> expiry_timestamp (epoch seconds)
_tokens: dict[str, float] = {}


def _cleanup_expired_tokens() -> None:
    now = time.time()
    expired = [t for t, exp in _tokens.items() if exp < now]
    for t in expired:
        del _tokens[t]


def _verify_token(token: str) -> bool:
    _cleanup_expired_tokens()
    if token in _tokens:
        if _tokens[token] > time.time():
            return True
        del _tokens[token]
    return False


def _require_admin(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth[7:]
    if not _verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


class WordCreate(BaseModel):
    word: str
    category: str


class WordResponse(BaseModel):
    id: int
    word: str
    category: str
    created_at: str


class WordUpdate(BaseModel):
    word: str
    category: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login")
def admin_login(body: LoginRequest) -> LoginResponse:
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")
    token = secrets.token_hex(32)
    _tokens[token] = time.time() + TOKEN_EXPIRY_SECS
    logger.info("Admin logged in")
    return LoginResponse(token=token)


@router.get("/words")
def list_words(request: Request, category: str = "") -> list[WordResponse]:
    _require_admin(request)
    cat = category.strip() if category else None
    rows = get_all_words(cat)
    return [WordResponse(**r) for r in rows]


@router.post("/words")
def create_word_endpoint(request: Request, body: WordCreate) -> WordResponse:
    _require_admin(request)
    if not body.word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty")
    try:
        word_id = create_word(body.word, body.category)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Word already exists: {e}")
    import sqlite3
    conn = sqlite3.connect(os.environ.get("DB_PATH", "game.db"))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    conn.close()
    return WordResponse(**dict(row))


@router.put("/words/{word_id}")
def update_word_endpoint(request: Request, word_id: int, body: WordUpdate) -> dict:
    _require_admin(request)
    if not body.word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty")
    ok = update_word(word_id, body.word, body.category)
    if not ok:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"ok": True}


@router.delete("/words/{word_id}")
def delete_word_endpoint(request: Request, word_id: int) -> dict:
    _require_admin(request)
    ok = delete_word(word_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"ok": True}


@router.get("/categories")
def list_categories(request: Request) -> list[str]:
    _require_admin(request)
    return get_categories()


@router.post("/words/seed")
def seed_words(request: Request) -> dict:
    _require_admin(request)
    count = seed_words_from_pool()
    logger.info(f"Admin seeded {count} words from word pool")
    return {"count": count}
