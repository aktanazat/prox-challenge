//! HTTP handlers per design.md's frozen API: session lifecycle, message
//! send, file upload, and the SSE stream.

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::Json;
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::sessions::{SendError, SessionStore};

/// Filenames may only contain these characters once sanitized; anything
/// else is stripped. Keeps upload paths predictable and prevents path
/// traversal via `..` or separators.
fn sanitize_filename(name: &str) -> String {
    let cleaned: String =
        name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_').collect();
    if cleaned.is_empty() {
        "upload".to_owned()
    } else {
        cleaned
    }
}

const MAX_UPLOAD_BYTES: usize = 15 * 1024 * 1024;

#[derive(Clone)]
pub struct AppState {
    pub sessions: SessionStore,
    pub knowledge_dir: PathBuf,
}

#[derive(Serialize)]
struct CreateSessionResponse {
    session_id: Uuid,
}

pub async fn create_session(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let session_id = state.sessions.create().await;
    (StatusCode::OK, Json(CreateSessionResponse { session_id }))
}

#[derive(Deserialize)]
pub struct MessageRequest {
    text: String,
}

pub async fn post_message(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<MessageRequest>,
) -> impl IntoResponse {
    match state.sessions.send_message(session_id, body.text).await {
        Ok(()) => (StatusCode::ACCEPTED, Json(serde_json::json!({}))).into_response(),
        Err(SendError::UnknownSession) => StatusCode::NOT_FOUND.into_response(),
        Err(SendError::ChildUnavailable) => {
            (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "session is shutting down"})))
                .into_response()
        }
    }
}

#[derive(Serialize)]
struct UploadResponse {
    path: String,
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<Uuid>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    if !state.sessions.exists(session_id).await {
        return StatusCode::NOT_FOUND.into_response();
    }

    let field = match multipart.next_field().await {
        Ok(Some(field)) => field,
        Ok(None) => return (StatusCode::BAD_REQUEST, "no file field in multipart body").into_response(),
        Err(err) => return (StatusCode::BAD_REQUEST, format!("malformed multipart body: {err}")).into_response(),
    };

    let original_name = field.file_name().unwrap_or("upload").to_owned();
    let sanitized_name = sanitize_filename(&original_name);

    let bytes = match field.bytes().await {
        Ok(bytes) => bytes,
        Err(err) => return (StatusCode::BAD_REQUEST, format!("failed to read upload: {err}")).into_response(),
    };
    if bytes.len() > MAX_UPLOAD_BYTES {
        return (StatusCode::PAYLOAD_TOO_LARGE, format!("file exceeds {MAX_UPLOAD_BYTES} byte limit")).into_response();
    }

    let session_upload_dir = state.knowledge_dir.join("uploads").join(session_id.to_string());
    if let Err(err) = tokio::fs::create_dir_all(&session_upload_dir).await {
        tracing::error!(%err, session_id = %session_id, "failed to create upload directory");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    let dest_path = session_upload_dir.join(&sanitized_name);
    if let Err(err) = tokio::fs::write(&dest_path, &bytes).await {
        tracing::error!(%err, path = %dest_path.display(), "failed to write uploaded file");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let relative_path = format!("uploads/{session_id}/{sanitized_name}");
    Json(UploadResponse { path: relative_path }).into_response()
}

/// `ready` is synthesized here, per subscriber, as the first frame of every
/// SSE connection — not broadcast from the session actor, which would race
/// a client that hasn't subscribed yet (see `sessions.rs::run_session_actor`).
pub async fn stream_session(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<Uuid>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    let receiver = state.sessions.subscribe(session_id).await.ok_or(StatusCode::NOT_FOUND)?;
    let ready = tokio_stream::once(Ok(Event::default().data(crate::protocol::SseEvent::Ready { session_id }.to_data())));
    let rest = tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(move |item| match item {
        Ok(sse_event) => Some(Ok(Event::default().data(sse_event.to_data()))),
        Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(skipped)) => {
            tracing::warn!(skipped, session_id = %session_id, "SSE subscriber lagged, some events dropped");
            None
        }
    });
    let stream = ready.chain(rest);
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}
