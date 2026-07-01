"""Unit tests for RoomManager (room_manager.py)."""

import pytest
from room_manager import RoomManager


@pytest.fixture
def manager() -> RoomManager:
    return RoomManager()


class TestCreateRoom:
    @pytest.mark.asyncio
    async def test_creates_with_4_letter_code(self, manager: RoomManager):
        rid = manager.create_room()
        assert len(rid) == 4
        assert rid.isalpha()
        assert rid.isupper()
        assert manager.get_room(rid) is not None

    @pytest.mark.asyncio
    async def test_room_starts_empty(self, manager: RoomManager):
        rid = manager.create_room()
        room = manager.get_room(rid)
        assert room is not None
        assert len(room.players) == 0
        assert room.owner_id == ""


class TestJoinRoom:
    @pytest.mark.asyncio
    async def test_first_joiner_is_owner(self, manager: RoomManager):
        rid = manager.create_room()
        is_owner, is_reconnect = await manager.join_room(rid, "player1", "Alice")
        assert is_owner
        assert not is_reconnect
        room = manager.get_room(rid)
        assert room is not None
        assert room.owner_id == "player1"
        assert len(room.players) == 1

    @pytest.mark.asyncio
    async def test_second_joiner_not_owner(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "player1", "Alice")
        is_owner, is_reconnect = await manager.join_room(rid, "player2", "Bob")
        assert not is_owner
        assert not is_reconnect
        room = manager.get_room(rid)
        assert room is not None
        assert len(room.players) == 2

    @pytest.mark.asyncio
    async def test_room_not_found_raises(self, manager: RoomManager):
        with pytest.raises(ValueError, match="房间不存在"):
            await manager.join_room("XXXX", "p1", "Alice")

    @pytest.mark.asyncio
    async def test_reconnect_restores_connection(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "owner1", "Alice")
        # Disconnect
        await manager.leave_room(rid, "owner1")
        room = manager.get_room(rid)
        assert room is not None
        assert not room.players[0].is_connected

        # Reconnect
        await manager.join_room(rid, "owner1", "Alice")
        assert room.players[0].is_connected


class TestLeaveRoom:
    @pytest.mark.asyncio
    async def test_marks_disconnected(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "owner1", "Alice")
        await manager.leave_room(rid, "owner1")
        room = manager.get_room(rid)
        assert room is not None
        assert not room.players[0].is_connected


class TestBroadcast:
    @pytest.mark.asyncio
    async def test_broadcast_to_subscribers(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "p1", "Alice")
        q = await manager.add_subscriber(rid, "p1", "conn1")

        from models import Error, ErrorData
        msg = Error(data=ErrorData(message="test"))
        await manager.broadcast(rid, msg)

        received = q.get_nowait()
        assert received.type == "error"
        assert received.data.message == "test"

    @pytest.mark.asyncio
    async def test_broadcast_excludes_player(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "p1", "Alice")
        await manager.join_room(rid, "p2", "Bob")
        q1 = await manager.add_subscriber(rid, "p1", "conn1")
        q2 = await manager.add_subscriber(rid, "p2", "conn2")

        from models import Error, ErrorData
        msg = Error(data=ErrorData(message="test"))
        await manager.broadcast(rid, msg, exclude="p1")

        # p2 gets it
        received = q2.get_nowait()
        assert received.data.message == "test"
        # p1 should not get it
        assert q1.empty()


class TestCleanup:
    @pytest.mark.asyncio
    async def test_removes_empty_room(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "p1", "Alice")
        await manager.leave_room(rid, "p1")
        # Mark room as empty for > 10 minutes
        manager._empty_since[rid] = 0

        removed = await manager.cleanup_stale_rooms()
        assert removed == 1
        assert manager.get_room(rid) is None

    @pytest.mark.asyncio
    async def test_keeps_active_room(self, manager: RoomManager):
        rid = manager.create_room()
        await manager.join_room(rid, "p1", "Alice")
        await manager.add_subscriber(rid, "p1", "conn1")  # active subscriber

        removed = await manager.cleanup_stale_rooms()
        assert removed == 0
        assert manager.get_room(rid) is not None
