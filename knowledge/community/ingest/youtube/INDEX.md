# YouTube ingest — Vulcan OmniPro 220

Auto-generated English captions (yt-dlp, `--write-auto-sub`) for 7 OmniPro 220 videos, cleaned into
timestamped transcripts, plus a per-video settings/quirks/mods/quotes summary. All captures 2026-08-15.
Two required videos ('Harbor Freight Welder Vulcan Omnipro 220// FLUX MIG STICK TIG' — the challenge-linked video — and
'MG #194 - long term review of the Vulcan Omnipro 220' — the long-term review) plus 5 more found via
`yt-dlp 'ytsearch12:vulcan omnipro 220 review'` (reviews/comparisons/setup, no shorts or unboxing-only videos).

## Files

| File | Description |
|---|---|
| `transcript-kxGDoGcnhBw.md` | Full transcript, "Harbor Freight Welder Vulcan Omnipro 220// FLUX MIG STICK TIG" (DIY PRO, 2023, 5:47) — challenge-linked video; timed setup runs for flux/MIG/stick/TIG. |
| `summary-kxGDoGcnhBw.md` | Settings/quirks/quotes for the above: synergic-preset thickness gap at 11ga, no HF TIG start. |
| `transcript-Ilzqb5FXi_k.md` | Full transcript, "MG #194 - long term review of the Vulcan Omnipro 220" (Merricks Garage, 2020, 8:24) — 18-month ownership review. |
| `summary-Ilzqb5FXi_k.md` | Settings/quirks/quotes: solenoid failure + warranty exchange, warranty eroding from 1yr/$789 to 90-day/$949 in real time. |
| `transcript-eG9vTJAMax0.md` | Full transcript, "Harbor Freight Welder Vulcan Omnipro 220 Review \| Best Welder For Beginners" (NightWrencher, 2021, 13:23). |
| `summary-eG9vTJAMax0.md` | Settings/quirks/quotes: menu walkthrough, insensitive MIG trigger, "incomplete machine" cost-stacking argument ($1,100 base → $1,500 all-in). |
| `transcript-Ma-YumFusnw.md` | Full transcript, "Vulcan OmniPro 220 Industrial Welder, An honest review." (All American Welding and Engineering, 2022, 8:39) — student welder's review. |
| `summary-Ma-YumFusnw.md` | Settings/quirks/quotes: stuck-mid-position power switch failure mode (community-sourced warning), plastic gun/consumables detail. |
| `transcript-T_QK9TukpQQ.md` | Full transcript, "The Vulcan Omnipro 220 vs The Titanium 200 Welder" (Redemption Garage, 2019, 13:49) — buying-decision/spec comparison. |
| `summary-T_QK9TukpQQ.md` | Settings/quirks/quotes: full duty-cycle spec table (220A/25% MIG, 175A/25% stick, 175A/30% TIG) vs. Titanium 200, Dinse-connector standard. |
| `transcript-hBnQfQA79WM.md` | Full transcript, "Harbor Freight Multi Process Welder \| Review of the Vulcan Omnipro 220" (John Bull Outdoors, 2023, 11:40) — beginner's first-use video. |
| `summary-hBnQfQA79WM.md` | Settings/quirks/quotes: beginner polarity-wiring mistake on flux core, 175A vs 125A stick bead comparison, thin instructions complaint. |
| `transcript-rwH3yoSHTmQ.md` | Condensed transcript (banter trimmed, technical content verbatim), "Here's What NO ONE Will Tell You About Harbor Freight's 'Best' Welders...." (The Questionable Garage, 2022, 33:59) — 3-way shootout vs. Millermatic 211 and Lincoln Pro MIG 180 with a guest pro welder. |
| `summary-rwH3yoSHTmQ.md` | Settings/quirks/quotes: inverter-vs-transformer engineering explainer, pre/post-flow gas behavior unique among the three machines, Tweco-compatible consumables, guest pro's verdict. |
| `comments-mined.md` | Curated YouTube comment quotes mined from `/tmp/welder-research/raw/youtube.txt` (two *different*, previously-captured long-term-review videos: 7 Year Update and 2-Year Pros/Cons) — attributed by @handle and source video URL; not duplicated with the transcripts above. |

## Videos without usable captions

None — all 7 targeted videos had auto-generated English captions available and were successfully ingested.

## Method notes

- Captions pulled with `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt`.
- Raw VTT uses YouTube's rolling-caption format (each cue re-displays the prior line plus new words). Cleaned via
  a dedup pass that diffs each cue's growing caption line against the previous one and emits only the new words,
  bucketed into ~30-second (~60s for the 34-minute video, to respect the per-file size budget) timestamped
  paragraphs.
- The 34-minute shootout video (`rwH3yoSHTmQ`) was condensed — banter/intro sections summarized in brackets,
  all settings/technical/quote content kept verbatim — to stay near the ~2,500-word per-file budget; full raw
  auto-captions remain fetchable from the video URL if a future pass needs 100% verbatim coverage.
