# Python Server Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Rust server in Python (FastAPI + Pydantic v2) with full test coverage, preserving all existing functionality and the wire protocol.

**Architecture:** Same module decomposition as the Rust server — models, game logic, room management, WebSocket handler, app entry point. `asyncio.Queue` per subscriber replaces `tokio::sync::broadcast`; `asyncio.Lock` per room replaces `RwLock<Room>`; `asyncio.create_task` replaces `tokio::spawn`.

**Tech Stack:** FastAPI, uvicorn, Pydantic v2, pytest + pytest-asyncio, httpx (ASGITransport), starlette TestClient (WebSocket)

---
