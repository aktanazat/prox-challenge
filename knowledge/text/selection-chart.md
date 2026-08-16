# Process Selection Chart — Vulcan OmniPro 220 (Item 57812)

Source: `files/selection-chart.pdf` (1 page, 1200×1200pt / 5000×5000px at 300 DPI). **This PDF has NO extractable text layer — it is a single scanned/flattened image (Photoshop export).** `pdf-goat text` returns 0 characters. All content below is **TRANSCRIBED FROM IMAGE** via direct vision inspection of the full-page render (`knowledge/pages/selection-chart-p01.png`) and nine overlapping 3×3 grid crop tiles (`knowledge/pages/crops/selection-chart-r{1-3}c{1-3}.png`, ~8% overlap, used because the source image is too dense to read reliably in one pass).

**Content type correction:** despite the filename, this is **not** the amperage/wire-speed/gas-flow settings chart referenced elsewhere in the manual as being "on the inside of the Welder door" (that settings chart is not present in these three source files — see `knowledge/curated/settings-charts.md` for what IS available). This PDF is a **"HOW TO CHOOSE A WELDER" buyer's decision-guide infographic** comparing four welding processes side by side.

## Layout

One large grid: a header banner, 6 numbered question rows (left label column) × 4 process columns (FLUX-CORED/FCAW, MIG/GMAW, STICK/SMAW, TIG/GTAW), a bottom row of 4 black process-summary cards, and a right-hand sidebar with a MIG-vs-Flux-Cored checklist table and a Duty Cycle Example clock graphic.

## Header

- Title: **"HOW TO CHOOSE A WELDER"**
- Red banner: **"IMPORTANT! IDENTIFY YOUR INPUT VOLTAGE: DO YOU HAVE 120 VOLT OR 240 VOLT?"**

## Main 6-row comparison table

| Question row | FLUX-CORED / FCAW | MIG / GMAW | STICK / SMAW | TIG / GTAW |
|---|---|---|---|---|
| **1. What is your skill level?** | LOW | MODERATE | HIGH | HIGH |
| **2. Will you need shielding gas?** | NO-GAS REQUIRED | GAS REQUIRED (indoor welding recommended) | NO-GAS REQUIRED | GAS REQUIRED |
| **3. What type of material will you be welding?** | Steel, Stainless Steel (only two confirmed for this column) | not fully captured — *illegible/uncertain* | not fully captured — *illegible/uncertain* | Steel, Stainless Steel, Chrome Moly → **DC TIG required**; Aluminum, Magnesium Alloys → **AC TIG required** |
| **4. What is your material thickness?** | 18 Gauge to 5/16" | 22 Gauge to 3/8" | 10 Gauge to 1/2" | 24 Gauge to 3/16" |
| **5. Typical applications** | Galvanized steel; Pipe and tubing; (additional items partially cropped, likely overlap with general fabrication) | General fabrication; Sheet metal; Maintenance & repair; (+1 more item not fully captured) | Structural steel; Tubing; Pressure vessels; Maintenance & repair; (+1 more item not fully captured) | Stainless steel exhausts; Bicycle frames; Thin wall pipe & tubing; Metal art |
| **6. How clean do you need your weld?** | SPATTER / MORE SPATTER (shown over a weld-bead photo) | MINIMAL SPATTER | CLEAN | EXTREMELY CLEAN |

*Note: Row 3 (material type) and some Row 5 bullet items for the FLUX-CORED/MIG/STICK columns could not be fully read even after targeted high-resolution crop inspection (crop-boundary cutoffs). The TIG column for Row 3 is fully legible and quoted above verbatim. Do not treat the missing cells as "no data" — they are physically present on the chart but unresolved at available render resolution.*

## "USE THIS WELDING PROCESS" — bottom summary cards

**FLUX-CORED / FCAW**
- Ideal for outdoor or windy conditions
- Forgiving on rusty or dirty steels
- Good out of position welding capabilities
- High deposition rates achievable

**MIG / GMAW**
- Fast production (high welding speeds)
- Easiest to learn
- Clean welds with no slag
- Better control on thin materials

**STICK / SMAW**
- Ideal for outdoor or windy conditions
- Forgiving on rusty or dirty steels
- Deep penetration
- Good choice for thicker materials

**TIG / GTAW**
- Highest quality welds
- Extremely aesthetic weld appearance
- Can be used on a variety of materials
- Precise control

## Right sidebar — "MIG or FLUX CORED?" checklist

Two columns, **MIG** and **FLUX CORED**, each row gets a checkmark under exactly one column:

| Row label (verbatim) | Checked column |
|---|---|
| Uses cored wire | FLUX CORED |
| Uses solid wire | MIG |
| Uses shielding gas | MIG |
| Clean welds, minimal spatter | MIG |
| Welds over mill scale and rust | FLUX CORED |
| Requires minimal surface prep | FLUX CORED |
| Can be used outdoor in windy conditions | FLUX CORED |
| Deep weld penetration / handles material gaps well | FLUX CORED |
| Thin materials like sheet metal | MIG |

*Transcription confidence: high for row labels and column headers; moderate for exact checkmark placement on 2 of the 9 rows due to pixelation at native resolution — cross-checked against the process-card bullet points above, which are consistent with this table.*

## Right sidebar — "Duty Cycle Example"

- Explanatory text: **"The Duty Cycle is the number of minutes, within a 10 minute period, a welding process can produce the specified welding current without overheating."**
- Worked example (clock graphic): **165 A @ 30% Duty Cycle → 3 Minutes Welding / 7 Minutes Resting** (per 10-minute period).

*Note: this example (165A/30%) is a generic illustrative duty-cycle example on the chart and does NOT correspond to a specific OmniPro 220 rated duty-cycle point from the owner's manual spec table (see `knowledge/curated/duty-cycle.md` for the machine's actual rated points, e.g. MIG 240V 200A = 25% duty cycle). Treat this chart's number only as an explanation of what "duty cycle" means, not as a spec for this machine.*
