import { state, onStateChange, setState, loadSession, clearSession } from './state';
import { connect } from './ws';
import './pages/home';
import './pages/lobby';
import './pages/game';
import './pages/result';
import './pages/admin';
import './style.css';

// Page router: show/hide pages based on state.page
onStateChange(s => {
  const pages: Record<string, string> = {
    home: 'page-home',
    lobby: 'page-lobby',
    game: 'page-game',
    result: 'page-result',
    admin: 'page-admin',
  };
  Object.entries(pages).forEach(([name, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = name === s.page ? '' : 'none';
  });
});

// Detect admin route
const isAdmin = location.hash === '#/admin';
if (isAdmin) {
  setState({ page: 'admin' });
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.public_url) {
      setState({ publicUrl: data.public_url });
    }
  } catch {
    // Fallback to location.origin
  }
}

// Auto-reconnect on page refresh — verify room still exists first
async function tryReconnect() {
  if (isAdmin) return;  // admin page, skip game reconnect
  const saved = loadSession();
  if (!saved?.roomId || !saved?.playerId || !saved?.nickname) {
    setState({ page: 'home' });
    return;
  }
  // Check if room still exists
  try {
    const res = await fetch(`/api/rooms/${saved.roomId}`);
    const data = await res.json();
    if (!data.exists) {
      clearSession();
      setState({ page: 'home' });
      return;
    }
  } catch {
    setState({ page: 'home' });
    return;
  }
  setState({ nickname: saved.nickname, playerId: saved.playerId, roomId: saved.roomId });
  connect(saved.roomId).then(() => {
    setState({ page: 'lobby' });
  }).catch(() => {
    setState({ page: 'home' });
  });
}

loadConfig();

tryReconnect();
