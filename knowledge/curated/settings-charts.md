# Settings Charts — Vulcan OmniPro 220

## Important scope note

The owner's manual repeatedly refers to a **"Settings Chart" on the inside of the Welder door/top of the Welder** as the authoritative source for shielding-gas type/flow (SCFH), tungsten electrode size, and per-material/thickness synergic wire-speed/voltage or amperage recommendations: e.g. "Determine which type of shielding gas would be appropriate... Refer to the Settings Chart on the inside of the Welder door" [owner-manual p.14]; "Consult Settings Chart, on top of Welder, to determine proper Tungsten Electrode size" [owner-manual p.26]; "Set Flow Gauge to SCFH value indicated on Settings Chart" [owner-manual p.21, p.30].

**This physical Settings Chart sticker is NOT one of the three source PDFs** (`owner-manual.pdf`, `quick-start-guide.pdf`, `selection-chart.pdf`). `selection-chart.pdf` is a *different* document — a "HOW TO CHOOSE A WELDER" buyer's decision guide, not a synergic parameter chart (see `knowledge/text/selection-chart.md` for full transcription and the correction). **Exact wire-speed/voltage-per-material-thickness synergic values and exact SCFH-per-gas-type values are not present anywhere in these three files.** Do not fabricate them.

## What IS available from these three files

### Gas flow (SCFH) ranges, by process (from LCD workflow steps, not a full chart)
- MIG: set SCFH between **20–30** on the Polarity/Gas settings screen. [owner-manual p.20]
- TIG: set SCFH between **10–25** on the Polarity/Gas settings screen. [owner-manual p.30]
- Flux-Cored / Stick: no gas required. [owner-manual p.13, p.32]

### Synergic auto-settings behavior (no numeric table, but the *mechanism* is documented)
On the MIG Auto Weld Settings LCD screen: Left Knob adjusts Wire Feed Speed (which the display also shows as Amperage), Right Knob adjusts Voltage; the display shows a **white tick mark** on the adjustment bar indicating the machine's own recommended synergic setting for the wire diameter + material thickness you selected — i.e. the machine computes its own synergic recommendation internally; the manual does not print the lookup table. [owner-manual p.20, figure `pages/owner-manual-p20.png`]

Wire-diameter/material-thickness and rod-diameter/material-thickness are set via the Left/Right knobs on dedicated screens before the Auto Weld Settings screen, for MIG, TIG, and Stick respectively. [owner-manual p.20, p.30, p.32]

### Feed roller ↔ wire size chart (the closest thing to a "settings chart" actually printed in these files)
| Feed Roller groove | Wire type | Size |
|---|---|---|
| V-groove | Solid Core | 0.025" |
| V-groove | Solid Core | 0.030" / 0.035" |
| Knurled groove | Flux-Cored | 0.030" / 0.035" |
| Knurled groove | Flux-Cored | 0.045" |
[owner-manual p.12, figure `pages/owner-manual-p12.png`]

### Wire feed tension settings
- Solid wire: tensioner setting **3–5**.
- Flux-cored wire: tensioner setting **2–3** (too much crushes flux-cored wire). [owner-manual p.15]

### Weldable wire/electrode capacity (from Specifications table)
- MIG solid core: 0.025" / 0.030" / 0.035"
- MIG flux cored: 0.030" / 0.035" / 0.045"
- Wire speed range: 50–500 IPM
[owner-manual p.7 — see `specs.md`]

### Selection-chart.pdf process-selection data (not a settings chart, but usable for process choice)
Material thickness ranges per process from the "HOW TO CHOOSE A WELDER" chart: Flux-Cored 18ga–5/16"; MIG 22ga–3/8"; Stick 10ga–1/2"; TIG 24ga–3/16". [selection-chart p.1 — full transcription in `knowledge/text/selection-chart.md`]

## What is explicitly NOT available (do not invent)
- Exact SCFH per specific gas blend (e.g. C25 vs 100% CO2 vs Tri-Mix).
- Exact wire-feed-speed (IPM) and voltage numbers per material-thickness/wire-diameter combination (the synergic lookup table itself).
- Exact tungsten electrode diameter per material thickness for TIG.
- The physical door-sticker Settings Chart image/layout.

If a user question requires one of these missing exact values, say so explicitly rather than guessing — recommend consulting the physical Settings Chart on the welder itself.
