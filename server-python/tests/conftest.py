"""Shared fixtures for server-python tests."""

import db
db.disable()

import pytest
from game import Room, Player


@pytest.fixture
def room() -> Room:
    """A room with one connected owner."""
    r = Room("TEST")
    r.players.append(Player("owner1", "Alice"))
    r.owner_id = "owner1"
    return r


@pytest.fixture
def room_with_two() -> Room:
    """A room with two connected players (Alice=owner, Bob)."""
    r = Room("TEST")
    r.players.append(Player("owner1", "Alice"))
    r.players.append(Player("player2", "Bob"))
    r.owner_id = "owner1"
    return r


@pytest.fixture
def room_with_three() -> Room:
    """A room with three players, all connected."""
    r = Room("TEST")
    r.players.append(Player("owner1", "Alice"))
    r.players.append(Player("player2", "Bob"))
    r.players.append(Player("player3", "Charlie"))
    r.owner_id = "owner1"
    return r
