import { state, onStateChange, setState, clearSession } from './state';
import { connect } from './ws';
import './pages/home';
import './pages/lobby';
import './pages/game';
import './pages/result';
import './pages/gallery';
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
    gallery: 'page-gallery',
  };
  Object.entries(pages).forEach(([name, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = name === s.page ? '' : 'none';
  });
});

// Detect admin route
const isAdmin = location.hash === '#/admin';
const isGallery = location.hash === '#/gallery';
if (isAdmin) {
  setState({ page: 'admin' });
} else if (isGallery) {
  setState({ page: 'gallery' });
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

// Auto-reconnect on page refresh — only from URL params (not localStorage)
async function tryReconnect() {
  if (isAdmin || isGallery) return;  // admin/gallery page, skip game reconnect
  // Only read from URL params for auto-reconnect; localStorage is just for form pre-fill
  const sp = new URLSearchParams(location.search);
  const room = sp.get('room');
  const pid = sp.get('pid');
  const nick = sp.get('nick');
  if (!room || !pid || !nick) {
    setState({ page: 'home' });
    return;
  }
  // Check if room still exists
  try {
    const res = await fetch(`/api/rooms/${room}`);
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
  setState({ nickname: decodeURIComponent(nick), playerId: pid, roomId: room });
  connect(room).then(() => {
    setState({ page: 'lobby' });
  }).catch(() => {
    setState({ page: 'home' });
  });
}

loadConfig();

tryReconnect();
