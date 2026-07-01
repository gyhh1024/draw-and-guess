import { setState, saveSession, loadSession } from '../state';
import { connect } from '../ws';

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
    </div>

    <p id="home-error" class="text-sm" style="color:var(--danger);margin-top:12px;display:none;"></p>
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
  setState({ nickname: nick });
  try {
    const res = await fetch('/api/rooms', { method: 'POST' });
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
