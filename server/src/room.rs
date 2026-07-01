use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use rand::Rng;
use crate::types::*;

pub struct AppState {
    pub(crate) rooms: RwLock<HashMap<String, Arc<RwLock<Room>>>>,
    pub(crate) broadcasts: RwLock<HashMap<String, broadcast::Sender<ServerMessage>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rooms: RwLock::new(HashMap::new()),
            broadcasts: RwLock::new(HashMap::new()),
        }
    }

    pub async fn create_room(&self, owner_id: &str, owner_nickname: &str) -> (String, Arc<RwLock<Room>>) {
        let room_id = Self::gen_id(&self.rooms).await;
        let player = Player::new(owner_id.to_string(), owner_nickname.to_string());
        let room = Arc::new(RwLock::new(Room {
            id: room_id.clone(),
            players: vec![player],
            state: GameState::Waiting,
            owner_id: owner_id.to_string(),
            current_round: 0,
            total_rounds: 0,
            current_drawer_id: String::new(),
        }));
        self.rooms.write().await.insert(room_id.clone(), room.clone());
        let (tx, _) = broadcast::channel(256);
        self.broadcasts.write().await.insert(room_id.clone(), tx);
        (room_id, room)
    }

    pub async fn join_room(
        &self, room_id: &str, player_id: &str, nickname: &str,
    ) -> Result<(bool, broadcast::Receiver<ServerMessage>), String> {
        let rooms = self.rooms.read().await;
        let room = rooms.get(room_id).ok_or_else(|| "房间不存在".to_string())?;
        let mut r = room.write().await;
        let is_owner;

        // Reconnect: player ID already in room
        if let Some(p) = r.players.iter_mut().find(|p| p.id == player_id) {
            p.is_connected = true;
            is_owner = player_id == r.owner_id;
        } else {
            if !matches!(r.state, GameState::Waiting) {
                return Err("游戏已开始，无法加入".to_string());
            }
            r.players.push(Player::new(player_id.to_string(), nickname.to_string()));
            is_owner = false;
        }

        let rx = self.broadcasts.read().await
            .get(room_id).ok_or_else(|| "内部错误".to_string())?
            .subscribe();
        Ok((is_owner, rx))
    }

    pub async fn leave_room(&self, room_id: &str, player_id: &str) {
        if let Some(room) = self.rooms.read().await.get(room_id) {
            let mut r = room.write().await;
            if let Some(p) = r.players.iter_mut().find(|p| p.id == player_id) {
                p.is_connected = false;
            }
        }
    }

    pub async fn get_room(&self, room_id: &str) -> Option<Arc<RwLock<Room>>> {
        self.rooms.read().await.get(room_id).cloned()
    }

    pub async fn broadcast(&self, room_id: &str, msg: &ServerMessage) {
        if let Some(tx) = self.broadcasts.read().await.get(room_id) {
            let _ = tx.send(msg.clone());
        }
    }

    async fn gen_id(rooms: &RwLock<HashMap<String, Arc<RwLock<Room>>>>) -> String {
        loop {
            let id: String = {
                let mut rng = rand::thread_rng();
                (0..4).map(|_| rng.gen_range(b'A'..=b'Z') as char).collect()
            };
            if !rooms.read().await.contains_key(&id) {
                return id;
            }
        }
    }
}

pub fn build_player_info(room: &Room) -> Vec<PlayerInfo> {
    room.players.iter()
        .filter(|p| p.is_connected)
        .map(|p| PlayerInfo {
            id: p.id.clone(), nickname: p.nickname.clone(),
            score: p.score, is_owner: p.id == room.owner_id,
        })
        .collect()
}
