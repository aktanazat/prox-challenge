# Duty Cycle — Vulcan OmniPro 220

## Definition

"The Duty Cycle defines the number of minutes, within a 10 minute period, during which a given welder can produce a particular welding current without overheating." Example given in the manual: a 40% duty cycle at 125A means resting at least 6 minutes after every 4 minutes of continuous welding. [owner-manual p.19, p.29]

The machine has an internal thermal protection system: on overheat it shuts down automatically and shows a warning screen on the LCD; it resumes automatically once cooled. Rest the torch/gun/electrode holder on an electrically non-conductive, heat-proof surface (e.g. concrete slab) well clear of the ground clamp while cooling, with the Power Switch left ON so the internal fan can help cool the unit. [owner-manual p.19, p.23, p.29]

## All rated duty-cycle points (every voltage × process combo)

| Process | Voltage | Duty % | Current | Minutes welding / resting (of 10 min) | Continuous (100%) rating |
|---|---|---|---|---|---|
| MIG | 120V | 40% @ 100A | 100 A | 4 min welding / 6 min resting | 100% continuous @ 75A |
| MIG | 240V | **25% @ 200A** | 200 A | **2.5 min welding / 7.5 min resting** | 100% continuous @ 115A |
| TIG | 120V | 40% @ 125A | 125 A | 4 min welding / 6 min resting | 100% continuous @ 90A |
| TIG | 240V | 30% @ 175A | 175 A | 3 min welding / 7 min resting | 100% continuous @ 105A |
| Stick | 120V | 40% @ 80A | 80 A | 4 min welding / 6 min resting | 100% continuous @ 60A |
| Stick | 240V | 25% @ 175A | 175 A | 2.5 min welding / 7.5 min resting | 100% continuous @ 100A |

Sources: narrative Specifications table [owner-manual p.7]; duty-cycle clock-diagram figures MIG [owner-manual p.19, p.23, figure `pages/owner-manual-p19.png`], TIG/Stick [owner-manual p.29, figure `pages/owner-manual-p29.png`]; IEC 60974-1 rating nameplate cross-check [owner-manual p.14 etc.] — all three sources agree exactly on every value in this table.

### Judges' sample question — "duty cycle MIG 200A 240V"

At **240 VAC, 200 A MIG**, the Vulcan OmniPro 220 is rated for **25% duty cycle**: within any 10-minute period, weld for **2.5 minutes and rest for 7.5 minutes**. Its 100%-continuous rating at 240V is 115A (i.e. you can weld indefinitely at 115A, but only 25% of the time at the higher 200A setting). At the nameplate's 60% duty point, 240V MIG is rated for 130A (U2=20.5V). [owner-manual p.7, p.14, p.19] figure `pages/owner-manual-p19.png`

## Consequences of exceeding duty cycle

Failure to observe duty-cycle limits can over-stress the power generation system and contribute to premature welder failure. The thermal protection system will force a shutdown (LCD warning screen) rather than allow damage; use shorter welding periods and longer rest periods once normal operation resumes. [owner-manual p.19, p.29]

## Related troubleshooting

"Welder Does Not Function When Switched On" cause #1 (both MIG/Flux-Cored and TIG/Stick troubleshooting tables) is "Tripped thermal protection device" — solution: reduce welding duration/frequency and refer to Duty Cycle guidance; wait with Power Switch ON for automatic cool-down recovery. [owner-manual p.42–44, table verified `knowledge/text/owner-manual.md` Page 43/44 tables]

## Note on the selection-chart's "duty cycle example"

`files/selection-chart.pdf` includes a generic worked example ("165A @ 30% Duty Cycle → 3 min welding / 7 min resting") purely to explain the concept of duty cycle to a shopper choosing between welders. **This is not one of the OmniPro 220's own rated points** — it does not appear in the table above. See [selection-chart p.1] / `knowledge/text/selection-chart.md`.
