import { state, setState, saveSession, clearSession, onStateChange } from '../state';
import { send, on } from '../ws';
import type { PlayerInfo } from '../state';

const app = document.getElementById('app')!;
app.insertAdjacentHTML('beforeend', `
<div id="page-lobby" class="flex-center full-h">
  <div style="display:flex;max-width:600px;width:100%;background:var(--surface);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;">

    <!-- Sidebar: player list -->
    <aside style="flex:0 0 220px;border-right:1px solid var(--border);padding:20px;">
      <h3 style="margin-bottom:12px;">玩家列表</h3>
      <ul id="player-list" class="player-list"></ul>
    </aside>

    <!-- Main: room code -->
    <main style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:20px;">
      <p class="text-muted text-sm">房间号</p>
      <div id="room-code-display" class="room-code"></div>
      <p class="text-muted text-sm">把这个发给朋友，加入房间</p>
      <button id="copy-btn" class="secondary" style="min-width:140px;">复制房间号</button>
      <button id="invite-btn" class="secondary" style="min-width:140px;margin-top:8px;">复制邀请链接</button>
      <button id="exit-btn" class="danger" style="margin-top:8px;font-size:13px;">退出房间</button>
      <div style="margin-top:16px;">
        <button id="start-btn" class="success" style="min-width:160px;font-size:16px;display:none;">开始游戏</button>
        <p id="start-hint" class="text-muted text-sm" style="margin-top:4px;">至少需要 2 名玩家</p>
      </div>
    </main>

  </div>
</div>
`);

const playerList = document.getElementById('player-list')!;
const codeDisplay = document.getElementById('room-code-display')!;
const startBtn = document.getElementById('start-btn')!;
const startHint = document.getElementById('start-hint')!;
const copyBtn = document.getElementById('copy-btn')!;
const inviteBtn = document.getElementById('invite-btn')!;
const exitBtn = document.getElementById('exit-btn')!;

function renderPlayers(players: PlayerInfo[]) {
  playerList.innerHTML = players.map(p =>
    `<li class="${p.is_owner ? 'owner' : ''}">${p.is_owner ? '👑 ' : ''}${p.nickname}</li>`
  ).join('');
  startBtn.style.display = state.isOwner && players.length >= 2 ? '' : 'none';
  startHint.style.display = players.length < 2 ? '' : 'none';
}

function refreshUI() {
  codeDisplay.textContent = state.roomId || '----';
  if (state.players.length > 0) {
    renderPlayers(state.players);
  }
}

// Update UI every time we enter the lobby
onStateChange(s => {
  if (s.page === 'lobby') {
    refreshUI();
  }
});

// Handle page load directly into lobby
if (state.page === 'lobby') {
  refreshUI();
}

// WS message handlers
on('room_joined', (data: { players: PlayerInfo[]; is_owner: boolean }) => {
  setState({ players: data.players, isOwner: data.is_owner });
  saveSession();
  refreshUI();
});

on('player_joined', (data: { player: PlayerInfo }) => {
  const players = [...state.players, data.player];
  setState({ players });
  renderPlayers(players);
});

on('player_left', (data: { player_id: string }) => {
  const players = state.players.filter(p => p.id !== data.player_id);
  setState({ players });
  renderPlayers(players);
});

// game_started is handled by game.ts (loaded after this page,
// so its handler overwrites ours — game.ts includes page switch)

// Button handlers
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomId);
  copyBtn.textContent = '已复制!';
  setTimeout(() => { copyBtn.textContent = '复制房间号'; }, 1500);
});

inviteBtn.addEventListener('click', () => {
  const base = state.publicUrl || location.origin;
  const url = `${base}/?room=${state.roomId}`;
  navigator.clipboard.writeText(url);
  inviteBtn.textContent = '链接已复制!';
  setTimeout(() => { inviteBtn.textContent = '复制邀请链接'; }, 1500);
});

startBtn.addEventListener('click', () => {
  send({ type: 'start_game' });
});

exitBtn.addEventListener('click', () => {
  clearSession();
  location.reload();
});
