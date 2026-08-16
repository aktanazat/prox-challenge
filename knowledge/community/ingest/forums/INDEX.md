# Forums ingest — condensed classic-forum thread captures

Condensed, provenance-tagged thread captures from classic welding/fabrication forums (not Reddit) for
the Vulcan OmniPro 220 community knowledge corpus (grep-retrieval, not narrative). 9 threads across 4
forums: WeldingWeb (6), NC4x4 (1), The Garage Journal (1), WeldingSite (1). Each `thread-<forum>-<id>.md`
file's `<id>` is the forum's own thread id from the source URL, so files can be cross-referenced back to
their URL. `wisdom.md` is a cross-forum tally of pro techniques, rules of thumb, and recurring diagnoses,
sourced from this directory's own threads (cross-referenced against the Reddit ingest's `themes.md` and
`/tmp/welder-research/report.md` where they independently corroborate a finding). All captures dated
2026-08-16.

## wisdom.md

Cross-forum pro-technique tally: duty-cycle pacing (with a professional welder's actual spec math),
CV/CC mode selection + the amps-down/WFS-down slow-weld trick, synergic-preset thickness gaps, TIG
arc-instability diagnostic order (including the faulty-helmet story), no-arc/gas-flows/wire-feeds fault
isolation, current-sensor "reading way more amps than dialed in" failure mode, DINSE parts sourcing,
an open-box-unit buying checklist, the generator-compatibility open question, and the Lincoln-210MP
lineage/warranty-economics buying logic.

## WeldingWeb — direct threads

- `thread-weldingweb-712532.md` — "Vulcan Omni Pro 220" — MIG synergic preset skips metal thicknesses
  (1/4"→3/8", no 5/16" step); consensus is a shared cross-brand limitation, build your own 3-tier chart.
- `thread-weldingweb-703797.md` — "Vulcan Omnipro 220 TIG problems" — pulsating/erratic TIG arc, resolved
  after 12 posts of elimination diagnostics as a faulty auto-darkening helmet, not the welder.
- `thread-weldingweb-709148.md` — "Omnipro 220 troubleshooting - help!" — display reads ~400A regardless
  of setting, instant burn-through even at 10A; resolved (at least once) by opening the case and blowing
  out dust; suspected loose/dusty Hall-effect current-sensor connection. Notes the OP repeated the exact
  same failure two years later in an unresolved 1-reply thread (WeldingWeb #715059), not separately
  ingested for lack of a real exchange.
- `thread-weldingweb-726145.md` — "won't arc anymore when MIG welding" — gas flows and wire feeds
  normally but no spark; resolved as a ground cable the OP had already (wrongly) certified as tight.
- `thread-weldingweb-701865.md` — "Vulcan OmniPro 220 Parts?" — sourcing missing power cord/ground/
  electrode-holder cables for an open-box unit; DINSE 35-70 connector confirmed generic and consistent
  across 2018–2024 production; a 2024 request for a replacement control board goes unanswered.
- `thread-weldingweb-702243.md` — "Multi Process Machine – any good for beginner?" — long buying-advice
  thread: Lincoln-210MP lineage, no-AC-TIG/lift-start tradeoffs, spool-gun gas-port quirk, HF repair-policy
  fine print, wire-feed-speed-runs-fast-by-design note; ends without a confirmed purchase from the OP.

## Other forums — direct threads

- `thread-nc4x4-195882.md` — "Vulcan Omnipro 220..anyone use it" (NC4x4) — the corpus's most precise
  professionally-sourced duty-cycle number (4 min good output out of 10 at 19V/40%/.035" wire) and the
  community arbitration around it; OP buys one; gets CV/CC-mode and amps-down/WFS-down slow-weld
  technique advice; 2023 revival closes with a brand-agnostic warranty-economics verdict.
- `thread-garagejournal-527846.md` — "Vulcan Omnipro 220 Welder" (The Garage Journal) — open-box/
  clearance-rack buying checklist (verify paperwork, inventory against the manual, check spool wear,
  test on a real continuous job); parts-availability is the thread's dominant worry; independent
  wire-feeder-dies-but-machine-still-runs field report.
- `thread-weldingsite-301.md` — "stick rod review" (WeldingSite) — one owner's (Gary Fowler)
  process-by-process review across 6010/7018/6013/FCAW/MIG/TIG; stick arc quality lags his Miller
  Dialarc 250 but MIG/FCAW/TIG "work as they should"; an on-topic generator question goes unanswered,
  consistent with the broader corpus's unresolved generator theme.

## Threads considered and skipped (no real exchange)

- WeldingWeb #715059, "Omnipro 220 not sensing current" — same OP and identical failure mode as
  `thread-weldingweb-709148.md`, but only 1 reply and no resolution; folded into that file's takeaway
  instead of a separate ingest file.
- `forum.weldingtipsandtricks.com` thread 13765 — a single post asking whether Jody Treadway has reviewed
  the OmniPro; zero replies in this capture. Not ingested; no exchange to condense.

## Provenance

All 9 threads fetched fresh 2026-08-16 via ego-browser (direct scraping is blocked on these sites for
non-browser clients). WeldingWeb's legacy `weldingweb.com/vbb/threads/<id>-<slug>` URLs (712532, 703797,
702243, 709148) now redirect to the current `www.weldingweb.com/threads/<id>` platform; all four were
re-fetched there to recover per-post author handles (the platform's opening post lacks a `data-content`
DOM attribute and required a body-text regex fallback to attribute correctly — see the extraction note
below). NC4x4 and The Garage Journal run the same forum platform and were fetched directly. WeldingSite
runs an older platform without exposed per-post usernames; its one ingested thread is a single-author
review diary (Gary Fowler, self-identified via his own signed follow-up posts) plus two unnamed replies.
712532/703797/702243/709148 were cross-checked against this session's own prior raw capture at
`/tmp/welder-research/raw/forums.txt` (author-less vBulletin-era scrape) and superseded by the freshly
re-fetched, fully-attributed versions used here. Pacing: ~1.4s between page navigations; memory checked
via `T.mem()` between batches, stayed at "ok" pressure throughout (peak ~5.9GB RSS against a 6GB
soft cap). No dead/blocked URLs encountered — every seed and search-derived candidate URL used in this
directory resolved successfully.
