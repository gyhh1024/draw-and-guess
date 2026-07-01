use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ===== Data Models =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub nickname: String,
    pub score: u32,
    pub has_drawn: bool,
    pub is_connected: bool,
}

impl Player {
    pub fn new(id: String, nickname: String) -> Self {
        Self { id, nickname, score: 0, has_drawn: false, is_connected: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub players: Vec<Player>,
    pub state: GameState,
    pub owner_id: String,
    pub current_round: u8,
    pub total_rounds: u8,
    pub current_drawer_id: String,  // tracks who is currently drawing
}

// ===== Game State Machine =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase")]
pub enum GameState {
    Waiting,
    NewRound { drawer_id: String, word_options: Vec<String> },
    Drawing { drawer_id: String, word: String, seconds_left: u8, guessed_players: HashMap<String, u32> },
    RoundResult { answer: String, scores: Vec<ScoreEntry> },
    GameOver { rankings: Vec<ScoreEntry> },
}

// ===== Wire Messages =====

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    #[serde(rename = "join_room")]   JoinRoom { nickname: String },
    #[serde(rename = "start_game")]  StartGame,
    #[serde(rename = "select_word")] SelectWord { word_index: u32 },
    #[serde(rename = "draw")]        Draw(DrawData),
    #[serde(rename = "guess")]       Guess { text: String },
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DrawData {
    pub action: String,  // "start" | "move" | "end" | "clear" | "undo"
    pub x: f64,
    pub y: f64,
    pub color: String,
    pub width: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    #[serde(rename = "room_joined")]   RoomJoined { room_id: String, players: Vec<PlayerInfo>, is_owner: bool },
    #[serde(rename = "player_joined")] PlayerJoined { player: PlayerInfo },
    #[serde(rename = "player_left")]   PlayerLeft { player_id: String },
    #[serde(rename = "game_started")]  GameStarted { total_rounds: u8 },
    #[serde(rename = "word_options")]  WordOptions { words: Vec<String> },
    #[serde(rename = "word_hint")]     WordHint { length: u32, pattern: String },
    #[serde(rename = "draw_data")]     DrawData(DrawData),
    #[serde(rename = "guess_broadcast")] GuessBroadcast { player_id: String, player_name: String, text: String },
    #[serde(rename = "correct_guess")]   CorrectGuess { player_id: String, player_name: String, score: u32 },
    #[serde(rename = "timer_tick")]    TimerTick { seconds_left: u8 },
    #[serde(rename = "round_result")]  RoundResultPayload { answer: String, scores: Vec<ScoreEntry> },
    #[serde(rename = "game_over")]     GameOverPayload { rankings: Vec<ScoreEntry> },
    #[serde(rename = "error")]         Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: String,
    pub nickname: String,
    pub score: u32,
    pub is_owner: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreEntry {
    pub player_id: String,
    pub player_name: String,
    pub score: u32,
}
