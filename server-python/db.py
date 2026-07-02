"""SQLite persistence layer for rooms and player sessions."""

import sqlite3
import json
import os

DB_PATH = os.environ.get("DB_PATH", "game.db")
_db_enabled = True  # set to False in tests


def disable():
    global _db_enabled
    _db_enabled = False


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            owner_id TEXT DEFAULT '',
            phase TEXT DEFAULT 'waiting',
            current_round INTEGER DEFAULT 0,
            total_rounds INTEGER DEFAULT 0,
            current_drawer_id TEXT DEFAULT '',
            word TEXT DEFAULT '',
            word_category TEXT DEFAULT '',
            seconds_left INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS players (
            id TEXT NOT NULL,
            room_id TEXT NOT NULL,
            nickname TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            has_drawn INTEGER DEFAULT 0,
            is_connected INTEGER DEFAULT 1,
            PRIMARY KEY (id, room_id),
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS word_options (
            room_id TEXT NOT NULL,
            word TEXT NOT NULL,
            category TEXT NOT NULL,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS guessed_players (
            room_id TEXT NOT NULL,
            player_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(word, category)
        );
    """)
    conn.commit()
    # Seed words from word pool if table is empty
    count = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    if count == 0:
        _seed_default_words(conn)
        conn.commit()
    conn.close()


def _seed_default_words(conn: sqlite3.Connection) -> None:
    """Seed the words table with the built-in word pool."""
    from words import WORD_POOL
    conn.executemany(
        "INSERT OR IGNORE INTO words (word, category) VALUES (?, ?)",
        WORD_POOL,
    )


# ---------------------------------------------------------------------------
# Room operations
# ---------------------------------------------------------------------------

def save_room(room) -> None:
    """Persist room state to SQLite."""
    if not _db_enabled:
        return
    from game import GamePhase
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO rooms (id, owner_id, phase, current_round,
            total_rounds, current_drawer_id, word, word_category, seconds_left)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (room.id, room.owner_id, room.phase.value, room.current_round,
          room.total_rounds, room.current_drawer_id, room.word,
          room.word_category, room.seconds_left))
    conn.commit()
    conn.close()


def save_players(room_id: str, players: list) -> None:
    """Save all players of a room."""
    if not _db_enabled:
        return
    conn = get_db()
    conn.execute("DELETE FROM players WHERE room_id = ?", (room_id,))
    for p in players:
        conn.execute("""
            INSERT INTO players (id, room_id, nickname, score, has_drawn, is_connected)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (p.id, room_id, p.nickname, p.score, int(p.has_drawn), int(p.is_connected)))
    conn.commit()
    conn.close()


def save_word_options(room_id: str, options: list[tuple[str, str]]) -> None:
    """Save current word options for a room."""
    conn = get_db()
    conn.execute("DELETE FROM word_options WHERE room_id = ?", (room_id,))
    for word, cat in options:
        conn.execute(
            "INSERT INTO word_options (room_id, word, category) VALUES (?, ?, ?)",
            (room_id, word, cat),
        )
    conn.commit()
    conn.close()


def save_guessed_players(room_id: str, guessed: dict[str, int]) -> None:
    """Save guessed players for a room."""
    conn = get_db()
    conn.execute("DELETE FROM guessed_players WHERE room_id = ?", (room_id,))
    for pid, score in guessed.items():
        conn.execute(
            "INSERT INTO guessed_players (room_id, player_id, score) VALUES (?, ?, ?)",
            (room_id, pid, score),
        )
    conn.commit()
    conn.close()


def delete_room(room_id: str) -> None:
    if not _db_enabled:
        return
    conn = get_db()
    conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
    conn.commit()
    conn.close()


def load_all_rooms(manager) -> None:
    """Load persisted rooms into a RoomManager on startup."""
    import asyncio
    from game import GamePhase, Player, Room
    conn = get_db()
    rows = conn.execute("SELECT * FROM rooms").fetchall()
    for r in rows:
        room = Room.__new__(Room)
        room.lock = asyncio.Lock()
        room.id = r["id"]
        room.owner_id = r["owner_id"]
        room.phase = GamePhase(r["phase"])
        room.current_round = r["current_round"]
        room.total_rounds = r["total_rounds"]
        room.current_drawer_id = r["current_drawer_id"]
        room.word = r["word"]
        room.word_category = r["word_category"]
        room.seconds_left = r["seconds_left"]
        room.guessed_players = {}
        room.word_options = []
        room.rankings = []
        room.round_scores = []
        room.players = []

        # Load players
        p_rows = conn.execute(
            "SELECT * FROM players WHERE room_id = ?", (room.id,)
        ).fetchall()
        for pr in p_rows:
            p = Player(pr["id"], pr["nickname"])
            p.score = pr["score"]
            p.has_drawn = bool(pr["has_drawn"])
            p.is_connected = bool(pr["is_connected"])
            room.players.append(p)

        # Load word options
        wo_rows = conn.execute(
            "SELECT * FROM word_options WHERE room_id = ?", (room.id,)
        ).fetchall()
        room.word_options = [(w["word"], w["category"]) for w in wo_rows]

        # Load guessed players
        gp_rows = conn.execute(
            "SELECT * FROM guessed_players WHERE room_id = ?", (room.id,)
        ).fetchall()
        room.guessed_players = {g["player_id"]: g["score"] for g in gp_rows}

        # Register with manager
        manager._rooms[room.id] = room
        manager._subscribers[room.id] = {}

    conn.close()
    print(f"Loaded {len(rows)} rooms from database")


# ---------------------------------------------------------------------------
# Word operations (admin)
# ---------------------------------------------------------------------------


def get_all_words(category: str | None = None) -> list[dict]:
    """Return all words, optionally filtered by category."""
    conn = get_db()
    if category:
        rows = conn.execute(
            "SELECT id, word, category, created_at FROM words WHERE category = ? ORDER BY category, word",
            (category,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, word, category, created_at FROM words ORDER BY category, word",
        ).fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return result


def get_categories() -> list[str]:
    """Return all distinct word categories."""
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT category FROM words ORDER BY category"
    ).fetchall()
    result = [r["category"] for r in rows]
    conn.close()
    return result


def create_word(word: str, category: str) -> int:
    """Create a new word, returning its ID. Raises sqlite3.IntegrityError on duplicate."""
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO words (word, category) VALUES (?, ?)",
        (word.strip(), category.strip()),
    )
    conn.commit()
    word_id = cursor.lastrowid
    conn.close()
    return word_id


def update_word(word_id: int, word: str, category: str) -> bool:
    """Update an existing word. Returns True if updated, False if not found."""
    conn = get_db()
    cursor = conn.execute(
        "UPDATE words SET word = ?, category = ? WHERE id = ?",
        (word.strip(), category.strip(), word_id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def delete_word(word_id: int) -> bool:
    """Delete a word by ID. Returns True if deleted, False if not found."""
    conn = get_db()
    cursor = conn.execute("DELETE FROM words WHERE id = ?", (word_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def seed_words_from_pool() -> int:
    """Re-seed the words table from words.py WORD_POOL. Returns count of inserted rows."""
    from words import WORD_POOL
    conn = get_db()
    conn.execute("DELETE FROM words")
    conn.executemany(
        "INSERT OR IGNORE INTO words (word, category) VALUES (?, ?)",
        WORD_POOL,
    )
    count = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    conn.commit()
    conn.close()
    return count


def get_random_words(count: int) -> list[tuple[str, str]]:
    """Return `count` random (word, category) pairs from the words table."""
    conn = get_db()
    rows = conn.execute(
        "SELECT word, category FROM words ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    conn.close()
    return [(r["word"], r["category"]) for r in rows]
