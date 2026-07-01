"""Room game logic (Rust game.rs equivalent).

The Room class holds all per-room state. Game logic methods mutate Room in place.
The caller (ws_handler) is responsible for acquiring room.lock before calling these.
"""

from __future__ import annotations

import asyncio
from enum import Enum

from words import pick_words
from models import ScoreEntry
from db import save_room as db_save_room

DRAW_SECS: int = 60


class GamePhase(str, Enum):
    WAITING = "waiting"
    NEW_ROUND = "new_round"
    DRAWING = "drawing"
    ROUND_RESULT = "round_result"
    GAME_OVER = "game_over"


class Player:
    __slots__ = ("id", "nickname", "score", "has_drawn", "is_connected")

    def __init__(self, id: str, nickname: str) -> None:
        self.id = id
        self.nickname = nickname
        self.score = 0
        self.has_drawn = False
        self.is_connected = True


class Room:
    """Per-room state and game logic. Protected by `lock`."""

    def __init__(self, id: str) -> None:
        self.id = id
        self.owner_id: str = ""  # set when first player joins
        self.players: list[Player] = []
        self.phase: GamePhase = GamePhase.WAITING
        self.current_round: int = 0
        self.total_rounds: int = 0
        self.current_drawer_id: str = ""

        # Phase-scoped data
        self.word: str = ""
        self.word_category: str = ""  # hint for guessers, e.g. "燕云十六声武器"
        self.word_options: list[tuple[str, str]] = []  # (word, category)
        self.guessed_players: dict[str, int] = {}  # player_id -> score earned
        self.guess_counts: dict[str, int] = {}  # player_id -> guesses used this round
        self.seconds_left: int = 0
        self.rankings: list[ScoreEntry] = []
        self.round_scores: list[ScoreEntry] = []

        self.lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    def _connected(self) -> list[Player]:
        return [p for p in self.players if p.is_connected]

    def _player_name(self, player_id: str) -> str:
        for p in self.players:
            if p.id == player_id:
                return p.nickname
        return ""

    # ------------------------------------------------------------------
    # public API (matching Rust impl Room)
    # ------------------------------------------------------------------

    def can_start(self) -> tuple[bool, str]:
        n = len(self._connected())
        if n < 2:
            return False, "至少需要2名玩家"
        if self.phase not in (GamePhase.WAITING, GamePhase.GAME_OVER):
            return False, "游戏已在进行中"
        return True, ""

    def start_game(self, rounds: int = 0) -> None:
        if self.phase == GamePhase.GAME_OVER:
            self.phase = GamePhase.WAITING
        for p in self.players:
            p.score = 0
            p.has_drawn = False
        n = len(self._connected())
        self.total_rounds = rounds if rounds > 0 else n
        self.current_round = 1
        self._go_new_round()
        db_save_room(self)

    def select_word(self, player_id: str, idx: int) -> str:
        """Returns the selected word. Raises ValueError on invalid state/input."""
        if self.phase != GamePhase.NEW_ROUND:
            raise ValueError("不在选词阶段")
        if player_id != self.current_drawer_id:
            raise ValueError("只有画手可以选词")
        if idx < 0 or idx >= len(self.word_options):
            raise ValueError("无效选项")
        word, category = self.word_options[idx]
        if not word:
            raise ValueError("无效的词")
        self.word = word
        self.word_category = category
        self.seconds_left = DRAW_SECS
        self.guessed_players.clear()
        self.guess_counts.clear()
        self.phase = GamePhase.DRAWING
        db_save_room(self)
        return word

    def submit_guess(self, player_id: str, text: str) -> int | None:
        """Returns score if correct, None if wrong/duplicate. Raises on invalid state."""
        if self.phase != GamePhase.DRAWING:
            raise ValueError("不在画画阶段")
        if player_id == self.current_drawer_id:
            raise ValueError("画手不能猜词")
        if player_id in self.guessed_players:
            return None
        # Limit to 3 guesses per player per round
        used = self.guess_counts.get(player_id, 0)
        if used >= 3:
            raise ValueError("本轮猜测次数已用完")
        self.guess_counts[player_id] = used + 1
        if text.strip().lower() != self.word.strip().lower():
            return None
        # Correct guess — score by order
        n = len(self.guessed_players)
        score = 30 if n == 0 else (20 if n == 1 else 10)
        self.guessed_players[player_id] = score
        for p in self.players:
            if p.id == player_id:
                p.score += score
                break
        return score

    def tick_timer(self) -> int | None:
        """Decrement timer. Returns new seconds_left, or None if already 0."""
        if self.phase != GamePhase.DRAWING:
            return None
        if self.seconds_left == 0:
            return None
        self.seconds_left -= 1
        return self.seconds_left

    def all_guessed(self) -> bool:
        if self.phase != GamePhase.DRAWING:
            return False
        guesser_count = sum(
            1 for p in self.players
            if p.is_connected and p.id != self.current_drawer_id
        )
        return len(self.guessed_players) >= guesser_count

    def end_round(self) -> tuple[str, list[ScoreEntry]]:
        """Transition to ROUND_RESULT. Returns (answer, scores)."""
        scores = [
            ScoreEntry(
                player_id=pid,
                player_name=self._player_name(pid),
                score=s,
            )
            for pid, s in self.guessed_players.items()
        ]
        self.round_scores = scores
        self.phase = GamePhase.ROUND_RESULT
        db_save_room(self)
        return self.word, scores

    def advance_round(self) -> GamePhase:
        """Mark drawer done, advance to next round or game over."""
        for p in self.players:
            if p.id == self.current_drawer_id:
                p.has_drawn = True
                break

        # Reset has_drawn for next rotation if all connected players have drawn
        if all(p.has_drawn for p in self._connected()):
            for p in self.players:
                p.has_drawn = False

        if self.current_round < self.total_rounds:
            self.current_round += 1
            self._go_new_round()
            return GamePhase.NEW_ROUND

        rankings = sorted(
            (
                ScoreEntry(
                    player_id=p.id,
                    player_name=p.nickname,
                    score=p.score,
                )
                for p in self.players
            ),
            key=lambda e: e.score,
            reverse=True,
        )
        self.rankings = rankings
        self.phase = GamePhase.GAME_OVER
        db_save_room(self)
        return GamePhase.GAME_OVER

    # ------------------------------------------------------------------
    # internal
    # ------------------------------------------------------------------

    def _go_new_round(self) -> None:
        drawer = next(
            (p for p in self.players if p.is_connected and not p.has_drawn),
            None,
        )
        if drawer is None:
            raise RuntimeError("no drawer available")
        self.current_drawer_id = drawer.id
        self.word_options = pick_words(3)
        self.phase = GamePhase.NEW_ROUND
        self.word = ""
