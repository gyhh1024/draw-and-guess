"""Room manager: create/join/leave rooms, subscriber tracking, broadcast.

Rust room.rs equivalent — AppState with in-memory room storage and broadcast channels.
"""

from __future__ import annotations

import asyncio
import logging
import random
import string
from typing import Any

from db import save_room as db_save_room, save_players as db_save_players, delete_room as db_delete_room
from game import GamePhase, Player, Room
from models import ServerMessage

logger = logging.getLogger(__name__)


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        # room_id -> {conn_id: asyncio.Queue}
        self._subscribers: dict[str, dict[str, asyncio.Queue[Any]]] = {}
        # conn_id -> player_id mapping
        self._conn_player: dict[str, str] = {}
        # player disconnect timers: (room_id, player_id) -> asyncio.Task
        self._disconnect_timers: dict[tuple[str, str], asyncio.Task[Any]] = {}
        # Track when rooms became empty
        self._empty_since: dict[str, float] = {}

    # ------------------------------------------------------------------
    # room lifecycle
    # ------------------------------------------------------------------

    def create_room(self, password: str = "") -> str:
        """Create an empty room. The first player to join via WS becomes owner."""
        rid = self._gen_room_id()
        room = Room(rid)
        room.password = password
        self._rooms[rid] = room
        self._subscribers[rid] = {}
        db_save_room(self._rooms[rid])
        db_save_players(rid, self._rooms[rid].players)
        logger.info(f"Room {rid} created (empty, waiting for players)")
        return rid

    def get_active_rooms(self) -> list[dict]:
        """Return summaries of rooms with at least one connected player (no lock — read-only)."""
        result = []
        for rid, room in self._rooms.items():
            connected = sum(1 for p in room.players if p.is_connected)
            if connected == 0:
                continue
            owner_name = ""
            if room.owner_id:
                for p in room.players:
                    if p.id == room.owner_id:
                        owner_name = p.nickname
                        break
            result.append({
                "room_id": rid,
                "player_count": connected,
                "owner_name": owner_name,
                "has_password": bool(room.password),
                "phase": room.phase.value,
            })
        return result

    async def join_room(
        self, room_id: str, player_id: str, nickname: str, password: str = ""
    ) -> tuple[bool, bool]:
        """Returns (is_owner, is_reconnect). Raises ValueError on error."""
        room = self._rooms.get(room_id)
        if room is None:
            raise ValueError("房间不存在")

        async with room.lock:
            # Reconnect: same player ID already in room
            for p in room.players:
                if p.id == player_id:
                    p.is_connected = True
                    self.cancel_disconnect(room_id, player_id)
                    logger.info(f"Player {nickname} reconnected to room {room_id}")
                    return player_id == room.owner_id, True

            # Password check for private rooms
            if room.password and room.password != password:
                raise ValueError("密码错误")

            # New join — check duplicate nickname
            if any(p.nickname == nickname and p.is_connected for p in room.players):
                raise ValueError("昵称已被使用")
            room.players.append(Player(player_id, nickname))
            # First player to join, or original owner disconnected — become owner
            owner_connected = any(
                p.id == room.owner_id and p.is_connected
                for p in room.players
            )
            if not room.owner_id or not owner_connected:
                room.owner_id = player_id
                is_owner = True
            else:
                is_owner = False
            db_save_room(room)
            db_save_players(room_id, room.players)
            logger.info(f"Player {nickname} joined room {room_id} (owner={is_owner})")
            return is_owner, False

    async def leave_room(self, room_id: str, player_id: str) -> bool:
        """Mark player as disconnected. Returns True if broadcast should be sent."""
        room = self._rooms.get(room_id)
        if room is None:
            return False
        async with room.lock:
            if any(
                self._conn_player.get(cid) == player_id
                for cid in self._subscribers.get(room_id, {})
            ):
                return False
            for p in room.players:
                if p.id == player_id:
                    p.is_connected = False
                    db_save_room(room)
                    db_save_players(room_id, room.players)
                    return True
        return False

    async def schedule_disconnect(self, room_id: str, player_id: str, delay: int = 5) -> None:
        """Schedule delayed disconnect. Cancel if player reconnects within `delay` seconds."""
        async def _delayed():
            await asyncio.sleep(delay)
            key = (room_id, player_id)
            if key in self._disconnect_timers:
                del self._disconnect_timers[key]
                if await self.leave_room(room_id, player_id):
                    from models import PlayerLeft, PlayerLeftData
                    await self.broadcast(room_id, PlayerLeft(data=PlayerLeftData(player_id=player_id)))

        key = (room_id, player_id)
        # Cancel existing timer if any
        if key in self._disconnect_timers:
            self._disconnect_timers[key].cancel()
        self._disconnect_timers[key] = asyncio.create_task(_delayed())

    def cancel_disconnect(self, room_id: str, player_id: str) -> None:
        """Cancel pending disconnect (player reconnected)."""
        timer = self._disconnect_timers.pop((room_id, player_id), None)
        if timer:
            timer.cancel()

    def get_room(self, room_id: str) -> Room | None:
        return self._rooms.get(room_id)

    # ------------------------------------------------------------------
    # broadcast / subscribers
    # ------------------------------------------------------------------

    async def add_subscriber(
        self, room_id: str, player_id: str, conn_id: str
    ) -> asyncio.Queue[Any]:
        q: asyncio.Queue[Any] = asyncio.Queue(maxsize=256)
        if room_id not in self._subscribers:
            self._subscribers[room_id] = {}
        self._subscribers[room_id][conn_id] = q
        self._conn_player[conn_id] = player_id
        return q

    async def remove_subscriber(self, room_id: str, conn_id: str) -> None:
        subs = self._subscribers.get(room_id)
        if subs:
            subs.pop(conn_id, None)
        self._conn_player.pop(conn_id, None)

    async def send_to(self, room_id: str, player_id: str, msg: ServerMessage) -> None:
        """Send a message to a specific player (all connections)."""
        subs = self._subscribers.get(room_id, {})
        for cid, q in subs.items():
            if self._conn_player.get(cid) == player_id:
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    logger.warning(f"Queue full for {player_id} in room {room_id}")

    async def broadcast(
        self, room_id: str, msg: ServerMessage, *, exclude: str = ""
    ) -> None:
        """Push a server message to all subscribers in a room."""
        subs = self._subscribers.get(room_id, {})
        dead: list[str] = []
        for cid, q in subs.items():
            if exclude and self._conn_player.get(cid) == exclude:
                continue
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                dead.append(cid)
                logger.warning(f"Subscriber queue full for {cid} in room {room_id}")
        for cid in dead:
            await self.remove_subscriber(room_id, cid)

    # ------------------------------------------------------------------
    # cleanup
    # ------------------------------------------------------------------

    async def cleanup_stale_rooms(self) -> int:
        """Remove rooms that have had no subscribers for > 10 minutes."""
        now = asyncio.get_event_loop().time()
        stale: list[str] = []
        for rid, room in self._rooms.items():
            subs = self._subscribers.get(rid, {})
            if not subs:
                if rid not in self._empty_since:
                    self._empty_since[rid] = now
                elif now - self._empty_since[rid] > 600:  # 10 minutes
                    stale.append(rid)
            else:
                self._empty_since.pop(rid, None)
        for rid in stale:
            self._rooms.pop(rid, None)
            self._subscribers.pop(rid, None)
            self._empty_since.pop(rid, None)
            db_delete_room(rid)
            logger.info(f"Cleaned up stale room {rid}")
        return len(stale)

    # ------------------------------------------------------------------
    # internal
    # ------------------------------------------------------------------

    def _gen_room_id(self) -> str:
        while True:
            rid = "".join(random.choices(string.ascii_uppercase, k=4))
            if rid not in self._rooms:
                return rid
