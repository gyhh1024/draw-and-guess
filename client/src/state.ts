export interface PlayerInfo {
  id: string;
  nickname: string;
  score: number;
  is_owner: boolean;
}

export interface RoomSummary {
  room_id: string;
  player_count: number;
  owner_name: string;
  has_password: boolean;
  phase: string;
}

export type Page = 'home' | 'lobby' | 'game' | 'result' | 'admin';

export interface AppState {
  page: Page;
  nickname: string;
  playerId: string;
  roomId: string;
  isOwner: boolean;
  players: PlayerInfo[];
  totalRounds: number;
  wordOptions: string[];
  wordHint: string;
  secondsLeft: number;
  guessedPlayers: Set<string>;
  publicUrl: string;
  isDrawing: boolean;
  roundScores: { player_id: string; player_name: string; score: number }[];
  rankings: { player_id: string; player_name: string; score: number }[];
  roomList: RoomSummary[];
}

export const state: AppState = {
  page: 'home',
  nickname: '',
  playerId: '',
  roomId: '',
  isOwner: false,
  players: [],
  totalRounds: 0,
  wordOptions: [],
  wordHint: '',
  secondsLeft: 0,
  guessedPlayers: new Set(),
  publicUrl: '',
  isDrawing: false,
  roundScores: [],
  rankings: [],
  roomList: [],
};

type Listener = (s: AppState) => void;
const listeners: Listener[] = [];

export function setState(partial: Partial<AppState>) {
  Object.assign(state, partial);
  listeners.forEach(fn => fn(state));
}

export function onStateChange(fn: Listener) {
  listeners.push(fn);
}

const SESSION_KEY = 'dag_session';

export function saveSession() {
  const data = { nickname: state.nickname, playerId: state.playerId, roomId: state.roomId };
  // localStorage
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  // URL backup
  const url = new URL(location.href);
  url.searchParams.set('room', state.roomId);
  url.searchParams.set('pid', state.playerId);
  url.searchParams.set('nick', state.nickname);
  history.replaceState(null, '', url.toString());
}

export function loadSession(): { nickname: string; playerId: string; roomId: string } | null {
  // Try URL params first (survives refresh even if localStorage fails)
  const sp = new URLSearchParams(location.search);
  const room = sp.get('room');
  const pid = sp.get('pid');
  const nick = sp.get('nick');
  if (room && pid && nick) {
    return { nickname: nick, playerId: pid, roomId: room };
  }
  // Invite link mode (?room=ABCD): do not auto-reconnect from old localStorage
  if (room && (!pid || !nick)) {
    return null;
  }
  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  const url = new URL(location.href);
  url.searchParams.delete('room');
  url.searchParams.delete('pid');
  url.searchParams.delete('nick');
  history.replaceState(null, '', url.toString());
}
