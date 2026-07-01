import { state, setState, onStateChange, clearSession } from '../state';
import { send } from '../ws';

const app = document.getElementById('app')!;
app.insertAdjacentHTML('beforeend', `
<div id="page-result" class="flex-center" style="min-height:100vh;">
  <div class="overlay-card" style="position:static;">
    <h2 style="font-size:28px;margin-bottom:4px;">🏆 游戏结束</h2>
    <p class="text-muted text-sm" style="margin-bottom:20px;">最终排名</p>

    <ol id="rankings-list" class="ranking-list" style="margin-bottom:24px;"></ol>

    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="play-again-btn" class="success" style="display:none;">再来一局</button>
      <button id="back-lobby-btn" class="secondary">返回大厅</button>
    </div>
  </div>
</div>
`);

const rankingsList = document.getElementById('rankings-list')!;
const playAgainBtn = document.getElementById('play-again-btn')!;
const backLobbyBtn = document.getElementById('back-lobby-btn')!;

function renderRankings(rankings: { player_id: string; player_name: string; score: number }[]) {
  const medals = ['🥇', '🥈', '🥉'];
  rankingsList.innerHTML = rankings.map((r, i) =>
    `<li>${medals[i] || ''} ${r.player_name} <span>${r.score} 分</span></li>`
  ).join('');
  playAgainBtn.style.display = state.isOwner ? '' : 'none';
}

// game_over is handled by game.ts (sets rankings + page switch to 'result').
// When this page becomes visible, rankings are already in state.
onStateChange(s => {
  if (s.page === 'result' && s.rankings.length > 0) {
    renderRankings(s.rankings);
  }
});

playAgainBtn.addEventListener('click', () => {
  send({ type: 'start_game' });
});

backLobbyBtn.addEventListener('click', () => {
  setState({ page: 'lobby' });
});
