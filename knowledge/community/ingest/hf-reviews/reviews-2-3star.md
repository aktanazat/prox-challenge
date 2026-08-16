# Harbor Freight reviews — 2★/3★ band, SKU 57812 (VULCAN OmniPro 220)

## Status: NOT DIRECTLY CAPTURED — endpoint blocked

No raw 2★ or 3★ review text exists in `/tmp/welder-research/raw/`. `hf-23star-raw.json` is entirely failure output: 6 attempts (offsets 0/10/20 × rating 2 and rating 3) against Harbor Freight's review API, all `HTTP 400`:

```
GET https://www.harborfreight.com/pwa-graphql?operationName=ProductReviews
    &variables={"sku":"57812","filters":{"offset":0,"limit":10,"rating":2}}
    &extensions={"persistedQuery":{"version":1,"sha256Hash":"5288d637644b687446b0134d81234efc50a4c6111c91d2abfe9fa52ef87fc149"}}
→ HTTP 400 (persisted-query GraphQL call, all offset/rating combinations)
```

**Re-verification attempt, this ingest pass (2026-08-15, ego-browser session):**
1. Same GraphQL URL via `curl` with a real Chrome UA → **HTTP 403** (edge/WAF bot block on a bare `curl`, no cookies).
2. Same URL via ego-browser `browserFetch` (in-page, real session cookies) → **HTTP 400**, identical failure mode to the original capture.
3. Loaded the live product page in a real browser session, opened the Customer Reviews panel, and clicked the page's own **"2 Stars" / "3 Stars" filter buttons** (the UI control that presumably drives this same GraphQL call client-side) → **no observable change in the rendered review list** after repeated clicks and waits; the list stayed pinned to the default "Highest Rating" sort showing 5★ reviews. A follow-up attempt to open the "Sort By" dropdown hit a CDP input timeout.

Conclusion: this is not an auth wall to fight through — it looks like a genuinely broken/stale persisted-query hash on Harbor Freight's own review widget (their own UI's filter buttons don't visibly work either). Per ingest constraints, this was not pursued further. **Endpoint extension result: BLOCKED**, consistent across three independent attempts spanning two sessions.

## What we do have: confirmed band sizes (live page, 2026-08-15)

From the review-summary panel on the product page (`This item has an average rating of 4.8 stars from 1444 reviews`):

| Stars | Count | % of 1,444 |
|---|---|---|
| 5★ | 1,233 | 85.4% |
| 4★ | 160 | 11.1% |
| **3★** | **22** | **1.5%** |
| **2★** | **11** | **0.8%** |
| 1★ | 18 | 1.2% |
| 98% of reviewers would recommend | — | — |
| "What Customers Like Best" tags (100+ mentions each) | Easy to Use, Price, Quality, Features | — |

So the 2★/3★ band is small (33 reviews total, 2.3% of the corpus) even before accounting for capture failure — it was already the thinnest slice of the distribution, sandwiched between "it broke" (1★, captured in full in `reviews-1star.md`) and "it's fine, minor gripes" (4★, not separately targeted by this ingest).

## Secondary-sourced excerpts (star rating UNCONFIRMED — flagged per provenance policy)

`/tmp/welder-research/report.md` quotes several HF reviews pulled from a broader corpus browse during the original research pass that were **not** saved to a star-labeled raw file, so their exact rating is unknown. Content and tone (specific, substantive complaint about one feature, paired with continued/completed use of the machine rather than total failure or total praise) makes 2★–3★ the most plausible band for these three, but this is inference, not a captured fact — do not present it to end users as a confirmed star rating.

**"Bob", verified buyer, HF review, January 1, 2026 — TIG-aluminum expectation mismatch:**
> I was disappointed that this welder WILL NOT tig weld aluminum. You are forced to use a spool gun.

**HF review, January 3, 2023 — same theme, independent reviewer:**
> One of the reasons I purchased was to tig aluminum and It doesn't. It says it welds aluminum but it's only with a spool gun. Not what I wanted.

*(These two corroborate the single biggest "wish I knew before buying" theme in the whole knowledge base — see `../../../tig-reality.md` and report.md §1.5(a). Two independent reviewers hit the identical misunderstanding: TIG on this machine is DC-only, so aluminum TIG requires the spool gun, not the TIG torch.)*

**HF verified-buyer review, May 6, 2026 — UI/control-layout complaint:**
> I don't care for the user interface that much, not intuitive to me. Wish I could just roll the setting for the metal thickness alone without accidentally affecting the other settings. The controls are not designed for the way it is used, where the wire hardly ever changes and the change is always the thickness of the metal.

**HF review, June 2024, jobsite user — ground clamp comment (companion to the gun/tip-quality quote in `reviews-notable-5star.md`, same reviewer/date):**
> Ground clamp, minimal but adequate. Did get warm a number of times.

**HF review, undated — spool gun setup friction:**
> the connecting of the spool gun was a bit fiddly... it seems to do a good job with the presets but you will have to fine tune it. nothing about the setting of the gas (Argon) regulator in instructions — about 7 PSI seems good... the spool gun is OK but I would say not tough enough for daily shop use, good for an old guy that does small jobs now.

## Bottom line for the agent

Do not claim to have read the 2★/3★ band. If a user asks "what do the middling reviews say," the honest answer is: HF's own review API for this SKU currently 400s on rating-filtered queries (confirmed independently twice, six months apart), the on-page filter UI doesn't visibly work either, and the band is thin anyway (33 of 1,444 reviews). The closest substantiated signal for "moderate complaint, not total failure" content is the TIG-aluminum expectation-mismatch pattern (2 independent verified-buyer reports, `themes.md`) and the UI/control-layout complaint above.
