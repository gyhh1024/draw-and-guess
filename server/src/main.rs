mod types;
mod room;
mod game;
mod words;
mod ws;

use axum::{
    extract::{Path, State, ws::WebSocketUpgrade},
    response::{Json, IntoResponse},
    routing::{get, post},
    Router,
};
use room::AppState;
use serde::Serialize;
use std::sync::Arc;
use tower_http::services::ServeDir;

#[derive(Serialize)]
struct CreateRoomResponse {
    room_id: String,
    player_id: String,
}

#[derive(Serialize)]
struct RoomCheckResponse {
    exists: bool,
}

async fn create_room(State(state): State<Arc<AppState>>) -> Json<CreateRoomResponse> {
    let player_id = uuid::Uuid::new_v4().to_string();
    let (room_id, _) = state.create_room(&player_id, "owner").await;
    Json(CreateRoomResponse { room_id, player_id })
}

async fn check_room(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> Json<RoomCheckResponse> {
    let exists = state.get_room(&room_id).await.is_some();
    Json(RoomCheckResponse { exists })
}

async fn ws_handler(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws::handle_ws(socket, room_id, state))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let state = Arc::new(AppState::new());

    // Spawn room cleanup task (every 60s, remove rooms empty for > 10min)
    let cleanup_state = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            let mut rooms = cleanup_state.rooms.write().await;
            rooms.retain(|_id, room| {
                let r = room.blocking_read();
                r.players.iter().any(|p| p.is_connected)
            });
        }
    });

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "client/dist".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .unwrap_or(3000);

    let app = Router::new()
        .route("/api/rooms", post(create_room))
        .route("/api/rooms/{id}", get(check_room))
        .route("/ws/{room_id}", get(ws_handler))
        .fallback_service(ServeDir::new(&static_dir))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("Server running on http://{}", addr);
    axum::serve(listener, app).await.unwrap();
}
