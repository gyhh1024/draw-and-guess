import { state, setState, clearSession } from '../state';
import { send, on } from '../ws';
import { DrawingCanvas, DrawData } from '../canvas';

const app = document.getElementById('app')!;

// Inject HTML structure
app.insertAdjacentHTML('beforeend', `
<div id="page-game" class="game-layout">
  <!-- Main: canvas + toolbar -->
  <div class="game-main">
    <div id="canvas-container" class="canvas-container" style="flex:1;"></div>
    <div id="toolbar" class="toolbar">
      <button id="tool-pen" style="background:var(--text);" title="画笔">🖊</button>
      <button id="tool-eraser" class="secondary" title="橡皮">🧹</button>
      <button id="tool-clear" class="danger" title="清空">🗑</button>
      <button id="tool-undo" class="secondary" title="撤销">↩</button>
      <span style="margin-left:8px;">颜色:</span>
      ${['#000000','#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#ffffff'].map(c =>
        `<button class="color-btn" data-color="${c}" style="background:${c};${c==='#ffffff'?'border:1px solid #ddd;':''}"></button>`
      ).join('')}
      <span style="margin-left:8px;">粗细:</span>
      <input id="brush-width" type="range" min="1" max="20" value="3" />
      <span id="width-label" style="font-size:13px;min-width:20px;">3</span>
    </div>
  </div>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="timer" id="timer-display">60</div>
    <div class="hint" id="hint-display">等待画手选词...</div>
    <div class="score-header">玩家</div>
    <div class="score-list" id="score-list"></div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input" id="chat-input">
      <input id="guess-input" type="text" placeholder="输入你的猜测..." maxlength="20" />
      <button id="send-guess-btn">发送</button>
      <span id="guesses-left" style="font-size:12px;color:var(--text-muted);min-width:50px;text-align:right;"></span>
    </div>
  </aside>

  <!-- Word selection overlay (shown only for drawer) -->
  <div id="word-overlay" class="overlay" style="display:none;">
    <div class="overlay-card">
      <h3>选择一个词来画</h3>
      <div id="word-options-container" class="word-options"></div>
    </div>
  </div>

  <!-- Round result overlay -->
  <div id="round-result-overlay" class="overlay" style="display:none;">
    <div class="overlay-card">
      <h3 id="round-result-answer"></h3>
      <ul id="round-result-scores" class="ranking-list"></ul>
    </div>
  </div>
</div>
`);

// Canvas setup
const container = document.getElementById('canvas-container')!;
const canvas = new DrawingCanvas(container, (data: DrawData) => {
  send({ type: 'draw', data });
});
canvas.setReadOnly(true); // initially read-only until we know our role

// Toolbar state
let currentColor = '#000000';
let currentWidth = 3;

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = (btn as HTMLElement).dataset.color!;
    canvas.setColor(currentColor);
    // Update tool buttons: pen active, eraser inactive
    document.getElementById('tool-pen')!.style.background = 'var(--text)';
    document.getElementById('tool-eraser')!.style.background = '';
  });
});
// Default: first color (black) is active
(document.querySelector('.color-btn[data-color="#000000"]') as HTMLElement)?.classList.add('active');

const widthInput = document.getElementById('brush-width') as HTMLInputElement;
const widthLabel = document.getElementById('width-label')!;
widthInput.addEventListener('input', () => {
  currentWidth = parseInt(widthInput.value);
  widthLabel.textContent = String(currentWidth);
  canvas.setWidth(currentWidth);
});

document.getElementById('tool-pen')!.addEventListener('click', () => {
  canvas.setColor(currentColor);
});
document.getElementById('tool-eraser')!.addEventListener('click', () => {
  canvas.setColor('#ffffff');
  canvas.setWidth(20);
});
document.getElementById('tool-clear')!.addEventListener('click', () => {
  canvas.clear();
  send({ type: 'draw', data: { action: 'clear', x: 0, y: 0, color: '', width: 0 } });
});
document.getElementById('tool-undo')!.addEventListener('click', () => {
  canvas.undo();
  send({ type: 'draw', data: { action: 'undo', x: 0, y: 0, color: '', width: 0 } });
});

// Chat
const chatMessages = document.getElementById('chat-messages')!;
const guessInput = document.getElementById('guess-input') as HTMLInputElement;
const sendGuessBtn = document.getElementById('send-guess-btn')!;

function addChat(msg: string, cls: string = '') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remaining guesses per round
let remainingGuesses = 0;
let currentRound = 0;
let currentDrawerName = '';
const guessesLeftEl = document.getElementById('guesses-left')!;

function updateGuessesUI() {
  guessesLeftEl.textContent = `剩余 ${remainingGuesses} 次`;
  if (remainingGuesses <= 0) {
    (guessInput as HTMLInputElement).disabled = true;
    (sendGuessBtn as HTMLButtonElement).disabled = true;
    guessesLeftEl.style.color = 'var(--danger)';
  } else {
    (guessInput as HTMLInputElement).disabled = false;
    (sendGuessBtn as HTMLButtonElement).disabled = false;
    guessesLeftEl.style.color = 'var(--text-muted)';
  }
}

function sendGuess() {
  const text = guessInput.value.trim();
  if (!text || remainingGuesses <= 0) return;
  send({ type: 'guess', data: { text } });
  remainingGuesses--;
  updateGuessesUI();
  guessInput.value = '';
}
sendGuessBtn.addEventListener('click', sendGuess);
guessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendGuess(); });

// Timer
const timerDisplay = document.getElementById('timer-display')!;
const hintDisplay = document.getElementById('hint-display')!;
const scoreList = document.getElementById('score-list')!;

function renderScores() {
  scoreList.innerHTML = state.players
    .sort((a, b) => b.score - a.score)
    .map(p => `<div>${p.is_owner ? '👑 ' : ''}${p.nickname}: ${p.score}分</div>`)
    .join('');
}

// ========== WS Handlers (each event type has ONE handler) ==========

// word_options: received when we are the drawer, so enable drawing
on('word_options', (data: { words: string[] }) => {
  // We received word_options, so we are the drawer — hide guess input
  currentDrawerName = state.nickname;
  canvas.setReadOnly(false);
  hintDisplay.textContent = '选一个词开始画!';
  setState({ wordOptions: data.words, isDrawing: true });
  document.getElementById('chat-input')!.style.display = 'none';

  const overlay = document.getElementById('word-overlay')!;
  const wordContainer = document.getElementById('word-options-container')!;
  wordContainer.innerHTML = data.words.map((w, i) =>
    `<button class="word-btn" data-idx="${i}">${w}</button>`
  ).join('');
  overlay.style.display = '';
  wordContainer.querySelectorAll('.word-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx!);
      send({ type: 'select_word', data: { word_index: idx } });
      overlay.style.display = 'none';
      hintDisplay.textContent = '准备画画...';
    });
  });
});

on('word_hint', (data: { length: number; pattern: string; category?: string }) => {
  setState({ wordHint: data.pattern });
  const countNode = document.createElement('span');
  countNode.style.cssText = 'font-size:13px;color:var(--text-muted);';
  countNode.textContent = '（' + data.length + '个字）';
  if (data.category) {
    const catNode = document.createElement('span');
    catNode.style.cssText = 'font-size:12px;color:var(--primary);display:block;letter-spacing:0;';
    catNode.textContent = data.category;
    hintDisplay.textContent = '';
    hintDisplay.appendChild(catNode);
    hintDisplay.appendChild(document.createTextNode(data.pattern + ' '));
    hintDisplay.appendChild(countNode);
  } else {
    hintDisplay.textContent = '';
    hintDisplay.appendChild(document.createTextNode(data.pattern + ' '));
    hintDisplay.appendChild(countNode);
  }
});

on('draw_data', (data: DrawData) => {
  canvas.remoteDraw(data);
});

on('timer_tick', (data: { seconds_left: number }) => {
  setState({ secondsLeft: data.seconds_left });
  timerDisplay.textContent = String(data.seconds_left);
  if (data.seconds_left <= 10) {
    timerDisplay.classList.add('urgent');
  } else {
    timerDisplay.classList.remove('urgent');
  }
});

on('role_state', (data: { is_drawer: boolean; word?: string }) => {
  const isDrawer = !!data.is_drawer;
  canvas.setReadOnly(!isDrawer);
  setState({ isDrawing: isDrawer });
  if (isDrawer) {
    currentDrawerName = state.nickname;
  }
  document.getElementById('chat-input')!.style.display = isDrawer ? 'none' : '';
  if (isDrawer) {
    hintDisplay.textContent = data.word ? `你正在画: ${data.word}` : '你正在画画';
  }
});

on('guess_broadcast', (data: { player_id: string; player_name: string; text: string }) => {
  addChat(`${data.player_name}: ${data.text}`);
});

on('correct_guess', (data: { player_id: string; player_name: string; score: number }) => {
  addChat(`✅ ${data.player_name} 猜对啦! (+${data.score}分)`, 'correct');
  state.guessedPlayers.add(data.player_id);
  // Update the player's score in state
  const p = state.players.find(x => x.id === data.player_id);
  if (p) p.score += data.score;
  renderScores();
});

// round_result: show overlay, reset drawing state
on('round_result', (data: { answer: string; scores: { player_id: string; player_name: string; score: number }[] }) => {
  setState({ roundScores: data.scores });
  canvas.setReadOnly(true);
  setState({ isDrawing: false });

  // Upload canvas drawing (fire-and-forget)
  currentRound++;
  try {
    const imgData = canvas.getCanvas().toDataURL('image/png');
    fetch('/api/drawings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imgData,
        room_id: state.roomId,
        word: data.answer,
        drawer_name: currentDrawerName,
        round: currentRound,
      }),
    }).catch(() => {});
  } catch {}

  document.getElementById('chat-input')!.style.display = '';  // show guess input again
  remainingGuesses = 3;
  updateGuessesUI();
  state.guessedPlayers.clear();
  timerDisplay.textContent = '--';
  timerDisplay.classList.remove('urgent');

  const overlay = document.getElementById('round-result-overlay')!;
  document.getElementById('round-result-answer')!.textContent = `答案是: ${data.answer}`;
  document.getElementById('round-result-scores')!.innerHTML = data.scores.map(s =>
    `<li>${s.player_name}: +${s.score}分</li>`
  ).join('');
  overlay.style.display = '';
  // Auto-hide after 4 seconds (server waits 5s)
  setTimeout(() => { overlay.style.display = 'none'; }, 4000);
});

on('player_left', (data: { player_id: string }) => {
  const p = state.players.find(x => x.id === data.player_id);
  const name = p ? p.nickname : '未知玩家';
  addChat(`${name} 离开了游戏`, 'system');
  const players = state.players.filter(x => x.id !== data.player_id);
  setState({ players });
  renderScores();
});

on('game_over', (data: { rankings: { player_id: string; player_name: string; score: number }[] }) => {
  setState({ rankings: data.rankings, page: 'result' });
});

// game_started: switch to game page + reset UI
on('game_started', (data: { total_rounds: number }) => {
  setState({ totalRounds: data.total_rounds, page: 'game' });
  remainingGuesses = 3;
  updateGuessesUI();
  state.guessedPlayers.clear();
  state.players.forEach(p => p.score = 0);
  renderScores();
  timerDisplay.classList.remove('urgent');
  canvas.clear();
  canvas.setReadOnly(true);
  document.getElementById('chat-input')!.style.display = '';
  chatMessages.innerHTML = '';
  hintDisplay.textContent = '等待画手选词...';
  timerDisplay.textContent = '60';
});
