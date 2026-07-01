use axum::extract::ws::{Message, WebSocket};
use futures_util::stream::StreamExt;
use futures_util::SinkExt;
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::room::AppState;
use crate::types::*;
use uuid::Uuid;

pub async fn handle_ws(socket: WebSocket, room_id: String, state: Arc<AppState>) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let player_id = Uuid::new_v4().to_string();

    // Phase 1: wait for join_room message
    let (nickname, mut bcast_rx) = loop {
        if let Some(Ok(Message::Text(t))) = ws_rx.next().await {
            if let Ok(ClientMessage::JoinRoom { nickname }) = serde_json::from_str(&t) {
                match state.join_room(&room_id, &player_id, &nickname).await {
                    Ok((is_owner, rx)) => {
                        // Send room_joined to THIS player only
                        if let Some(r) = state.get_room(&room_id).await {
                            let ri = r.read().await;
                            let msg = ServerMessage::RoomJoined {
                                room_id: room_id.clone(),
                                players: crate::room::build_player_info(&ri),
                                is_owner,
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                let _ = ws_tx.send(Message::Text(json)).await;
                            }
                        }

                        // Broadcast player_joined to everyone ELSE in the room
                        let pj = ServerMessage::PlayerJoined {
                            player: PlayerInfo {
                                id: player_id.clone(),
                                nickname: nickname.clone(),
                                score: 0,
                                is_owner,
                            },
                        };
                        state.broadcast(&room_id, &pj).await;
                        break (nickname, rx);
                    }
                    Err(e) => {
                        let msg = ServerMessage::Error { message: e };
                        if let Ok(json) = serde_json::to_string(&msg) {
                            let _ = ws_tx.send(Message::Text(json)).await;
                        }
                    }
                }
            }
        } else {
            return; // connection closed before join
        }
    };

    // Forward ws_rx to a channel so we can select between bcast_rx and ws messages
    let (local_tx, mut local_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    tokio::spawn(async move {
        while let Some(Ok(Message::Text(t))) = ws_rx.next().await {
            if local_tx.send(t).is_err() {
                break;
            }
        }
    });

    // Phase 2: main loop — select between broadcast and incoming messages
    loop {
        tokio::select! {
            result = bcast_rx.recv() => {
                match result {
                    Ok(msg) => {
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if ws_tx.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            Some(text) = local_rx.recv() => {
                if let Ok(cmsg) = serde_json::from_str::<ClientMessage>(&text) {
                    process_message(&state, &room_id, &player_id, &nickname, cmsg).await;
                }
            }
            else => break,
        }
    }

    // Cleanup on disconnect
    state.leave_room(&room_id, &player_id).await;
    state
        .broadcast(
            &room_id,
            &ServerMessage::PlayerLeft {
                player_id: player_id.clone(),
            },
        )
        .await;
}

async fn process_message(
    state: &Arc<AppState>,
    room_id: &str,
    player_id: &str,
    nickname: &str,
    msg: ClientMessage,
) {
    match msg {
        ClientMessage::StartGame => {
            let room = match state.get_room(room_id).await {
                Some(r) => r,
                None => return,
            };
            let mut r = room.write().await;
            if r.owner_id != player_id {
                return;
            }
            if r.can_start().is_err() {
                return;
            }
            r.start_game();
            let total = r.total_rounds;
            // Collect new round info before dropping lock
            let word_options = match &r.state {
                GameState::NewRound { word_options, .. } => word_options.clone(),
                _ => return,
            };
            let _drawer_id = r.current_drawer_id.clone();
            let hint_len = word_options
                .first()
                .map(|w| w.chars().count() as u32)
                .unwrap_or(0);
            drop(r);

            state
                .broadcast(room_id, &ServerMessage::GameStarted {
                    total_rounds: total,
                })
                .await;

            // Broadcast word options (guessers should ignore this client-side)
            state
                .broadcast(
                    room_id,
                    &ServerMessage::WordOptions {
                        words: word_options,
                    },
                )
                .await;
            state
                .broadcast(
                    room_id,
                    &ServerMessage::WordHint {
                        length: hint_len,
                        pattern: "_ ".repeat(hint_len as usize).trim().to_string(),
                    },
                )
                .await;
            // Timer will start after drawer selects a word via SelectWord handler
        }

        ClientMessage::SelectWord { word_index } => {
            let room = match state.get_room(room_id).await {
                Some(r) => r,
                None => return,
            };
            let mut r = room.write().await;
            match r.select_word(player_id, word_index as usize) {
                Ok(()) => {
                    let hint_len = match &r.state {
                        GameState::Drawing { word, .. } => word.chars().count() as u32,
                        _ => 0,
                    };
                    drop(r);
                    state
                        .broadcast(
                            room_id,
                            &ServerMessage::WordHint {
                                length: hint_len,
                                pattern: "_ ".repeat(hint_len as usize).trim().to_string(),
                            },
                        )
                        .await;
                    // Start drawing timer
                    let state_clone = state.clone();
                    let room_id_clone = room_id.to_string();
                    tokio::spawn(async move { run_timer(state_clone, room_id_clone).await });
                }
                Err(e) => {
                    drop(r);
                    state
                        .broadcast(
                            room_id,
                            &ServerMessage::Error {
                                message: e.to_string(),
                            },
                        )
                        .await;
                }
            }
        }

        ClientMessage::Draw(data) => {
            state
                .broadcast(room_id, &ServerMessage::DrawData(data))
                .await;
        }

        ClientMessage::Guess { text } => {
            let room = match state.get_room(room_id).await {
                Some(r) => r,
                None => return,
            };
            let mut r = room.write().await;
            match r.submit_guess(player_id, &text) {
                Ok(Some(score)) => {
                    let msg = ServerMessage::CorrectGuess {
                        player_id: player_id.to_string(),
                        player_name: nickname.to_string(),
                        score,
                    };
                    drop(r);
                    state.broadcast(room_id, &msg).await;

                    // If all guessed, the timer task will end the round on next tick
                    // (no explicit action needed here)
                }
                Ok(None) => {
                    drop(r);
                    let msg = ServerMessage::GuessBroadcast {
                        player_id: player_id.to_string(),
                        player_name: nickname.to_string(),
                        text,
                    };
                    state.broadcast(room_id, &msg).await;
                }
                Err(e) => {
                    drop(r);
                    state
                        .broadcast(
                            room_id,
                            &ServerMessage::Error {
                                message: e.to_string(),
                            },
                        )
                        .await;
                }
            }
        }
        // join_room is handled in handle_ws before this function
        _ => {}
    }
}

async fn run_timer(state: Arc<AppState>, room_id: String) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        let room = match state.get_room(&room_id).await {
            Some(r) => r,
            None => return,
        };
        let mut r = room.write().await;

        let all_done = r.all_guessed();
        let tick_result = r.tick_timer();

        match tick_result {
            Some(secs) => {
                drop(r);
                state
                    .broadcast(
                        &room_id,
                        &ServerMessage::TimerTick {
                            seconds_left: secs,
                        },
                    )
                    .await;
                if all_done {
                    // All guessed — end round early
                    break;
                }
            }
            None => break, // time's up
        }
    }

    // Round is over: end it
    let room = match state.get_room(&room_id).await {
        Some(r) => r,
        None => return,
    };
    let mut r = room.write().await;
    let (answer, scores) = r.end_round();
    let msg = ServerMessage::RoundResultPayload {
        answer: answer.clone(),
        scores: scores.clone(),
    };
    drop(r);
    state.broadcast(&room_id, &msg).await;

    // Wait 5 seconds for players to see results
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    // Advance to next round (or game over)
    let room = match state.get_room(&room_id).await {
        Some(r) => r,
        None => return,
    };
    let mut r = room.write().await;
    match r.advance_round() {
        Some(GameState::GameOver { rankings }) => {
            let msg = ServerMessage::GameOverPayload {
                rankings: rankings.clone(),
            };
            drop(r);
            state.broadcast(&room_id, &msg).await;
        }
        Some(_) => {
            // RoundResult state after advance_round returns Some (shouldn't happen
            // in practice, but handle gracefully)
            drop(r);
        }
        None => {
            // New round started — broadcast word options
            let word_options = match &r.state {
                GameState::NewRound { word_options, .. } => word_options.clone(),
                _ => vec![],
            };
            let hint_len = word_options
                .first()
                .map(|w| w.chars().count() as u32)
                .unwrap_or(0);
            drop(r);
            state
                .broadcast(
                    &room_id,
                    &ServerMessage::WordOptions {
                        words: word_options,
                    },
                )
                .await;
            state
                .broadcast(
                    &room_id,
                    &ServerMessage::WordHint {
                        length: hint_len,
                        pattern: "_ ".repeat(hint_len as usize).trim().to_string(),
                    },
                )
                .await;
            // Timer will start after the drawer selects a word
        }
    }
}
