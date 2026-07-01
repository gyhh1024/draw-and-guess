use crate::types::*;
use crate::words::pick_words;

const DRAW_SECS: u8 = 60;

impl Room {
    pub fn can_start(&self) -> Result<(), &'static str> {
        let n = self.players.iter().filter(|p| p.is_connected).count();
        if n < 2 {
            return Err("至少需要2名玩家");
        }
        if !matches!(self.state, GameState::Waiting | GameState::GameOver { .. }) {
            return Err("游戏已在进行中");
        }
        Ok(())
    }

    pub fn start_game(&mut self) {
        // Reset if coming from GameOver
        if matches!(self.state, GameState::GameOver { .. }) {
            self.state = GameState::Waiting;
        }
        for p in &mut self.players {
            p.score = 0;
            p.has_drawn = false;
        }
        self.total_rounds = self.players.iter().filter(|p| p.is_connected).count() as u8;
        self.current_round = 1;
        self.go_new_round();
    }

    fn go_new_round(&mut self) {
        // Find first connected player who hasn't drawn yet
        let drawer = self
            .players
            .iter()
            .filter(|p| p.is_connected && !p.has_drawn)
            .map(|p| p.id.clone())
            .next()
            .expect("no drawer available");
        self.current_drawer_id = drawer.clone();
        let words = pick_words(3);
        self.state = GameState::NewRound {
            drawer_id: drawer,
            word_options: words,
        };
    }

    pub fn select_word(&mut self, player_id: &str, idx: usize) -> Result<(), &'static str> {
        let word = match &self.state {
            GameState::NewRound {
                drawer_id,
                word_options,
            } => {
                if player_id != drawer_id {
                    return Err("只有画手可以选词");
                }
                word_options.get(idx).ok_or("无效选项")?.clone()
            }
            _ => return Err("不在选词阶段"),
        };
        // Sanity check: can't have 0-length word
        if word.is_empty() {
            return Err("无效的词");
        }

        let drawer_id = self.current_drawer_id.clone();
        self.state = GameState::Drawing {
            drawer_id,
            word,
            seconds_left: DRAW_SECS,
            guessed_players: std::collections::HashMap::new(),
        };
        Ok(())
    }

    pub fn submit_guess(&mut self, player_id: &str, text: &str) -> Result<Option<u32>, &'static str> {
        match &mut self.state {
            GameState::Drawing {
                drawer_id,
                word,
                guessed_players,
                ..
            } => {
                if player_id == drawer_id {
                    return Err("画手不能猜词");
                }
                if guessed_players.contains_key(player_id) {
                    return Ok(None);
                }
                if text.trim().to_lowercase() != word.trim().to_lowercase() {
                    return Ok(None);
                }

                let score: u32 = match guessed_players.len() {
                    0 => 30,
                    1 => 20,
                    _ => 10,
                };
                guessed_players.insert(player_id.to_string(), score);
                if let Some(p) = self.players.iter_mut().find(|p| p.id == player_id) {
                    p.score += score;
                }
                Ok(Some(score))
            }
            _ => Err("不在画画阶段"),
        }
    }

    pub fn tick_timer(&mut self) -> Option<u8> {
        match &mut self.state {
            GameState::Drawing { seconds_left, .. } => {
                if *seconds_left == 0 {
                    return None;
                }
                *seconds_left -= 1;
                Some(*seconds_left)
            }
            _ => None,
        }
    }

    pub fn all_guessed(&self) -> bool {
        match &self.state {
            GameState::Drawing {
                drawer_id,
                guessed_players,
                ..
            } => {
                let guesser_count = self
                    .players
                    .iter()
                    .filter(|p| p.is_connected && p.id != *drawer_id)
                    .count();
                guessed_players.len() >= guesser_count
            }
            _ => false,
        }
    }

    pub fn end_round(&mut self) -> (String, Vec<ScoreEntry>) {
        let (word, guessed) = match &self.state {
            GameState::Drawing {
                word,
                guessed_players,
                ..
            } => (word.clone(), guessed_players.clone()),
            _ => return (String::new(), vec![]),
        };
        let scores: Vec<ScoreEntry> = guessed
            .iter()
            .map(|(id, &score)| {
                let name = self
                    .players
                    .iter()
                    .find(|p| &p.id == id)
                    .map(|p| p.nickname.clone())
                    .unwrap_or_default();
                ScoreEntry {
                    player_id: id.clone(),
                    player_name: name,
                    score,
                }
            })
            .collect();
        self.state = GameState::RoundResult {
            answer: word.clone(),
            scores: scores.clone(),
        };
        (word, scores)
    }

    pub fn advance_round(&mut self) -> Option<GameState> {
        // Mark the current drawer as having drawn
        let drawer_id = self.current_drawer_id.clone();
        if let Some(p) = self.players.iter_mut().find(|p| p.id == drawer_id) {
            p.has_drawn = true;
        }

        // Check if there are more players who haven't drawn
        let more_to_draw = self
            .players
            .iter()
            .filter(|p| p.is_connected)
            .any(|p| !p.has_drawn);

        if more_to_draw {
            self.current_round += 1;
            self.go_new_round();
            None
        } else {
            let mut rankings: Vec<ScoreEntry> = self
                .players
                .iter()
                .map(|p| ScoreEntry {
                    player_id: p.id.clone(),
                    player_name: p.nickname.clone(),
                    score: p.score,
                })
                .collect();
            rankings.sort_by(|a, b| b.score.cmp(&a.score));
            let state = GameState::GameOver { rankings };
            self.state = state.clone();
            Some(state)
        }
    }

    #[allow(dead_code)]
    pub fn restart(&mut self) {
        for p in &mut self.players {
            p.score = 0;
            p.has_drawn = false;
        }
        self.state = GameState::Waiting;
        self.current_round = 0;
        self.total_rounds = 0;
        self.current_drawer_id = String::new();
    }
}
