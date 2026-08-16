//! Resolves the `claude` binary, builds its argv per design.md, and spawns
//! one long-lived child process per browser session.
//!
//! ## Design deviation (see report): `--bare` dropped
//! design.md's baseline argv includes `--bare`. Live-tested against the
//! installed CLI (claude v2.1.219): with `--bare` and
//! `--tools Read,Grep,Glob`, the child's `system/init` message reports
//! `"tools":["Read"]` only — Grep and Glob are silently dropped, which
//! breaks this agent's whole reason for having those tools (grounding
//! answers in the corpus via search, not just single-file reads). Without
//! `--bare` but with `--setting-sources ""` instead, `system/init` reports
//! all three requested tools AND the hook/CLAUDE.md-discovery noise
//! `--bare` was meant to suppress does not appear either (both verified via
//! direct CLI invocation, see report). So this backend always passes
//! `--setting-sources ""` and never passes `--bare`, matching design.md's
//! own documented fallback ("If --bare breaks stream-json in practice, drop
//! --bare but add --setting-sources "" and keep --strict-mcp-config").
//!
//! ## Dual-mode auth
//! If `ANTHROPIC_API_KEY` is set (from `.env`), it is passed through to the
//! child's environment and the CLI authenticates with it. If absent, the
//! key is omitted from the child's environment entirely and the CLI falls
//! back to its own local login (OAuth/keychain, via `HOME`).
//!
//! ## Turn persistence — [INFERENCE], not live-verified
//! No working credential (API key or local OAuth) was available in this
//! environment (OAuth session expired; no ANTHROPIC_API_KEY provisioned),
//! so whether the child actually stays alive across multiple stdin turns
//! could not be observed end-to-end. Both strategies are implemented:
//! `keepalive` (default: one child per session, fed successive stdin
//! lines) and `resume` (spawn fresh per turn with `--resume <session_id>`,
//! selected via `VULCAN_TURN_MODE=resume`). See `sessions.rs` for how the
//! session actor picks between them.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::AsyncWriteExt;
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use uuid::Uuid;

/// Why the `claude` binary could not be located, with enough detail to
/// print a clear startup error listing every option that was tried.
#[derive(Debug)]
pub enum BinaryResolutionError {
    /// `$CLAUDE_BIN` was set but does not point at a file.
    EnvPathMissing { value: String },
    /// None of the three resolution strategies found a binary.
    NotFound { vendored_path: PathBuf, platform: String },
}

impl std::fmt::Display for BinaryResolutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EnvPathMissing { value } => {
                write!(f, "$CLAUDE_BIN is set to '{value}' but that path does not exist")
            }
            Self::NotFound { vendored_path, platform } => write!(
                f,
                "could not locate the claude CLI binary. Tried, in order:\n  \
                 1. $CLAUDE_BIN (not set)\n  \
                 2. {} (platform detected as '{platform}')\n  \
                 3. `claude` on $PATH (not found)\n\
                 Fix one of: set CLAUDE_BIN=/path/to/claude, run `npm install` to vendor \
                 @anthropic-ai/claude-agent-sdk-{platform}, or install the claude CLI globally.",
                vendored_path.display(),
            ),
        }
    }
}

impl std::error::Error for BinaryResolutionError {}

/// Resolution order per design.md: `$CLAUDE_BIN` env var, then the vendored
/// platform-specific npm package under `node_modules/`, then `claude` on
/// `$PATH`.
pub fn resolve_claude_binary(repo_root: &Path) -> Result<PathBuf, BinaryResolutionError> {
    if let Ok(value) = std::env::var("CLAUDE_BIN") {
        let path = PathBuf::from(&value);
        return if path.is_file() { Ok(path) } else { Err(BinaryResolutionError::EnvPathMissing { value }) };
    }

    let platform = platform_triple();
    let vendored_path =
        repo_root.join("node_modules").join(format!("@anthropic-ai/claude-agent-sdk-{platform}")).join("claude");
    if vendored_path.is_file() {
        return Ok(vendored_path);
    }

    if let Some(on_path) = find_on_path("claude") {
        return Ok(on_path);
    }

    Err(BinaryResolutionError::NotFound { vendored_path, platform })
}

/// `<os>-<arch>` (plus a `-musl` suffix on musl targets), matching the
/// `@anthropic-ai/claude-agent-sdk-*` npm package naming: `darwin-arm64`,
/// `darwin-x64`, `linux-x64`, `linux-arm64`, `linux-x64-musl`,
/// `linux-arm64-musl`.
fn platform_triple() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };
    let musl_suffix = if cfg!(target_env = "musl") { "-musl" } else { "" };
    format!("{os}-{arch}{musl_suffix}")
}

fn find_on_path(binary_name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var).find_map(|dir| {
        let candidate = dir.join(binary_name);
        candidate.is_file().then_some(candidate)
    })
}

/// Turn-persistence strategy, controlled by `VULCAN_TURN_MODE`. See module
/// docs: `Keepalive` is live-verified-accepted-but-not-live-verified-alive;
/// `ResumePerTurn` is the design.md documented fallback, implemented but
/// unexercised end-to-end for the same reason.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnMode {
    Keepalive,
    ResumePerTurn,
}

impl TurnMode {
    pub fn from_env() -> Self {
        match std::env::var("VULCAN_TURN_MODE").as_deref() {
            Ok("resume") => Self::ResumePerTurn,
            _ => Self::Keepalive,
        }
    }
}

/// Everything needed to spawn (or respawn, for `ResumePerTurn`) a child for
/// one session.
pub struct ChildConfig {
    pub claude_bin: PathBuf,
    pub knowledge_dir: PathBuf,
    pub system_prompt: String,
    pub model: String,
    pub session_id: Uuid,
    pub anthropic_api_key: Option<String>,
    pub claude_config_dir: PathBuf,
}

/// Spawns the child for the first turn of a session (`Keepalive`) or for
/// every turn (`ResumePerTurn`, pass `resume = true` from the second call
/// on).
pub fn spawn_child(config: &ChildConfig, resume: bool) -> std::io::Result<Child> {
    let mut cmd = Command::new(&config.claude_bin);
    cmd.arg("--print")
        .arg("--verbose")
        .arg("--input-format")
        .arg("stream-json")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--include-partial-messages")
        .arg("--permission-mode")
        .arg("bypassPermissions")
        .arg("--allow-dangerously-skip-permissions")
        .arg("--tools")
        .arg("Read,Grep,Glob")
        .arg("--strict-mcp-config")
        .arg("--setting-sources")
        .arg("")
        .arg("--system-prompt")
        .arg(&config.system_prompt)
        .arg("--model")
        .arg(&config.model)
        .arg("--prompt-suggestions")
        .arg("true");

    if resume {
        cmd.arg("--resume").arg(config.session_id.to_string());
    } else {
        cmd.arg("--session-id").arg(config.session_id.to_string()).arg("--no-session-persistence");
    }

    cmd.current_dir(&config.knowledge_dir);
    cmd.env_clear();
    if let Some(path) = std::env::var_os("PATH") {
        cmd.env("PATH", path);
    }
    if let Some(home) = std::env::var_os("HOME") {
        cmd.env("HOME", home);
    }
    if let Some(key) = &config.anthropic_api_key {
        cmd.env("ANTHROPIC_API_KEY", key);
    }
    if resume {
        // --resume needs session persistence enabled and its own config
        // dir so per-turn respawns don't collide with the user's real
        // `claude` CLI history.
        cmd.env("CLAUDE_CONFIG_DIR", &config.claude_config_dir);
    }

    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.spawn()
}

/// Drains a child's stderr to `tracing::debug`, line by line, until the
/// stream closes. Intended to run as its own task for the child's lifetime.
pub async fn drain_stderr(stderr: tokio::process::ChildStderr) {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut lines = BufReader::new(stderr).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => tracing::debug!(target: "claude_child_stderr", "{line}"),
            Ok(None) => break,
            Err(err) => {
                tracing::debug!(%err, "error reading claude child stderr, stopping drain");
                break;
            }
        }
    }
}

/// Writes one already-formatted NDJSON line (with trailing newline) to the
/// child's stdin and flushes it. The single write path used for both user
/// turns and control-request acknowledgements, so writes are never
/// interleaved out of order.
pub async fn send_raw(stdin: &mut ChildStdin, line: &str) -> std::io::Result<()> {
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await
}

/// Writes one user turn to the child's stdin.
pub async fn send_user_message(stdin: &mut ChildStdin, text: &str) -> std::io::Result<()> {
    send_raw(stdin, &crate::protocol::user_message_line(text)).await
}

/// Closes stdin, then waits up to `grace` for exit before SIGTERM, then up
/// to `grace` again before SIGKILL. Per design.md's reaper contract.
pub async fn shut_down(mut child: Child, mut stdin: Option<ChildStdin>, grace: std::time::Duration) {
    drop(stdin.take());
    if tokio::time::timeout(grace, child.wait()).await.is_ok() {
        return;
    }
    if let Some(pid) = child.id() {
        // SAFETY: sending SIGTERM to a PID we own (our own child process).
        unsafe {
            libc_kill(pid as i32, 15);
        }
    }
    if tokio::time::timeout(grace, child.wait()).await.is_ok() {
        return;
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

// A single libc `kill` call for graceful SIGTERM; avoids pulling in the
// `libc` or `nix` crates for one syscall (not in design.md's dependency
// list). `tokio::process::Child::kill` only sends SIGKILL, so this is the
// smallest way to get a real SIGTERM step in the shutdown ladder.
unsafe extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
unsafe fn libc_kill(pid: i32, sig: i32) {
    unsafe {
        let _ = kill(pid, sig);
    }
}

/// Standard child stdio handles bundled together for callers that want to
/// hand them off to separate reader/writer tasks.
pub struct ChildIo {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: tokio::process::ChildStderr,
}

pub fn take_io(mut child: Child) -> Option<ChildIo> {
    let stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take()?;
    Some(ChildIo { child, stdin, stdout, stderr })
}

/// Environment presented to the process at startup, resolved once. Kept
/// small and total: every field is either present with a valid value or
/// the process refuses to start with a clear error (binary resolution) —
/// no `Option<PathBuf>` for "maybe we can't find claude" floating around
/// after startup.
pub struct StartupConfig {
    pub claude_bin: PathBuf,
    pub port: u16,
    pub model: String,
    pub turn_mode: TurnMode,
    pub anthropic_api_key: Option<String>,
    pub repo_root: PathBuf,
    pub knowledge_dir: PathBuf,
    pub web_dir: PathBuf,
    pub system_prompt: String,
    pub claude_config_dir: PathBuf,
}

impl StartupConfig {
    pub fn load(repo_root: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let claude_bin = resolve_claude_binary(&repo_root)?;
        let port: u16 = std::env::var("VULCAN_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8317);
        let model = std::env::var("VULCAN_MODEL").unwrap_or_else(|_| "sonnet".to_owned());
        let turn_mode = TurnMode::from_env();
        let anthropic_api_key = std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.trim().is_empty());
        let knowledge_dir = repo_root.join("knowledge");
        let web_dir = repo_root.join("web");
        let system_prompt_path = repo_root.join("prompts").join("system.md");
        let system_prompt = std::fs::read_to_string(&system_prompt_path).map_err(|err| {
            format!("failed to read system prompt at {}: {err}", system_prompt_path.display())
        })?;
        let claude_config_dir = repo_root.join(".claude-sessions");
        Ok(Self {
            claude_bin,
            port,
            model,
            turn_mode,
            anthropic_api_key,
            repo_root,
            knowledge_dir,
            web_dir,
            system_prompt,
            claude_config_dir,
        })
    }

    pub fn child_config(&self, session_id: Uuid) -> ChildConfig {
        ChildConfig {
            claude_bin: self.claude_bin.clone(),
            knowledge_dir: self.knowledge_dir.clone(),
            system_prompt: self.system_prompt.clone(),
            model: self.model.clone(),
            session_id,
            anthropic_api_key: self.anthropic_api_key.clone(),
            claude_config_dir: self.claude_config_dir.clone(),
        }
    }
}

