"""WebSocket connection handler, message dispatch, and drawing timer.

Rust ws.rs equivalent — handles the full WS lifecycle per connection.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import WebSocket, WebSocketDisconnect

from game import GamePhase
from models import (
    CorrectGuess,
    CorrectGuessData,
    Draw,
    DrawDataMsg,
    Error,
    ErrorData,
    GameOver,
    GameOverData,
    GameStarted,
    GameStartedData,
    Guess,
    GuessBroadcast,
    GuessBroadcastData,
    JoinRoom,
    PlayerInfo,
    PlayerJoined,
    PlayerJoinedData,
    PlayerLeft,
    PlayerLeftData,
    RoomJoined,
    RoomJoinedData,
    RoundResult,
    RoundResultData,
    RoleState,
    RoleStateData,
    SelectWord,
    StartGame,
    TimerTick,
    TimerTickData,
    WordHint,
    WordHintData,
    WordOptions,
    WordOptionsData,
    client_msg_adapter,
)
from room_manager import RoomManager

logger = logging.getLogger(__name__)


def _hint_pattern(word_len: int) -> str:
    """Build the underscore pattern string for a word of given length.

    Matches Rust: "_ ".repeat(n).trim()
    """
    return " _".join(["_"] * word_len) if word_len else ""


# =============================================================================
# Public entry point
# =============================================================================


async def handle_ws(websocket: WebSocket, room_id: str, manager: RoomManager) -> None:
    await websocket.accept()
    nickname: str

    # ---- Phase 1: wait for join_room ----
    try:
        raw = await websocket.receive_json()
    except WebSocketDisconnect:
        return

    msg = client_msg_adapter.validate_python(raw)
    if not isinstance(msg, JoinRoom):
        err = Error(data=ErrorData(message="请先加入房间"))
        await websocket.send_json(err.model_dump())
        return
    nickname = msg.data.nickname
    # Use client-provided player_id for reconnection, otherwise generate new
    player_id = msg.data.player_id or uuid.uuid4().hex
    # Per-connection ID so reconnects don't interfere with old connections
    conn_id = uuid.uuid4().hex

    # ---- Join the room ----
    try:
        is_owner, is_reconnect = await manager.join_room(room_id, player_id, nickname)
    except ValueError as e:
        err = Error(data=ErrorData(message=str(e)))
        await websocket.send_json(err.model_dump())
        return

    # ---- Build player list ----
    room = manager.get_room(room_id)
    if room is None:
        return
    async with room.lock:
        players = [
            PlayerInfo(
                id=p.id,
                nickname=p.nickname,
                score=p.score,
                is_owner=(p.id == room.owner_id),
            )
            for p in room.players
            if p.is_connected
        ]

    # ---- Send room_joined to THIS player ----
    joined = RoomJoined(data=RoomJoinedData(room_id=room_id, players=players, is_owner=is_owner))
    await websocket.send_json(joined.model_dump())

    # ---- Broadcast player_joined to OTHERS (only for new joins) ----
    if not is_reconnect:
        pj = PlayerJoined(
            data=PlayerJoinedData(
                player=PlayerInfo(id=player_id, nickname=nickname, score=0, is_owner=is_owner)
            )
        )
        await manager.broadcast(room_id, pj, exclude=player_id)

    # ---- If game is in progress, send current state to reconnecting player ----
    if is_reconnect:
        async with room.lock:
            phase = room.phase
            if phase == GamePhase.NEW_ROUND:
                total = room.total_rounds
                hint_len = len(room.word_options[0][0]) if room.word_options else 0
                cat = room.word_options[0][1] if room.word_options else ""
                await websocket.send_json(
                    GameStarted(data=GameStartedData(total_rounds=total)).model_dump()
                )
                if player_id == room.current_drawer_id:
                    await websocket.send_json(
                        WordOptions(data=WordOptionsData(words=[w for w, _ in room.word_options])).model_dump()
                    )
                await websocket.send_json(
                    WordHint(data=WordHintData(length=hint_len, pattern=_hint_pattern(hint_len), category=cat)).model_dump()
                )
            elif phase == GamePhase.DRAWING:
                total = room.total_rounds
                hint_len = len(room.word)
                is_drawer = player_id == room.current_drawer_id
                await websocket.send_json(
                    GameStarted(data=GameStartedData(total_rounds=total)).model_dump()
                )
                await websocket.send_json(
                    WordHint(data=WordHintData(length=hint_len, pattern=_hint_pattern(hint_len), category=room.word_category)).model_dump()
                )
                await websocket.send_json(
                    TimerTick(data=TimerTickData(seconds_left=room.seconds_left)).model_dump()
                )
                await websocket.send_json(
                    RoleState(
                        data=RoleStateData(
                            is_drawer=is_drawer,
                            word=room.word if is_drawer else "",
                        )
                    ).model_dump()
                )
            elif phase == GamePhase.ROUND_RESULT:
                total = room.total_rounds
                await websocket.send_json(
                    GameStarted(data=GameStartedData(total_rounds=total)).model_dump()
                )
                await websocket.send_json(
                    RoundResult(data=RoundResultData(answer=room.word, scores=room.round_scores)).model_dump()
                )
            elif phase == GamePhase.GAME_OVER:
                await websocket.send_json(
                    GameOver(data=GameOverData(rankings=room.rankings)).model_dump()
                )

    # ---- Subscribe to room broadcast (per-connection) ----
    queue = await manager.add_subscriber(room_id, player_id, conn_id)

    # ---- Phase 2: main loop (send + receive concurrent) ----
    async def forward_broadcasts() -> None:
        while True:
            msg = await queue.get()
            try:
                await websocket.send_json(msg.model_dump())
            except Exception:
                break

    async def receive_messages() -> None:
        while True:
            try:
                raw = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            try:
                cm = client_msg_adapter.validate_python(raw)
            except Exception as e:
                logger.debug(f"Invalid client message from {nickname}: {e}")
                continue
            try:
                await process_message(manager, room_id, player_id, nickname, cm)
            except Exception:
                logger.exception(f"Error processing message from {nickname}")

    send_task = asyncio.create_task(forward_broadcasts())
    recv_task = asyncio.create_task(receive_messages())

    done, pending = await asyncio.wait(
        [send_task, recv_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for t in pending:
        t.cancel()

    # ---- Cleanup ----
    await manager.remove_subscriber(room_id, conn_id)
    # Player stays "connected" — only cleanup removes truly stale rooms


# =============================================================================
# Message processing
# =============================================================================


async def process_message(
    manager: RoomManager,
    room_id: str,
    player_id: str,
    nickname: str,
    msg: ClientMessage,
) -> None:
    room = manager.get_room(room_id)
    if room is None:
        return

    # ---- StartGame ----
    if isinstance(msg, StartGame):
        async with room.lock:
            if room.owner_id != player_id:
                logger.warning(f"StartGame denied: {nickname}({player_id}) is not owner (owner={room.owner_id})")
                return
            ok, err = room.can_start()
            if not ok:
                logger.warning(f"StartGame denied: {err}")
                return
            room.start_game(rounds=0)  # 0 = auto (one round per player)
            total = room.total_rounds
            word_options = list(room.word_options)  # [(word, category), ...]
            drawer_id = room.current_drawer_id
            hint_len = len(word_options[0][0]) if word_options else 0
            # Use first word's category as hint (all 3 words share the same category)
            hint_category = word_options[0][1] if word_options else ""

        logger.info(f"Game started in room {room_id} by {nickname}, {total} rounds")
        await manager.broadcast(
            room_id, GameStarted(data=GameStartedData(total_rounds=total))
        )
        # Word options go ONLY to the drawer (guessers only see the hint)
        await manager.send_to(
            room_id, drawer_id,
            WordOptions(data=WordOptionsData(words=[w for w, _ in word_options])),
        )
        await manager.broadcast(
            room_id,
            WordHint(data=WordHintData(length=hint_len, pattern=_hint_pattern(hint_len), category=hint_category)),
        )
        return

    # ---- SelectWord ----
    if isinstance(msg, SelectWord):
        async with room.lock:
            try:
                room.select_word(player_id, msg.data.word_index)
            except ValueError as e:
                await manager.broadcast(
                    room_id, Error(data=ErrorData(message=str(e)))
                )
                return
            hint_len = len(room.word)
            hint_category = room.word_category
        await manager.broadcast(
            room_id,
            WordHint(data=WordHintData(length=hint_len, pattern=_hint_pattern(hint_len), category=hint_category)),
        )
        # Start the drawing timer as a background task
        asyncio.create_task(run_timer(manager, room_id))
        return

    # ---- Draw ----
    if isinstance(msg, Draw):
        await manager.broadcast(room_id, DrawDataMsg(data=msg.data))
        return

    # ---- Guess ----
    if isinstance(msg, Guess):
        async with room.lock:
            try:
                score = room.submit_guess(player_id, msg.data.text)
            except ValueError as e:
                await manager.broadcast(
                    room_id, Error(data=ErrorData(message=str(e)))
                )
                return
        if score is not None:
            # Correct guess
            await manager.broadcast(
                room_id,
                CorrectGuess(
                    data=CorrectGuessData(
                        player_id=player_id,
                        player_name=nickname,
                        score=score,
                    )
                ),
            )
        else:
            # Wrong guess (or already guessed) — broadcast the guess text
            await manager.broadcast(
                room_id,
                GuessBroadcast(
                    data=GuessBroadcastData(
                        player_id=player_id,
                        player_name=nickname,
                        text=msg.data.text,
                    )
                ),
            )
        return


# =============================================================================
# Drawing timer
# =============================================================================


async def run_timer(manager: RoomManager, room_id: str) -> None:
    """60-second drawing phase timer. Runs as a background task."""
    # Tick loop
    while True:
        await asyncio.sleep(1)

        room = manager.get_room(room_id)
        if room is None:
            return

        async with room.lock:
            all_done = room.all_guessed()
            secs = room.tick_timer()

        if secs is None:
            break  # time's up

        await manager.broadcast(
            room_id, TimerTick(data=TimerTickData(seconds_left=secs))
        )
        if all_done:
            break  # all guessed — end early

    # ---- End round ----
    room = manager.get_room(room_id)
    if room is None:
        return

    async with room.lock:
        answer, scores = room.end_round()

    await manager.broadcast(
        room_id,
        RoundResult(data=RoundResultData(answer=answer, scores=scores)),
    )

    # ---- 5-second pause ----
    await asyncio.sleep(5)

    # ---- Advance ----
    room = manager.get_room(room_id)
    if room is None:
        return

    async with room.lock:
        new_phase = room.advance_round()

    if new_phase == GamePhase.GAME_OVER:
        await manager.broadcast(
            room_id,
            GameOver(data=GameOverData(rankings=room.rankings)),
        )
    elif new_phase == GamePhase.NEW_ROUND:
        word_options = list(room.word_options)
        new_drawer = room.current_drawer_id
        hint_len = len(word_options[0][0]) if word_options else 0
        hint_category = word_options[0][1] if word_options else ""
        await manager.send_to(
            room_id, new_drawer,
            WordOptions(data=WordOptionsData(words=[w for w, _ in word_options])),
        )
        await manager.broadcast(
            room_id,
            WordHint(data=WordHintData(length=hint_len, pattern=_hint_pattern(hint_len), category=hint_category)),
        )
