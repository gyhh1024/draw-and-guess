"""Pydantic v2 models for all wire messages (Rust types.rs equivalent).

Wire format: {"type": "<name>", "data": {...}}
Unit variants (e.g. StartGame) have no 'data' field.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


# =============================================================================
# Shared Data Models
# =============================================================================


class PlayerInfo(BaseModel):
    id: str
    nickname: str
    score: int = 0
    is_owner: bool = False


class ScoreEntry(BaseModel):
    player_id: str
    player_name: str
    score: int


class CreateRoomResponse(BaseModel):
    room_id: str
    player_id: str


class RoomCheckResponse(BaseModel):
    exists: bool


class DrawData(BaseModel):
    action: str  # "start" | "move" | "end" | "clear" | "undo"
    x: float
    y: float
    color: str
    width: float


# =============================================================================
# Client → Server Messages
# =============================================================================


class JoinRoomData(BaseModel):
    nickname: str
    player_id: str = ""  # client sends this to reconnect


class JoinRoom(BaseModel):
    type: Literal["join_room"]
    data: JoinRoomData


class StartGame(BaseModel):
    type: Literal["start_game"]


class SelectWordData(BaseModel):
    word_index: int


class SelectWord(BaseModel):
    type: Literal["select_word"]
    data: SelectWordData


class Draw(BaseModel):
    type: Literal["draw"]
    data: DrawData


class GuessData(BaseModel):
    text: str


class Guess(BaseModel):
    type: Literal["guess"]
    data: GuessData


# Discriminated union adapter for deserializing incoming client messages
client_msg_adapter: TypeAdapter = TypeAdapter(
    Annotated[
        Union[JoinRoom, StartGame, SelectWord, Draw, Guess],
        Field(discriminator="type"),
    ]
)

ClientMessage = Union[JoinRoom, StartGame, SelectWord, Draw, Guess]


# =============================================================================
# Server → Client Messages
# =============================================================================


class RoomJoinedData(BaseModel):
    room_id: str
    players: list[PlayerInfo]
    is_owner: bool


class RoomJoined(BaseModel):
    type: Literal["room_joined"] = "room_joined"
    data: RoomJoinedData


class PlayerJoinedData(BaseModel):
    player: PlayerInfo


class PlayerJoined(BaseModel):
    type: Literal["player_joined"] = "player_joined"
    data: PlayerJoinedData


class PlayerLeftData(BaseModel):
    player_id: str


class PlayerLeft(BaseModel):
    type: Literal["player_left"] = "player_left"
    data: PlayerLeftData


class GameStartedData(BaseModel):
    total_rounds: int


class GameStarted(BaseModel):
    type: Literal["game_started"] = "game_started"
    data: GameStartedData


class WordOptionsData(BaseModel):
    words: list[str]


class WordOptions(BaseModel):
    type: Literal["word_options"] = "word_options"
    data: WordOptionsData


class WordHintData(BaseModel):
    length: int
    pattern: str
    category: str = ""  # e.g. "燕云十六声武器"


class WordHint(BaseModel):
    type: Literal["word_hint"] = "word_hint"
    data: WordHintData


class DrawDataMsg(BaseModel):
    type: Literal["draw_data"] = "draw_data"
    data: DrawData


class GuessBroadcastData(BaseModel):
    player_id: str
    player_name: str
    text: str


class GuessBroadcast(BaseModel):
    type: Literal["guess_broadcast"] = "guess_broadcast"
    data: GuessBroadcastData


class CorrectGuessData(BaseModel):
    player_id: str
    player_name: str
    score: int


class CorrectGuess(BaseModel):
    type: Literal["correct_guess"] = "correct_guess"
    data: CorrectGuessData


class TimerTickData(BaseModel):
    seconds_left: int


class TimerTick(BaseModel):
    type: Literal["timer_tick"] = "timer_tick"
    data: TimerTickData


class RoleStateData(BaseModel):
    is_drawer: bool
    word: str = ""


class RoleState(BaseModel):
    type: Literal["role_state"] = "role_state"
    data: RoleStateData


class RoundResultData(BaseModel):
    answer: str
    scores: list[ScoreEntry]


class RoundResult(BaseModel):
    type: Literal["round_result"] = "round_result"
    data: RoundResultData


class GameOverData(BaseModel):
    rankings: list[ScoreEntry]


class GameOver(BaseModel):
    type: Literal["game_over"] = "game_over"
    data: GameOverData


class ErrorData(BaseModel):
    message: str


class Error(BaseModel):
    type: Literal["error"] = "error"
    data: ErrorData


ServerMessage = Union[
    RoomJoined,
    PlayerJoined,
    PlayerLeft,
    GameStarted,
    WordOptions,
    WordHint,
    DrawDataMsg,
    GuessBroadcast,
    CorrectGuess,
    TimerTick,
    RoleState,
    RoundResult,
    GameOver,
    Error,
]
