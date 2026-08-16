//! Vulcan OmniPro 220 support agent backend: axum HTTP/SSE server that
//! speaks the Claude Agent SDK's stream-json protocol to a spawned
//! `claude` child per browser session. See design.md for the full
//! contract; module docs in `agent.rs` and `stream.rs` cover the two
//! documented deviations (dropped `--bare`, per-turn stall watchdog).

mod agent;
mod api;
mod protocol;
mod sessions;
mod stream;

use std::path::Path;
use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use agent::StartupConfig;
use api::AppState;
use sessions::SessionStore;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    // The manifest dir is `<repo>/server` at compile time regardless of the
    // directory `cargo run`/the built binary is invoked from, so repo-root
    // relative paths (.env, knowledge/, web/, files/, prompts/) resolve
    // reliably.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().expect("server/ has a parent directory").to_path_buf();

    let _ = dotenvy::from_path(repo_root.join(".env"));

    let config = match StartupConfig::load(repo_root.clone()) {
        Ok(config) => config,
        Err(err) => {
            eprintln!("vulcan-server: startup failed: {err}");
            std::process::exit(1);
        }
    };

    tracing::info!(repo_root = %config.repo_root.display(), turn_mode = ?config.turn_mode, "starting vulcan-server");
    if config.anthropic_api_key.is_some() {
        tracing::info!("ANTHROPIC_API_KEY present in .env, authenticating claude child with it");
    } else {
        tracing::info!("no ANTHROPIC_API_KEY in .env, falling back to local claude CLI login");
    }

    let port = config.port;
    let web_dir = config.web_dir.clone();
    let knowledge_dir = config.knowledge_dir.clone();
    let files_dir = repo_root.join("files");

    let sessions = SessionStore::new(Arc::new(config));
    tokio::spawn(sessions.clone().run_reaper());

    let state = Arc::new(AppState { sessions, knowledge_dir: knowledge_dir.clone() });

    let app = Router::new()
        .route_service("/", ServeFile::new(web_dir.join("index.html")))
        .route_service("/product.webp", ServeFile::new(repo_root.join("product.webp")))
        .route_service("/product-inside.webp", ServeFile::new(repo_root.join("product-inside.webp")))
        .nest_service("/web", ServeDir::new(&web_dir))
        .nest_service("/knowledge", ServeDir::new(&knowledge_dir))
        .nest_service("/files", ServeDir::new(&files_dir))
        .route("/api/session", post(api::create_session))
        .route("/api/session/{id}/message", post(api::post_message))
        .route("/api/session/{id}/upload", post(api::upload_file))
        .route("/api/session/{id}/stream", get(api::stream_session))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("vulcan-server: failed to bind port {port}: {err}");
            std::process::exit(1);
        }
    };

    println!("Vulcan agent listening on http://localhost:{port}");
    if let Err(err) = axum::serve(listener, app).await {
        eprintln!("vulcan-server: server error: {err}");
        std::process::exit(1);
    }
}
