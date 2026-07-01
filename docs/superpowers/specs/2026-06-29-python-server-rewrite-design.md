# Design: Python Server Rewrite for Draw-and-Guess

**Date:** 2026-06-29
**Status:** approved

## Motivation

The existing Rust (Axum) server presents a maintenance barrier for the team. Rewriting in Python improves velocity and lowers the barrier for future contributors.

## Scope

- Rewrite `server/` (Rust) → `server-python/` (Python) with equivalent functionality
- Client (`client/`) remains unchanged — the WebSocket/HTTP protocol is the contract
- Add pytest test suite, structured logging, health check endpoint, Pydantic input validation
- Zero new runtime dependencies beyond the Python ecosystem core
- No persistence layer (rooms are in-memory, same as Rust version)

## Tech Stack

| Concern | Choice |
|---------|--------|
| Web framework | FastAPI |
| ASGI server | uvicorn |
| Data validation | Pydantic v2 |
| Async runtime | asyncio (standard library) |
| Testing | pytest + pytest-asyncio + httpx AsyncClient |
| Logging | Python `logging` + uvicorn access log |
| Deployment | systemd + uvicorn (same pattern as existing `deploy/draw-and-guess.service`) |

## Directory Structure

```
server-python/
├── requirements.txt
├── main.py              # FastAPI app, routes, lifespan events, cleanup task
├── models.py            # Pydantic v2 models (Player, Room, GameState, wire messages)
├── room_manager.py      # RoomManager: create/join/leave/broadcast/subscriber management
├── game.py              # Room class with game logic methods
├── ws_handler.py        # WebSocket lifecycle, message dispatch, timer loop
├── words.py             # Chinese word pool + random word picker
└── tests/
    ├── conftest.py
    ├── test_game.py
    ├── test_ws.py
    └── test_room.py
```

## Module Mapping (Rust → Python)

| Rust file | Python file | Notes |
|-----------|-------------|-------|
| `main.rs` (87 lines) | `main.py` | FastAPI lifespan manages cleanup task instead of manual `tokio::spawn` in `main()` |
| `types.rs` (97 lines) | `models.py` | Pydantic discriminated unions replace serde tagged enums; adds automatic input validation |
| `room.rs` (105 lines) | `room_manager.py` + `game.py` | Split: manager holds rooms/subscribers dict with `asyncio.Lock`; room game logic is methods on a plain class |
| `ws.rs` (360 lines) | `ws_handler.py` | `asyncio.create_task` + `asyncio.wait` replace `tokio::spawn` + `tokio::select!` |
| `words.rs` (27 lines) | `words.py` | Identical — copy the word pool |

## Concurrency Model

| Rust primitive | Python equivalent |
|----------------|-------------------|
| `tokio::sync::broadcast` | Per-room `dict[str, asyncio.Queue]` — iterate and `put_nowait()` to each subscriber |
| `Arc<RwLock<Room>>` | Plain object + `asyncio.Lock` (Python GC handles lifecycle) |
| `tokio::spawn` | `asyncio.create_task` |
| `tokio::select!` | `asyncio.wait(..., return_when=FIRST_COMPLETED)` |

Each WebSocket connection spawns two concurrent tasks (send/receive) and exits when either side closes.

## Message Protocol (unchanged)

JSON discriminated union, tag field `type`:

```json
{"type": "room_joined", "data": {"room_id": "ABCD", "players": [...], "is_owner": true}}
```

Pydantic models:
- `ClientMessage = JoinRoom | StartGame | SelectWord | Draw | Guess`
- `ServerMessage = RoomJoined | PlayerJoined | PlayerLeft | GameStarted | WordOptions | WordHint | DrawMessage | GuessBroadcast | CorrectGuess | TimerTick | RoundResult | GameOver | Error`

Pydantic's `TypeAdapter` or discriminated union validates and deserializes in one step.

## Game State Machine (unchanged)

```
Waiting → NewRound → Drawing → RoundResult → NewRound (next player) or GameOver
```

- Timer: 60 seconds per drawing round
- Scoring: 1st guesser = 30, 2nd = 20, rest = 10
- Round results display 5 seconds before advancing
- Each connected player draws exactly once per game

## REST Endpoints (unchanged)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rooms` | Create room, returns `{room_id, player_id}` |
| `GET` | `/api/rooms/{id}` | Check room, returns `{exists: bool}` |
| `GET` | `/ws/{room_id}` | WebSocket upgrade for real-time gameplay |

Bonus: `GET /health` → `{"status": "ok"}` (new)

## Improvements Over Rust Version

1. **pytest test suite** — covers game logic, WebSocket message flow, room lifecycle
2. **Pydantic validation** — malformed messages rejected with 422 before hitting game logic
3. **Structured logging** — request/event logs with correlation IDs
4. **Health check** — `/health` endpoint for systemd/monitoring
5. **Room cleanup with grace period** — mark rooms stale before deleting, supporting reconnection

## Deployment

Same pattern as existing `deploy/deploy.sh` — build client, copy `server-python/` + `client/dist/` to server, run with uvicorn under systemd.

Environment variables:
- `PORT` (default 3000)
- `STATIC_DIR` (default `client/dist`)
- `LOG_LEVEL` (default `info`)

## Dependencies (`requirements.txt`)

```
fastapi>=0.110
uvicorn[standard]>=0.27
pydantic>=2.0
```
