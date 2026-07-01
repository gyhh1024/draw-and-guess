import { state } from './state';

type MessageHandler = (data: any) => void;
const handlers: Map<string, MessageHandler> = new Map();

let ws: WebSocket | null = null;

export function connect(roomId: string): Promise<void> {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/${roomId}`;
  ws = new WebSocket(url);

  return new Promise((resolve, reject) => {
    ws!.onopen = () => {
      send({ type: 'join_room', data: { nickname: state.nickname, player_id: state.playerId } });
      resolve();
    };
    ws!.onerror = () => reject(new Error('WebSocket connection failed'));
    ws!.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const handler = handlers.get(msg.type);
      if (handler) handler(msg.data);
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
