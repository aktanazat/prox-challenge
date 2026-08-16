//! Wire protocol: messages exchanged with the `claude` child process, and the
//! frozen SSE event schema exposed to the frontend.
//!
//! The child's NDJSON stdout has no fixed schema we can trust byte-for-byte
//! (the SDK's exact shapes drift between versions), so [`parse_wire_line`]
//! extracts only the handful of fields this backend actually needs and
//! ignores everything else. It never panics: malformed JSON and unrecognized
//! message shapes are logged and skipped.

use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

/// A normalized event extracted from one line of the child's NDJSON stdout.
/// `None` from [`parse_wire_line`] means "nothing actionable on this line"
/// (unknown type, malformed JSON, or a recognized-but-inert message such as
/// `system/init` or a `tool_result` echo).
#[derive(Debug, Clone, PartialEq)]
pub enum ChildEvent {
    /// A `text_delta` chunk from the assistant's streamed prose/artifact text.
    TextDelta { text: String },
    /// Tool invocations pulled from a complete `assistant` message's
    /// `tool_use` content blocks, in the order they appear.
    ToolUses { calls: Vec<ToolCall> },
    /// Terminal `result` message for the turn.
    TurnResult { cost_usd: f64, duration_ms: u64, is_error: bool },
    /// A `prompt_suggestion` message (shape unverified upstream).
    PromptSuggestion { items: Vec<String> },
    /// A `control_request` the backend must acknowledge on stdin.
    ControlRequest { request_id: Value },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    pub name: String,
    pub detail: String,
}

/// Parses one line of child stdout. Never panics; returns `None` for blank,
/// malformed, unknown, or inert lines (logging as appropriate).
pub fn parse_wire_line(line: &str) -> Option<ChildEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let value: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(err) => {
            tracing::debug!(%err, raw = %line, "malformed NDJSON line from claude child, skipping");
            return None;
        }
    };
    let msg_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    match msg_type {
        "system" => {
            tracing::debug!(raw = %value, "system message from child (not forwarded)");
            None
        }
        "stream_event" => extract_text_delta(&value).map(|text| ChildEvent::TextDelta { text }),
        "assistant" => {
            let calls = extract_tool_calls(&value);
            if calls.is_empty() { None } else { Some(ChildEvent::ToolUses { calls }) }
        }
        "user" => {
            tracing::debug!(raw = %value, "user/tool_result echo from child (not forwarded)");
            None
        }
        "result" => Some(extract_turn_result(&value)),
        "prompt_suggestion" => Some(ChildEvent::PromptSuggestion { items: extract_suggestions(&value) }),
        "control_request" => {
            let request_id = value.get("request_id").cloned().unwrap_or(Value::Null);
            Some(ChildEvent::ControlRequest { request_id })
        }
        other => {
            tracing::debug!(msg_type = other, raw = %value, "unknown message type from child, skipping");
            None
        }
    }
}

/// `text_delta` text may appear nested under `event` (mirroring the raw
/// Anthropic stream shape) or flattened at the top level. Try both.
fn extract_text_delta(value: &Value) -> Option<String> {
    value
        .get("event")
        .and_then(text_from_delta_holder)
        .or_else(|| text_from_delta_holder(value))
}

fn text_from_delta_holder(holder: &Value) -> Option<String> {
    let delta = holder.get("delta")?;
    if delta.get("type").and_then(Value::as_str) != Some("text_delta") {
        return None;
    }
    delta.get("text").and_then(Value::as_str).map(str::to_owned)
}

fn extract_tool_calls(value: &Value) -> Vec<ToolCall> {
    let content = value
        .get("content")
        .or_else(|| value.get("message").and_then(|m| m.get("content")))
        .and_then(Value::as_array);
    let Some(blocks) = content else {
        return Vec::new();
    };
    blocks
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("tool_use"))
        .map(|block| {
            let name = block.get("name").and_then(Value::as_str).unwrap_or("").to_owned();
            let input = block.get("input");
            let detail = input
                .and_then(|i| i.get("file_path"))
                .and_then(Value::as_str)
                .or_else(|| input.and_then(|i| i.get("pattern")).and_then(Value::as_str))
                .unwrap_or("")
                .to_owned();
            ToolCall { name, detail }
        })
        .collect()
}

fn extract_turn_result(value: &Value) -> ChildEvent {
    let cost_usd = value
        .get("total_cost_usd")
        .and_then(Value::as_f64)
        .or_else(|| value.get("cost_usd").and_then(Value::as_f64))
        .unwrap_or(0.0);
    let duration_ms = value.get("duration_ms").and_then(Value::as_u64).unwrap_or(0);
    let is_error = value.get("is_error").and_then(Value::as_bool).unwrap_or(false);
    ChildEvent::TurnResult { cost_usd, duration_ms, is_error }
}

/// `prompt_suggestion` shape is unverified against a live turn (see
/// design.md). Logs the raw payload every time so a developer running with
/// `RUST_LOG=debug` can see the real shape and adjust the candidate keys
/// below if the SDK sends something this doesn't already handle.
fn extract_suggestions(value: &Value) -> Vec<String> {
    tracing::debug!(raw = %value, "prompt_suggestion payload (shape unverified upstream)");
    for key in ["suggestions", "items", "prompts"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            return items.iter().filter_map(Value::as_str).map(str::to_owned).collect();
        }
    }
    if let Some(s) = value.get("suggestion").and_then(Value::as_str) {
        return vec![s.to_owned()];
    }
    if let Some(s) = value.get("text").and_then(Value::as_str) {
        return vec![s.to_owned()];
    }
    Vec::new()
}

/// Serializes a user turn for the child's stdin, newline-terminated.
pub fn user_message_line(text: &str) -> String {
    let payload = serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": text },
    });
    format!("{payload}\n")
}

/// Serializes an auto-approval reply to a `control_request`, newline-terminated.
pub fn control_response_line(request_id: &Value) -> String {
    let payload = serde_json::json!({
        "type": "control_response",
        "request_id": request_id,
        "response": { "allowed": true },
    });
    format!("{payload}\n")
}

/// The frozen SSE event schema. `#[serde(tag = "type")]` makes every
/// variant's `type` discriminant part of the type itself — there is no way
/// to construct an `SseEvent` with a mismatched or missing `type` field.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum SseEvent {
    #[serde(rename = "ready")]
    Ready { session_id: Uuid },
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "artifact_start")]
    ArtifactStart { id: String, artifact_type: String, title: String },
    #[serde(rename = "artifact_delta")]
    ArtifactDelta { id: String, text: String },
    #[serde(rename = "artifact_end")]
    ArtifactEnd { id: String },
    #[serde(rename = "tool")]
    Tool { name: String, detail: String },
    #[serde(rename = "suggestions")]
    Suggestions { items: Vec<String> },
    #[serde(rename = "turn_end")]
    TurnEnd { cost_usd: f64, duration_ms: u64 },
    #[serde(rename = "error")]
    Error { message: String },
}

impl SseEvent {
    /// Renders the `data: <json>` payload for one SSE frame (without the
    /// trailing blank line, which the SSE transport layer adds).
    pub fn to_data(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|err| {
            tracing::error!(%err, "failed to serialize SseEvent, this is a bug");
            r#"{"type":"error","message":"internal serialization failure"}"#.to_owned()
        })
    }
}
