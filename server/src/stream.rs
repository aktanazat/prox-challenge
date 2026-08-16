//! Turns the child's NDJSON stdout into the frontend's SSE event stream.
//!
//! Two responsibilities live here because they're two halves of one
//! pipeline: [`drive_child_stdout`] reads lines and dispatches wire events,
//! and [`ArtifactParser`] is the incremental state machine that scans
//! `text_delta` text for the in-band `<antArtifact>` protocol (design.md
//! "In-band artifact protocol"). The parser is the one algorithmically
//! risky piece in this crate — see the unit tests at the bottom.

use crate::protocol::{self, ChildEvent, SseEvent, ToolCall};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

const OPEN_MARKER: &str = "<antArtifact";
const CLOSE_MARKER: &str = "</antArtifact>";

/// Parser state: either accumulating plain prose, or inside an artifact
/// body accumulating content for the artifact identified by `id`.
#[derive(Debug, Clone, PartialEq)]
enum ParserState {
    Prose,
    InArtifact { id: String },
}

/// Incremental scanner over a sequence of `text_delta` text chunks
/// (concatenated in arrival order) that splits the stream into prose and
/// `<antArtifact>` bodies. Holds back any text that could still be the
/// prefix of a not-yet-complete open/close tag, so a tag split across two
/// deltas is never emitted as prose or artifact content.
pub struct ArtifactParser {
    state: ParserState,
    buf: String,
    fallback_id_counter: u32,
}

impl ArtifactParser {
    pub fn new() -> Self {
        Self { state: ParserState::Prose, buf: String::new(), fallback_id_counter: 0 }
    }

    /// Feeds one `text_delta` chunk, returning the SSE events it produces.
    /// May produce zero events (if the chunk is entirely held back as a
    /// possible tag prefix) or several (prose, artifact_start, artifact
    /// delta, artifact_end, all in one call for a self-contained chunk).
    pub fn feed(&mut self, text: &str) -> Vec<SseEvent> {
        self.buf.push_str(text);
        let mut events = Vec::new();
        loop {
            let made_progress = match &self.state {
                ParserState::Prose => self.advance_prose(&mut events),
                ParserState::InArtifact { .. } => self.advance_artifact(&mut events),
            };
            if !made_progress {
                break;
            }
        }
        events
    }

    /// Call when the turn ends. Flushes whatever is left in the buffer: an
    /// unterminated artifact is closed with `artifact_end`, leftover prose
    /// (e.g. a `<antArt` prefix that never completed into a real tag) is
    /// emitted as `text_delta`. Resets to a fresh `Prose` state for the next
    /// turn.
    pub fn flush_at_turn_end(&mut self) -> Vec<SseEvent> {
        let mut events = Vec::new();
        match std::mem::replace(&mut self.state, ParserState::Prose) {
            ParserState::Prose => {
                if !self.buf.is_empty() {
                    events.push(SseEvent::TextDelta { text: std::mem::take(&mut self.buf) });
                }
            }
            ParserState::InArtifact { id } => {
                if !self.buf.is_empty() {
                    events.push(SseEvent::ArtifactDelta { id: id.clone(), text: std::mem::take(&mut self.buf) });
                }
                events.push(SseEvent::ArtifactEnd { id });
            }
        }
        self.buf.clear();
        events
    }

    /// Attempts one step of progress while in `Prose` state. Returns `true`
    /// if it should be called again (more of `self.buf` was consumed and
    /// there may be more to do), `false` if it consumed what it could and
    /// is now waiting for more input.
    fn advance_prose(&mut self, events: &mut Vec<SseEvent>) -> bool {
        let Some(open_at) = self.buf.find(OPEN_MARKER) else {
            // No full open marker. Hold back a possible split prefix at the
            // tail; emit everything before it as prose.
            let hold_from = partial_suffix_match(&self.buf, OPEN_MARKER);
            let prefix_end = hold_from.unwrap_or(self.buf.len());
            if prefix_end > 0 {
                events.push(SseEvent::TextDelta { text: self.buf[..prefix_end].to_owned() });
            }
            self.buf.drain(..prefix_end);
            return false;
        };

        let prefix = strip_trailing_fence(&self.buf[..open_at]);
        if !prefix.is_empty() {
            events.push(SseEvent::TextDelta { text: prefix.to_owned() });
        }

        let tag_body_start = open_at + OPEN_MARKER.len();
        let Some(close_at_rel) = self.buf[tag_body_start..].find('>') else {
            // Open tag itself is split across a chunk boundary. Hold back
            // from the marker onward.
            self.buf.drain(..open_at);
            return false;
        };
        let tag_attrs_end = tag_body_start + close_at_rel;
        let attrs = parse_attrs(&self.buf[tag_body_start..tag_attrs_end]);
        let id = attrs.get("identifier").cloned().unwrap_or_else(|| self.next_fallback_id());
        let artifact_type = attrs.get("type").cloned().unwrap_or_else(|| "text/plain".to_owned());
        let title = attrs.get("title").cloned().unwrap_or_default();
        events.push(SseEvent::ArtifactStart { id: id.clone(), artifact_type, title });
        self.buf.drain(..=tag_attrs_end);
        self.state = ParserState::InArtifact { id };
        true
    }

    /// Same contract as `advance_prose` but for `InArtifact` state.
    fn advance_artifact(&mut self, events: &mut Vec<SseEvent>) -> bool {
        let ParserState::InArtifact { id } = &self.state else {
            unreachable!("advance_artifact called outside InArtifact state");
        };
        let id = id.clone();

        let Some(close_at) = self.buf.find(CLOSE_MARKER) else {
            let hold_from = partial_suffix_match(&self.buf, CLOSE_MARKER);
            let content_end = hold_from.unwrap_or(self.buf.len());
            if content_end > 0 {
                events.push(SseEvent::ArtifactDelta { id, text: self.buf[..content_end].to_owned() });
            }
            self.buf.drain(..content_end);
            return false;
        };

        if close_at > 0 {
            events.push(SseEvent::ArtifactDelta { id: id.clone(), text: self.buf[..close_at].to_owned() });
        }
        events.push(SseEvent::ArtifactEnd { id });
        self.buf.drain(..close_at + CLOSE_MARKER.len());
        let stripped = strip_leading_fence(&self.buf);
        self.buf.drain(..self.buf.len() - stripped.len());
        self.state = ParserState::Prose;
        true
    }

    fn next_fallback_id(&mut self) -> String {
        self.fallback_id_counter += 1;
        format!("artifact-{}", self.fallback_id_counter)
    }
}

/// If `needle` is not fully present in `haystack`, but some suffix of
/// `haystack` is a proper (non-empty, non-full) prefix of `needle`, returns
/// the byte index where that suffix begins — the earliest point that must
/// be held back because more input could complete the marker. Returns
/// `None` if no suffix of `haystack` could ever start `needle`.
fn partial_suffix_match(haystack: &str, needle: &str) -> Option<usize> {
    let max_len = needle.len().saturating_sub(1).min(haystack.len());
    for len in (1..=max_len).rev() {
        let start = haystack.len() - len;
        // Only consider char-boundary-safe splits; the markers are ASCII so
        // any byte offset works, but stay defensive against non-ASCII text
        // preceding the candidate suffix.
        if !haystack.is_char_boundary(start) {
            continue;
        }
        if needle.starts_with(&haystack[start..]) {
            return Some(start);
        }
    }
    None
}

/// Strips one trailing markdown code fence line (```` ```lang\n ```` or
/// ```` ```\n ````) immediately preceding an open tag, if present.
fn strip_trailing_fence(prefix: &str) -> &str {
    let trimmed = prefix.strip_suffix('\n').unwrap_or(prefix);
    let Some(fence_start) = trimmed.rfind("```") else {
        return prefix;
    };
    let after_fence = &trimmed[fence_start + 3..];
    // Only a fence if everything after the backticks on that line is a bare
    // language token (or nothing) — i.e. no other content on the line.
    if after_fence.contains('\n') || after_fence.contains(char::is_whitespace) {
        return prefix;
    }
    trimmed[..fence_start].trim_end_matches('\n')
}

/// Strips one leading markdown code fence line immediately following a
/// close tag, if present.
fn strip_leading_fence(rest: &str) -> &str {
    let after_newline = rest.strip_prefix('\n').unwrap_or(rest);
    let Some(line_end) = after_newline.find('\n') else {
        if let Some(lang) = after_newline.strip_prefix("```") {
            if !lang.contains(char::is_whitespace) {
                return "";
            }
        }
        return rest;
    };
    let line = &after_newline[..line_end];
    if let Some(lang) = line.strip_prefix("```") {
        if !lang.contains(char::is_whitespace) {
            return &after_newline[line_end + 1..];
        }
    }
    rest
}

/// Parses `key="value"` / `key='value'` (and tolerates unquoted values)
/// pairs out of an antArtifact opening tag's attribute text. No regex
/// dependency in this crate, so this is a small hand-rolled scanner.
fn parse_attrs(attrs_text: &str) -> std::collections::HashMap<String, String> {
    let mut attrs = std::collections::HashMap::new();
    let chars: Vec<char> = attrs_text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        let key_start = i;
        while i < chars.len() && chars[i] != '=' && !chars[i].is_whitespace() {
            i += 1;
        }
        let key: String = chars[key_start..i].iter().collect();
        while i < chars.len() && (chars[i].is_whitespace() || chars[i] == '=') {
            if chars[i] == '=' {
                i += 1;
                break;
            }
            i += 1;
        }
        if key.is_empty() || i >= chars.len() {
            break;
        }
        let quote = chars[i];
        let value: String = if quote == '"' || quote == '\'' {
            i += 1;
            let value_start = i;
            while i < chars.len() && chars[i] != quote {
                i += 1;
            }
            let value: String = chars[value_start..i].iter().collect();
            if i < chars.len() {
                i += 1;
            }
            value
        } else {
            let value_start = i;
            while i < chars.len() && !chars[i].is_whitespace() {
                i += 1;
            }
            chars[value_start..i].iter().collect()
        };
        attrs.insert(key, value);
    }
    attrs
}

/// Tracks whether a turn is in flight and when the last stdout event
/// arrived, so a watcher (see `sessions.rs`) can detect a child that has
/// gone silent mid-turn and surface a friendly stall error instead of
/// hanging the SSE stream forever.
pub struct TurnWatchdog {
    epoch: Instant,
    last_event_nanos: std::sync::atomic::AtomicU64,
    turn_active: AtomicBool,
}

impl TurnWatchdog {
    pub fn new() -> Self {
        Self { epoch: Instant::now(), last_event_nanos: std::sync::atomic::AtomicU64::new(0), turn_active: AtomicBool::new(false) }
    }

    fn record_now(&self) {
        let nanos = self.epoch.elapsed().as_nanos().min(u64::MAX as u128) as u64;
        self.last_event_nanos.store(nanos, Ordering::SeqCst);
    }

    /// Called by the session actor right after it writes a user turn to
    /// stdin.
    pub fn start_turn(&self) {
        self.record_now();
        self.turn_active.store(true, Ordering::SeqCst);
    }

    fn touch(&self) {
        self.record_now();
    }

    fn end_turn(&self) {
        self.turn_active.store(false, Ordering::SeqCst);
    }

    /// If a turn has been active for longer than `stall_after` with no
    /// stdout activity, marks it no longer active (so this fires at most
    /// once per stall) and returns `true`.
    pub fn check_stalled(&self, stall_after: Duration) -> bool {
        if !self.turn_active.load(Ordering::SeqCst) {
            return false;
        }
        let last_nanos = self.last_event_nanos.load(Ordering::SeqCst);
        let elapsed = self.epoch.elapsed().saturating_sub(Duration::from_nanos(last_nanos));
        if elapsed > stall_after {
            self.turn_active.store(false, Ordering::SeqCst);
            true
        } else {
            false
        }
    }
}

/// Reads the child's NDJSON stdout line by line, dispatches each parsed
/// [`ChildEvent`] through the artifact parser / straight to SSE, and
/// forwards `control_request` acknowledgements to `control_tx` (the
/// session actor owns the stdin writer and applies them there — see
/// `sessions.rs`). Runs until stdout closes (child exited).
pub async fn drive_child_stdout(
    stdout: tokio::process::ChildStdout,
    control_tx: mpsc::UnboundedSender<Value>,
    sse_tx: tokio::sync::broadcast::Sender<SseEvent>,
    watchdog: std::sync::Arc<TurnWatchdog>,
) {
    let mut reader = BufReader::new(stdout).lines();
    let mut parser = ArtifactParser::new();
    loop {
        let line = match reader.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(err) => {
                tracing::warn!(%err, "error reading claude child stdout, stopping reader");
                break;
            }
        };
        let Some(event) = protocol::parse_wire_line(&line) else {
            continue;
        };
        watchdog.touch();
        match event {
            ChildEvent::TextDelta { text } => {
                for sse in parser.feed(&text) {
                    let _ = sse_tx.send(sse);
                }
            }
            ChildEvent::ToolUses { calls } => {
                for ToolCall { name, detail } in calls {
                    let _ = sse_tx.send(SseEvent::Tool { name, detail });
                }
            }
            ChildEvent::TurnResult { cost_usd, duration_ms, is_error } => {
                for sse in parser.flush_at_turn_end() {
                    let _ = sse_tx.send(sse);
                }
                if is_error {
                    let _ = sse_tx.send(SseEvent::Error { message: "turn ended with an error".to_owned() });
                }
                let _ = sse_tx.send(SseEvent::TurnEnd { cost_usd, duration_ms });
                watchdog.end_turn();
            }
            ChildEvent::PromptSuggestion { items } => {
                let _ = sse_tx.send(SseEvent::Suggestions { items });
            }
            ChildEvent::ControlRequest { request_id } => {
                let _ = control_tx.send(request_id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids_and_kinds(events: &[SseEvent]) -> Vec<&'static str> {
        events
            .iter()
            .map(|e| match e {
                SseEvent::Ready { .. } => "ready",
                SseEvent::TextDelta { .. } => "text_delta",
                SseEvent::ArtifactStart { .. } => "artifact_start",
                SseEvent::ArtifactDelta { .. } => "artifact_delta",
                SseEvent::ArtifactEnd { .. } => "artifact_end",
                SseEvent::Tool { .. } => "tool",
                SseEvent::Suggestions { .. } => "suggestions",
                SseEvent::TurnEnd { .. } => "turn_end",
                SseEvent::Error { .. } => "error",
            })
            .collect()
    }

    fn text_deltas(events: &[SseEvent]) -> Vec<String> {
        events
            .iter()
            .filter_map(|e| match e {
                SseEvent::TextDelta { text } => Some(text.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn plain_prose_passes_through_unchanged() {
        let mut p = ArtifactParser::new();
        let events = p.feed("Hello, this is just plain prose text.");
        assert_eq!(ids_and_kinds(&events), vec!["text_delta"]);
        assert_eq!(text_deltas(&events), vec!["Hello, this is just plain prose text."]);
    }

    #[test]
    fn split_open_tag_across_deltas_is_never_emitted_as_prose() {
        let mut p = ArtifactParser::new();
        let e1 = p.feed("Hello <antArt");
        assert_eq!(ids_and_kinds(&e1), vec!["text_delta"]);
        assert_eq!(text_deltas(&e1), vec!["Hello "]);

        let e2 = p.feed("ifact identifier=\"x\" type=\"text/html\" title=\"T\">content</antArtifact> world");
        assert_eq!(ids_and_kinds(&e2), vec!["artifact_start", "artifact_delta", "artifact_end", "text_delta"]);
        match &e2[0] {
            SseEvent::ArtifactStart { id, artifact_type, title } => {
                assert_eq!(id, "x");
                assert_eq!(artifact_type, "text/html");
                assert_eq!(title, "T");
            }
            other => panic!("expected artifact_start, got {other:?}"),
        }
        match &e2[1] {
            SseEvent::ArtifactDelta { id, text } => {
                assert_eq!(id, "x");
                assert_eq!(text, "content");
            }
            other => panic!("expected artifact_delta, got {other:?}"),
        }
        assert_eq!(text_deltas(&e2), vec![" world"]);
    }

    #[test]
    fn split_close_tag_across_deltas_holds_back_partial_content() {
        let mut p = ArtifactParser::new();
        let e1 = p.feed("<antArtifact identifier=\"a\" type=\"text/html\" title=\"T\">abc</antArt");
        assert_eq!(ids_and_kinds(&e1), vec!["artifact_start", "artifact_delta"]);
        match &e1[1] {
            SseEvent::ArtifactDelta { text, .. } => assert_eq!(text, "abc"),
            other => panic!("unexpected {other:?}"),
        }

        let e2 = p.feed("ifact>tail");
        assert_eq!(ids_and_kinds(&e2), vec!["artifact_end", "text_delta"]);
        assert_eq!(text_deltas(&e2), vec!["tail"]);
    }

    #[test]
    fn fenced_tag_is_stripped() {
        let mut p = ArtifactParser::new();
        let events = p.feed(
            "```\n<antArtifact identifier=\"a\" type=\"text/html\" title=\"T\">content</antArtifact>\n```\nmore text",
        );
        assert_eq!(ids_and_kinds(&events), vec!["artifact_start", "artifact_delta", "artifact_end", "text_delta"]);
        assert_eq!(text_deltas(&events), vec!["more text"]);
    }

    #[test]
    fn nested_angle_brackets_in_content_do_not_confuse_the_scanner() {
        let mut p = ArtifactParser::new();
        let events = p.feed(
            "<antArtifact identifier=\"a\" type=\"text/html\" title=\"T\"><div><span>hi</span></div></antArtifact>",
        );
        assert_eq!(ids_and_kinds(&events), vec!["artifact_start", "artifact_delta", "artifact_end"]);
        match &events[1] {
            SseEvent::ArtifactDelta { text, .. } => assert_eq!(text, "<div><span>hi</span></div>"),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn same_identifier_reused_is_forwarded_as_is_for_frontend_to_reconcile() {
        let mut p = ArtifactParser::new();
        let e1 = p.feed("<antArtifact identifier=\"same\" type=\"text/html\" title=\"T\">one</antArtifact>");
        let e2 = p.feed("<antArtifact identifier=\"same\" type=\"text/html\" title=\"T2\">two</antArtifact>");
        let id_of = |e: &SseEvent| match e {
            SseEvent::ArtifactStart { id, .. } => id.clone(),
            _ => panic!("expected artifact_start"),
        };
        assert_eq!(id_of(&e1[0]), "same");
        assert_eq!(id_of(&e2[0]), "same");
    }

    #[test]
    fn unterminated_artifact_flushed_at_turn_end() {
        let mut p = ArtifactParser::new();
        let start_events = p.feed("<antArtifact identifier=\"a\" type=\"text/html\" title=\"T\">partial content");
        assert_eq!(ids_and_kinds(&start_events), vec!["artifact_start", "artifact_delta"]);

        let flushed = p.flush_at_turn_end();
        assert_eq!(ids_and_kinds(&flushed), vec!["artifact_end"]);
        match &flushed[0] {
            SseEvent::ArtifactEnd { id } => assert_eq!(id, "a"),
            other => panic!("unexpected {other:?}"),
        }

        // Parser is reset and ready for the next turn.
        let events = p.feed("fresh prose");
        assert_eq!(ids_and_kinds(&events), vec!["text_delta"]);
    }

    #[test]
    fn incomplete_open_tag_prefix_flushed_as_prose_at_turn_end() {
        let mut p = ArtifactParser::new();
        let events = p.feed("some text then <antArt");
        assert_eq!(text_deltas(&events), vec!["some text then "]);

        let flushed = p.flush_at_turn_end();
        assert_eq!(ids_and_kinds(&flushed), vec!["text_delta"]);
        assert_eq!(text_deltas(&flushed), vec!["<antArt"]);
    }

    #[test]
    fn single_quoted_attrs_are_tolerated() {
        let mut p = ArtifactParser::new();
        let events = p.feed("<antArtifact identifier='a' type='text/html' title='T'>x</antArtifact>");
        match &events[0] {
            SseEvent::ArtifactStart { id, artifact_type, title } => {
                assert_eq!(id, "a");
                assert_eq!(artifact_type, "text/html");
                assert_eq!(title, "T");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn multiple_small_deltas_reassemble_correctly() {
        let mut p = ArtifactParser::new();
        let mut all = Vec::new();
        for chunk in [
            "before ",
            "<antArt",
            "ifact ident",
            "ifier=\"a\" typ",
            "e=\"text/html\" title=\"T\">",
            "chunk1",
            "chunk2</ant",
            "Artifact>",
            " after",
        ] {
            all.extend(p.feed(chunk));
        }
        assert_eq!(
            ids_and_kinds(&all),
            vec!["text_delta", "artifact_start", "artifact_delta", "artifact_delta", "artifact_end", "text_delta"]
        );
        assert_eq!(text_deltas(&all), vec!["before ", " after"]);
        let artifact_text: String = all
            .iter()
            .filter_map(|e| match e {
                SseEvent::ArtifactDelta { text, .. } => Some(text.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(artifact_text, "chunk1chunk2");
    }
}
