//! Session registry: one entry per browser session, each owning a live
//! `claude` child (or, in `ResumePerTurn` mode, the state to respawn one
//! per turn), the broadcast channel its SSE stream reads from, and a
//! watchdog that catches a child gone silent mid-turn.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::{broadcast, mpsc, Mutex};
use uuid::Uuid;

use crate::agent::{self, ChildConfig, StartupConfig, TurnMode};
use crate::protocol::{self, SseEvent};
use crate::stream::{self, TurnWatchdog};

/// How long an SSE broadcast channel buffers events for a slow/reconnecting
/// subscriber before dropping the oldest.
const BROADCAST_CAPACITY: usize = 256;

/// Idle sessions are reaped after this long with no user message.
const IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const REAP_SWEEP_INTERVAL: Duration = Duration::from_secs(30);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

/// If a turn produces no stdout activity for this long, the session emits
/// a friendly stall error and turn_end instead of hanging the SSE stream.
const STALL_TIMEOUT: Duration = Duration::from_secs(120);
const WATCHDOG_POLL_INTERVAL: Duration = Duration::from_secs(5);

struct SessionHandle {
    sse_tx: broadcast::Sender<SseEvent>,
    command_tx: mpsc::UnboundedSender<String>,
    last_activity: Mutex<Instant>,
}

#[derive(Clone)]
pub struct SessionStore {
    sessions: Arc<Mutex<HashMap<Uuid, Arc<SessionHandle>>>>,
    config: Arc<StartupConfig>,
}

pub enum SendError {
    UnknownSession,
    ChildUnavailable,
}

impl SessionStore {
    pub fn new(config: Arc<StartupConfig>) -> Self {
        Self { sessions: Arc::new(Mutex::new(HashMap::new())), config }
    }

    /// Creates a new session: spawns its first child and its actor task,
    /// and registers it. Returns the new session id.
    pub async fn create(&self) -> Uuid {
        let session_id = Uuid::new_v4();
        let (sse_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        let handle = Arc::new(SessionHandle {
            sse_tx: sse_tx.clone(),
            command_tx,
            last_activity: Mutex::new(Instant::now()),
        });
        self.sessions.lock().await.insert(session_id, handle);

        let child_config = self.config.child_config(session_id);
        let turn_mode = self.config.turn_mode;
        tokio::spawn(run_session_actor(session_id, child_config, turn_mode, sse_tx, command_rx));

        session_id
    }

    /// Subscribes to a session's SSE stream. `None` if the session does not
    /// exist.
    pub async fn subscribe(&self, session_id: Uuid) -> Option<broadcast::Receiver<SseEvent>> {
        let sessions = self.sessions.lock().await;
        sessions.get(&session_id).map(|h| h.sse_tx.subscribe())
    }

    /// Queues a user message for the session's actor to send to its child.
    pub async fn send_message(&self, session_id: Uuid, text: String) -> Result<(), SendError> {
        let sessions = self.sessions.lock().await;
        let handle = sessions.get(&session_id).ok_or(SendError::UnknownSession)?;
        *handle.last_activity.lock().await = Instant::now();
        handle.command_tx.send(text).map_err(|_| SendError::ChildUnavailable)
    }

    pub async fn exists(&self, session_id: Uuid) -> bool {
        self.sessions.lock().await.contains_key(&session_id)
    }

    /// Every `REAP_SWEEP_INTERVAL`, evicts sessions idle past
    /// `IDLE_TIMEOUT`. Eviction drops the last `command_tx` clone, which
    /// closes the actor's command channel and lets it shut its child down
    /// and exit (see `run_session_actor`).
    pub async fn run_reaper(self) {
        let mut interval = tokio::time::interval(REAP_SWEEP_INTERVAL);
        loop {
            interval.tick().await;
            let mut sessions = self.sessions.lock().await;
            let mut expired = Vec::new();
            for (id, handle) in sessions.iter() {
                if handle.last_activity.lock().await.elapsed() > IDLE_TIMEOUT {
                    expired.push(*id);
                }
            }
            for id in expired {
                tracing::info!(session_id = %id, "reaping idle session");
                sessions.remove(&id);
            }
        }
    }
}

/// A live child plus how many turns it has handled. `turns_sent` matters
/// only for `TurnMode::ResumePerTurn`, which needs to know whether the next
/// spawn is the session's first (`--session-id`) or a continuation
/// (`--resume`).
struct RunningChild {
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    turns_sent: u32,
}

/// Owns one session's child process lifecycle end to end: spawns the first
/// child, drives its stdout into `sse_tx`, applies commands from
/// `command_rx`, replies to control requests, and polls the stall
/// watchdog. Exits (and shuts any live child down) when `command_rx`
/// closes, which happens when the registry evicts this session.
///
/// The current child is `Option<RunningChild>`, not `RunningChild`,
/// because "no child right now" (startup failure, or a respawn that
/// failed) is a real state the actor must keep running through — the next
/// user message tries to spawn again rather than the actor being stuck
/// holding a half-moved-out value.
async fn run_session_actor(
    session_id: Uuid,
    child_config: ChildConfig,
    turn_mode: TurnMode,
    sse_tx: broadcast::Sender<SseEvent>,
    mut command_rx: mpsc::UnboundedReceiver<String>,
) {
    // `ready` is emitted per-subscriber at SSE-subscribe time (see
    // api.rs::stream_session), not here — broadcasting it before any
    // client has subscribed would send it to zero receivers and drop it,
    // since a fresh session's SSE connection is opened strictly after this
    // actor has already started.
    let watchdog = Arc::new(TurnWatchdog::new());
    let (control_tx, mut control_rx) = mpsc::unbounded_channel::<Value>();

    let mut current: Option<RunningChild> =
        match spawn_and_drive(&child_config, false, sse_tx.clone(), control_tx.clone(), watchdog.clone()) {
            Ok(running) => Some(running),
            Err(err) => {
                tracing::error!(%err, session_id = %session_id, "failed to spawn claude child");
                let _ = sse_tx.send(SseEvent::Error { message: format!("failed to start agent: {err}") });
                None
            }
        };

    let mut watchdog_poll = tokio::time::interval(WATCHDOG_POLL_INTERVAL);

    loop {
        tokio::select! {
            command = command_rx.recv() => {
                let Some(text) = command else { break };
                current = handle_send_message(
                    session_id, &child_config, turn_mode, current, &text, &sse_tx, &control_tx, &watchdog,
                ).await;
            }
            request_id = control_rx.recv() => {
                let Some(request_id) = request_id else { continue };
                if let Some(running) = current.as_mut() {
                    let reply = protocol::control_response_line(&request_id);
                    if let Err(err) = agent::send_raw(&mut running.stdin, &reply).await {
                        tracing::warn!(%err, session_id = %session_id, "failed to write control_response to claude stdin");
                    }
                }
            }
            _ = watchdog_poll.tick() => {
                if watchdog.check_stalled(STALL_TIMEOUT) {
                    tracing::warn!(session_id = %session_id, "turn stalled, surfacing friendly error");
                    let _ = sse_tx.send(SseEvent::Error {
                        message: "The agent stalled on this request. Try rephrasing.".to_owned(),
                    });
                    let _ = sse_tx.send(SseEvent::TurnEnd { cost_usd: 0.0, duration_ms: 0 });
                }
            }
        }
    }

    if let Some(running) = current {
        agent::shut_down(running.child, Some(running.stdin), SHUTDOWN_GRACE).await;
    }
}

async fn handle_send_message(
    session_id: Uuid,
    child_config: &ChildConfig,
    turn_mode: TurnMode,
    current: Option<RunningChild>,
    text: &str,
    sse_tx: &broadcast::Sender<SseEvent>,
    control_tx: &mpsc::UnboundedSender<Value>,
    watchdog: &Arc<TurnWatchdog>,
) -> Option<RunningChild> {
    match turn_mode {
        TurnMode::Keepalive => match current {
            Some(mut running) => {
                if agent::send_user_message(&mut running.stdin, text).await.is_ok() {
                    watchdog.start_turn();
                    running.turns_sent += 1;
                    return Some(running);
                }
                tracing::warn!(session_id = %session_id, "write to claude stdin failed, respawning child");
                agent::shut_down(running.child, None, SHUTDOWN_GRACE).await;
                respawn_and_send(child_config, false, 0, text, sse_tx, control_tx, watchdog).await
            }
            None => respawn_and_send(child_config, false, 0, text, sse_tx, control_tx, watchdog).await,
        },
        TurnMode::ResumePerTurn => {
            let turns_already_sent = match current {
                Some(running) => {
                    let turns_sent = running.turns_sent;
                    agent::shut_down(running.child, Some(running.stdin), SHUTDOWN_GRACE).await;
                    turns_sent
                }
                None => 0,
            };
            let resume = turns_already_sent > 0;
            respawn_and_send(child_config, resume, turns_already_sent, text, sse_tx, control_tx, watchdog).await
        }
    }
}

/// Spawns a fresh child and sends `text` as its first turn. Returns `None`
/// only if the spawn itself failed (the session then has no live child
/// until the next message tries again); a delivery failure after a
/// successful spawn still returns the running child.
async fn respawn_and_send(
    child_config: &ChildConfig,
    resume: bool,
    turns_already_sent: u32,
    text: &str,
    sse_tx: &broadcast::Sender<SseEvent>,
    control_tx: &mpsc::UnboundedSender<Value>,
    watchdog: &Arc<TurnWatchdog>,
) -> Option<RunningChild> {
    match spawn_and_drive(child_config, resume, sse_tx.clone(), control_tx.clone(), watchdog.clone()) {
        Ok(mut running) => {
            running.turns_sent = turns_already_sent;
            if let Err(err) = agent::send_user_message(&mut running.stdin, text).await {
                let _ = sse_tx.send(SseEvent::Error { message: format!("could not deliver message: {err}") });
            } else {
                watchdog.start_turn();
                running.turns_sent += 1;
            }
            Some(running)
        }
        Err(err) => {
            let _ = sse_tx.send(SseEvent::Error { message: format!("agent restart failed: {err}") });
            None
        }
    }
}

fn spawn_and_drive(
    child_config: &ChildConfig,
    resume: bool,
    sse_tx: broadcast::Sender<SseEvent>,
    control_tx: mpsc::UnboundedSender<Value>,
    watchdog: Arc<TurnWatchdog>,
) -> std::io::Result<RunningChild> {
    let child = agent::spawn_child(child_config, resume)?;
    let agent::ChildIo { child, stdin, stdout, stderr } =
        agent::take_io(child).ok_or_else(|| std::io::Error::other("child spawned without piped stdio"))?;

    tokio::spawn(agent::drain_stderr(stderr));
    tokio::spawn(stream::drive_child_stdout(stdout, control_tx, sse_tx, watchdog));

    Ok(RunningChild { child, stdin, turns_sent: 0 })
}
