import { setState, saveSession, loadSession, onStateChange } from '../state';
import { connect } from '../ws';
import type { RoomSummary } from '../state';

const app = document.getElementById('app')!;
app.insertAdjacentHTML('beforeend', `
<div id="page-home" class="flex-center" style="min-height:100vh;">
  <div class="home-card text-center">
    <div style="font-size:48px;margin-bottom:12px;">🎨</div>
    <h1 class="home-title">你画我猜</h1>
    <p class="home-subtitle">和朋友一起画画猜词</p>

    <div class="flex-col gap-12" style="text-align:left;">
      <div>
        <label class="text-sm text-muted" style="display:block;margin-bottom:6px;">你的昵称</label>
        <input id="nickname-input" type="text" placeholder="输入昵称..." maxlength="12" />
      </div>

      <div>
        <label class="text-sm text-muted" style="display:block;margin-bottom:6px;">房间类型</label>
        <div style="display:flex;gap:0;">
          <button id="toggle-public" class="toggle-btn active" style="flex:1;">公开</button>
          <button id="toggle-private" class="toggle-btn" style="flex:1;">私密</button>
        </div>
      </div>

      <div id="password-row" style="display:none;">
        <label class="text-sm text-muted" style="display:block;margin-bottom:6px;">房间密码</label>
        <input id="password-input" type="text" placeholder="设置房间密码..." maxlength="16" />
      </div>

      <button id="btn-create" class="large" style="width:100%;">创建房间</button>

      <div style="display:flex;align-items:center;gap:12px;margin:4px 0;">
        <div style="flex:1;height:1px;background:var(--border);"></div>
        <span class="text-sm text-muted">或加入已有房间</span>
        <div style="flex:1;height:1px;background:var(--border);"></div>
      </div>

      <div style="display:flex;gap:0;">
        <input id="room-code-input" type="text" placeholder="输入房间号" maxlength="4"
          style="border-radius:var(--radius-sm) 0 0 var(--radius-sm);text-transform:uppercase;font-size:16px;letter-spacing:4px;text-align:center;" />
        <button id="btn-join" class="outline" style="border-radius:0 var(--radius-sm) var(--radius-sm) 0;white-space:nowrap;border-left:none;">加入</button>
      </div>

      <div id="public-rooms-section">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="flex:1;height:1px;background:var(--border);"></div>
          <span class="text-sm text-muted">房间列表</span>
          <button id="refresh-rooms-btn" class="secondary" style="padding:4px 8px;font-size:12px;">刷新</button>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        </div>
        <div id="room-list-container"></div>
        <p id="no-rooms-msg" class="text-sm text-muted" style="text-align:center;display:none;">暂无活跃房间</p>
      </div>
    </div>

    <p id="home-error" class="text-sm" style="color:var(--danger);margin-top:12px;display:none;"></p>
  </div>

  <!-- Password modal for private rooms -->
  <div id="password-modal" class="overlay" style="display:none;">
    <div class="overlay-card">
      <h3>请输入房间密码</h3>
      <input id="modal-password-input" type="text" placeholder="输入密码..." maxlength="16" style="margin:12px 0;" />
      <div style="display:flex;gap:8px;">
        <button id="modal-password-cancel" class="secondary" style="flex:1;">取消</button>
        <button id="modal-password-confirm" style="flex:1;">确定</button>
      </div>
      <p id="modal-password-error" class="text-sm" style="color:var(--danger);margin-top:8px;display:none;"></p>
    </div>
  </div>
</div>
`);

// Logic
const nickInput = document.getElementById('nickname-input') as HTMLInputElement;
const codeInput = document.getElementById('room-code-input') as HTMLInputElement;
const errEl = document.getElementById('home-error')!;

// Auto-generate a random nickname
const randomNicks = [
  '少侠', '大侠', '剑客', '刀客', '枪神', '画师', '书生',
  '侠女', '游侠', '隐士', '琴师', '棋手', '酒仙', '墨客',
  '飞燕', '孤狼', '灵狐', '猛虎', '游龙', '惊鸿',
  '无名客', '江湖人', '闯荡者', '独行侠', '浪子', '过客',
];
function fillRandomNick() {
  nickInput.value = randomNicks[Math.floor(Math.random() * randomNicks.length)];
}

// Auto-fill room code from URL query: ?room=ABCD
const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  codeInput.value = roomFromUrl.toUpperCase();
}

// Pre-fill from saved session, otherwise use random nickname
const saved = loadSession();
if (saved?.nickname) {
  nickInput.value = saved.nickname;
} else {
  fillRandomNick();
}
if (saved?.roomId && !roomFromUrl) codeInput.value = saved.roomId;

function showError(msg: string) {
  errEl.textContent = msg;
  errEl.style.display = '';
  setTimeout(() => { errEl.style.display = 'none'; }, 3000);
}

function getNick(): string | null {
  const nick = nickInput.value.trim();
  if (!nick) { showError('请输入昵称'); return null; }
  return nick;
}

document.getElementById('btn-create')!.addEventListener('click', async () => {
  const nick = getNick();
  if (!nick) return;
  const pwd = isPublic ? '' : passwordInput.value.trim();
  if (!isPublic && !pwd) { showError('请设置房间密码'); return; }
  setState({ nickname: nick });
  try {
    const body: Record<string, string> = {};
    if (!isPublic) body.password = pwd;
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP error');
    const { room_id, player_id } = await res.json();
    setState({ roomId: room_id, playerId: player_id, isOwner: true });
    saveSession();
    await connect(room_id);
    setState({ page: 'lobby' });
  } catch {
    showError('创建房间失败，请检查服务器连接');
  }
});

document.getElementById('btn-join')!.addEventListener('click', async () => {
  const nick = getNick();
  if (!nick) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return showError('请输入房间号');
  setState({ nickname: nick, roomId: code, playerId: crypto.randomUUID() });
  saveSession();
  try {
    await connect(code);
    setState({ page: 'lobby' });
  } catch {
    showError('加入房间失败，请检查房间号是否正确');
  }
});

// ---- Public/Private toggle ----
let isPublic = true;
const passwordRow = document.getElementById('password-row')!;
const passwordInput = document.getElementById('password-input') as HTMLInputElement;
const togglePublic = document.getElementById('toggle-public')!;
const togglePrivate = document.getElementById('toggle-private')!;
togglePublic.addEventListener('click', () => {
  isPublic = true;
  passwordRow.style.display = 'none';
  togglePublic.classList.add('active');
  togglePrivate.classList.remove('active');
});
togglePrivate.addEventListener('click', () => {
  isPublic = false;
  passwordRow.style.display = '';
  togglePublic.classList.remove('active');
  togglePrivate.classList.add('active');
});

// ---- Room list ----
async function loadRoomList() {
  try {
    const res = await fetch('/api/rooms');
    const rooms: RoomSummary[] = await res.json();
    setState({ roomList: rooms });
  } catch {
    // Silently fail
  }
}

function esc(s: string): string { return s.replace(/[<>&"']/g, ''); }

let pendingJoinRoom = '';

function renderRoomList(rooms: RoomSummary[]) {
  const container = document.getElementById('room-list-container')!;
  const noRooms = document.getElementById('no-rooms-msg')!;
  if (rooms.length === 0) {
    container.innerHTML = '';
    noRooms.style.display = '';
    return;
  }
  noRooms.style.display = 'none';
  container.innerHTML = rooms.map(r => {
    const code = esc(r.room_id);
    const owner = esc(r.owner_name) || '---';
    const count = esc(String(r.player_count));
    const inGame = r.phase !== 'waiting';
    const statusTag = inGame
      ? '<span class="room-card-status">游戏中</span>'
      : '<span class="room-card-status" style="background:#d1fae5;color:var(--success);">等待中</span>';
    const lockIcon = r.has_password
      ? '<span class="room-card-lock">&#128274;</span>'
      : '';
    const joinBtn = '<button class="room-card-join secondary" data-room="' + code + '">加入</button>';
    return '<div class="room-card" data-room="' + code + '" data-password="' + (r.has_password ? '1' : '0') + '" data-ingame="' + (inGame ? '1' : '0') + '">' +
      '<div class="room-card-left">' +
        '<span class="room-card-code">' + code + '</span>' +
        lockIcon +
        '<span class="room-card-owner">' + owner + '</span>' +
        statusTag +
      '</div>' +
      '<div class="room-card-right">' +
        '<span class="room-card-count">' + count + '人</span>' +
        joinBtn +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.room-card-join:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nick = getNick();
      if (!nick) return;
      const roomId = (btn as HTMLElement).dataset.room!;
      const card = (btn as HTMLElement).closest('.room-card')!;
      const hasPassword = (card as HTMLElement).dataset.password === '1';
      if (hasPassword) {
        pendingJoinRoom = roomId;
        setState({ nickname: nick, roomId: roomId, playerId: crypto.randomUUID() });
        saveSession();
        showPasswordModal();
        return;
      }
      await doJoin(roomId, nick, '');
    });
  });

  container.querySelectorAll('.room-card').forEach(card => {
    card.addEventListener('click', () => {
      const joinBtn = card.querySelector('.room-card-join') as HTMLElement;
      if (!joinBtn.hasAttribute('disabled')) joinBtn.click();
    });
  });
}

async function doJoin(roomId: string, nick: string, password: string) {
  setState({ nickname: nick, roomId: roomId, playerId: crypto.randomUUID() });
  saveSession();
  try {
    await connect(roomId, password);
    setState({ page: 'lobby' });
  } catch (e: any) {
    showError(e.message || '加入房间失败');
  }
}

// ---- Password modal ----
const passwordModal = document.getElementById('password-modal')!;
const modalPasswordInput = document.getElementById('modal-password-input') as HTMLInputElement;
const modalPasswordError = document.getElementById('modal-password-error')!;

function showPasswordModal() {
  modalPasswordInput.value = '';
  modalPasswordError.style.display = 'none';
  passwordModal.style.display = '';
  modalPasswordInput.focus();
}

function hidePasswordModal() {
  passwordModal.style.display = 'none';
  pendingJoinRoom = '';
}

document.getElementById('modal-password-cancel')!.addEventListener('click', hidePasswordModal);

document.getElementById('modal-password-confirm')!.addEventListener('click', async () => {
  const pwd = modalPasswordInput.value.trim();
  if (!pwd) {
    modalPasswordError.textContent = '请输入密码';
    modalPasswordError.style.display = '';
    return;
  }
  hidePasswordModal();
  const nick = nickInput.value.trim();
  await doJoin(pendingJoinRoom, nick, pwd);
});

modalPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('modal-password-confirm')!.click();
});

onStateChange(s => {
  if (s.page === 'home' && s.roomList !== undefined) {
    renderRoomList(s.roomList);
  }
});

document.getElementById('refresh-rooms-btn')!.addEventListener('click', () => {
  loadRoomList();
});

loadRoomList();
