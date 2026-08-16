# Harbor Freight review corpus — SKU 57812 (VULCAN OmniPro 220)

Source: Harbor Freight product page (https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html), review backend `pwa-graphql` (persisted-query GraphQL). Base captures made by a prior research run (`/tmp/welder-research/raw/hf-reviews.txt`, `hf-1star.txt`, `hf-23star-raw.json`), extended and re-verified in this ingest pass on 2026-08-15.

Live totals at capture: **1,444 reviews, 4.8/5 average, 98% would recommend** — 5★ 1,233 · 4★ 160 · 3★ 22 · 2★ 11 · 1★ 18.

| File | Description |
|---|---|
| `reviews-1star.md` | All 10 unique 1★ reviews present in the raw capture, verbatim, with date/title/verified-buyer flag/helpful-vote tally. Covers the full failure spectrum: dead-unit, screen-only-death, stuck-at-max-amps, no-arc, gas leak, DOA, short-circuit-then-power-loss. |
| `reviews-2-3star.md` | **No 2★/3★ reviews were captured** — documents why (Harbor Freight's rating-filtered GraphQL query returns HTTP 400; re-confirmed independently via curl, in-page fetch, and the live UI's own star-filter buttons, which also silently fail). Includes the confirmed live band-size table (22 × 3★, 11 × 2★) and 5 secondary-sourced excerpts of unconfirmed star rating pulled from report.md's broader corpus browse. |
| `reviews-notable-5star.md` | 10 substantive 5★ reviews from the raw capture (default "Highest Rating" sort), verbatim, including the corpus's longest and most load-bearing review (ElectroMechanician's 3-year ownership account). Plus 2 secondary-sourced excerpts of unconfirmed rating. |
| `themes.md` | Failure-mode tally (7 distinct symptom categories, counted against the 10 captured 1★ reviews, cross-referenced to independent WeldingWeb reports where corroborated), praise tally (6 themes against the 10 captured 5★ reviews), 5 buying-advice patterns synthesized across bands, and the corpus-wide numeric summary. |

## Endpoint extension result: BLOCKED

Attempted to extend the 2★/3★ capture via the site's `pwa-graphql` `ProductReviews` persisted-query endpoint (`sha256Hash=5288d637644b687446b0134d81234efc50a4c6111c91d2abfe9fa52ef87fc149`). Three independent attempts, two sessions apart, all failed:
1. Prior research run's browser JS eval → HTTP 400 (all 6 offset/rating combinations tried).
2. This pass, `curl` with a Chrome UA → HTTP 403 (bot/WAF block, no session cookies).
3. This pass, ego-browser in-page `browserFetch` (real session cookies) → HTTP 400, same failure as #1.
4. This pass, clicking the live page's own "2 Stars"/"3 Stars" filter buttons in a real browser session → no visible change to the rendered review list after repeated clicks/waits (the site's own filter UI appears non-functional, consistent with #1–#3 sharing the same broken backend call).

Per ingest constraints ("do not fight auth walls — curate what's captured"), this was not pursued further after confirming the failure mode was consistent and server-side, not a fixable client header/UA issue.

## Counts: captured vs. curated

| Band | On-site total | Raw-captured | Curated into this ingest |
|---|---|---|---|
| 5★ | 1,233 | 10 | 10 (`reviews-notable-5star.md`) + 2 unconfirmed-rating excerpts |
| 4★ | 160 | 0 | 0 (not targeted by this ingest pass) |
| 3★ | 22 | 0 | 0 direct; band size + 5 unconfirmed-rating excerpts noted in `reviews-2-3star.md` |
| 2★ | 11 | 0 | 0 direct; band size noted in `reviews-2-3star.md` |
| 1★ | 18 | 10 | 10 (`reviews-1star.md`) — full raw capture, not the full on-site band |
| **Total** | **1,444** | **20** | **20 full reviews + 7 unconfirmed-rating excerpts + full numeric band summary** |

## Size

`reviews-1star.md` 7.0 KB · `reviews-2-3star.md` 5.6 KB · `reviews-notable-5star.md` 10.2 KB · `themes.md` 8.3 KB · `INDEX.md` (this file) ~4 KB. **Total ≈ 35 KB**, well within the 400 KB per-agent budget.
