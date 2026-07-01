# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

### Client (TypeScript / Vite)

```bash
cd client && npm install && npm run dev       # dev with hot reload (proxies /api, /ws to localhost:3000)
cd client && npm run build                   # production build → client/dist/ (tsc && vite build)
```

### Server — Rust (original, kept for reference)

```bash
cd server && cargo run                       # debug
cd server && cargo build --release           # release
```

### Server — Python (FastAPI) ← primary

```bash
cd server-python && pip install -r requirements.txt
uvicorn main:app --reload --port 3000         # dev

# Production:
STATIC_DIR=../client/dist uvicorn main:app --host 0.0.0.0 --port 3000
```

Environment variables:
- `PORT` — listen port (default: `3000`)
- `STATIC_DIR` — path to client static files (default: `client/dist`)
- `LOG_LEVEL` — Python logging level (default: `info`)

### Tests

```bash
cd server-python && python -m pytest tests/ -v    # 28 game + 11 room = 39 tests
```

### Deployment

```bash
bash deploy/deploy.sh    # builds client + Rust server, packages for scp
```

## Architecture

**Draw and Guess** is a real-time multiplayer "Pictionary" game. One player draws a Chinese word on a canvas while others guess via chat.

### Communication

- **REST:** `POST /api/rooms` (create room), `GET /api/rooms/{id}` (check room exists)
- **WebSocket:** `GET /ws/{room_id}` — all real-time game communication (join, draw, guess, timer, results)

The server binary serves both the API and static files from `client/dist/` via `tower-http ServeDir`. No reverse proxy required in production.

### Game State Machine (server)

```
Waiting → NewRound → Drawing → RoundResult → NewRound (next player) or GameOver
```

- `GameState::Waiting` — players gathering in room
- `GameState::NewRound` — drawer selects from 3 random words
- `GameState::Drawing` — 60-second drawing phase with timer
- `GameState::RoundResult` — shown for 5 seconds between rounds
- `GameState::GameOver` — final rankings

Each connected player draws exactly once per game (one round per player).

### Server Code Map

**Python server (`server-python/`):**

| File | Responsibility |
|------|---------------|
| `main.py` | FastAPI app, routes, lifespan (cleanup task), static file serving |
| `models.py` | Pydantic v2 models: `PlayerInfo`, wire messages (`ClientMessage`/`ServerMessage` discriminated unions), REST responses |
| `game.py` | `Room` class: game state machine, word selection, guess scoring (30/20/10), timer, round advancement |
| `room_manager.py` | `RoomManager`: room CRUD, join/leave/reconnect, `asyncio.Queue` per subscriber for broadcast |
| `ws_handler.py` | WebSocket lifecycle, message dispatch (`process_message`), drawing timer (`run_timer`) |
| `words.py` | ~80 Chinese words in 5 categories, `pick_words(n)` |

**Rust server (`server/src/`) — kept for reference:**

| File | Responsibility |
|------|---------------|
| `main.rs` | Axum router, startup, room cleanup task |
| `types.rs` | Data models with serde tag annotations |
| `room.rs` | `AppState` (rooms + broadcast channels) |
| `game.rs` | `Room` impl: game logic |
| `ws.rs` | WebSocket lifecycle + timer |
| `words.rs` | Chinese word pool |

### Concurrency Model

**Python:** `asyncio.Lock` per room (on the `Room` object), `asyncio.Queue` per subscriber for broadcast (manual fan-out instead of `tokio::sync::broadcast`), `asyncio.create_task` for background cleanup and timer loops.

**Rust:** `RwLock<HashMap<String, Arc<RwLock<Room>>>>`, `tokio::sync::broadcast` per room, `tokio::spawn` for tasks.

### Client Code Map

| File | Responsibility |
|------|---------------|
| `client/src/main.ts` | Page router: shows/hides divs based on `state.page` |
| `client/src/state.ts` | Global `AppState` object + `setState`/`onStateChange` pub-sub (no framework) |
| `client/src/ws.ts` | WebSocket client: `connect()`, `send()`, `on()`/`off()` message handler registry |
| `client/src/canvas.ts` | `DrawingCanvas` class: pointer events, undo stack (max 50), local draw vs remote replay modes |
| `client/src/pages/home.ts` | Create/join room UI |
| `client/src/pages/lobby.ts` | Waiting room: player list, room code display, start game button |
| `client/src/pages/game.ts` | Main game: canvas, timer, chat, guess list |
| `client/src/pages/result.ts` | Final scoreboard |
| `client/src/style.css` | All styles, CSS custom properties for theming |

### WebSocket Message Protocol

Messages use tagged JSON: `{"type": "<type>", "data": {...}}`. The `ClientMessage` and `ServerMessage` enums in `server/src/types.rs` define the complete protocol with serde tag annotations. The client mirrors this structure manually in each page handler.

### Rooms & Reconnection

Room IDs are 4-letter uppercase codes (e.g., `ABCD`). Players get a UUID on connect. If a player reconnects with the same ID to the same room, they resume without re-joining. Rooms with no connected players are cleaned up every 60 seconds.

### Scoring

First guesser gets 30 points, second gets 20, all others get 10. The drawer does not score for their own round — they exclusively draw while others guess.
