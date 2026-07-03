import { state } from './state';

type MessageHandler = (data: any) => void;
const handlers: Map<string, MessageHandler> = new Map();

let ws: WebSocket | null = null;

export function connect(roomId: string, password: string = ""): Promise<void> {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/${roomId}`;
  ws = new WebSocket(url);

  return new Promise((resolve, reject) => {
    ws!.onopen = () => {
      send({ type: 'join_room', data: { nickname: state.nickname, player_id: state.playerId, password } });
    };
    ws!.onerror = () => reject(new Error('WebSocket connection failed'));
    ws!.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Intercept first response (should be room_joined or error)
      if (msg.type === 'room_joined') {
        if (handlers.has('room_joined')) {
          handlers.get('room_joined')!(msg.data);
        }
        resolve();
        // After resolving, subsequent messages go through normal handler dispatch
        ws!.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          const h = handlers.get(msg.type);
          if (h) h(msg.data);
          const all = handlers.get('*');
          if (all) all(msg);
        };
        return;
      }
      if (msg.type === 'error') {
        reject(new Error(msg.data.message || '加入房间失败'));
        return;
      }
      // Fallback: dispatch other messages normally (shouldn't happen before room_joined)
      const h = handlers.get(msg.type);
      if (h) h(msg.data);
      const all = handlers.get('*');
      if (all) all(msg);
    };
  });
}

export function send(msg: { type: string; data?: any }) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function on(type: string, handler: MessageHandler) {
  handlers.set(type, handler);
}

export function off(type: string) {
  handlers.delete(type);
}
