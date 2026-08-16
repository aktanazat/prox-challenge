# Flux-Cored (Gasless) Setup — Vulcan OmniPro 220

Flux-cored wire welding uses **cored wire without shielding gas**, for mild steel and stainless steel — good for outdoor/windy conditions and more forgiving of rust/mill scale than MIG [selection-chart p.1]. [owner-manual p.18]

## Polarity: DCEN (Direct Current Electrode Negative)

| Cable | Socket |
|---|---|
| Ground Clamp Cable | **POSITIVE (+) Socket** |
| Wire Feed Power Cable | **NEGATIVE (–) Socket** |

Twist both cables clockwise all the way to lock in place. This is the **opposite** socket assignment from gas-shielded MIG (DCEP). [owner-manual p.13–14, figure `pages/owner-manual-p13.png` labeled "DCEN Flux-Cored (Gasless) Polarity Setup"]

Quick-start guide confirms: "Follow MIG cable setup but connect ground clamp to positive terminal and wire feed power to negative terminal" for flux-cored. [quick-start p.2]

## No gas required

Flux-cored (gasless) welding needs no shielding gas hookup — the flux core itself shields the weld pool. [owner-manual p.13, p.18; selection-chart p.1 "NO-GAS REQUIRED"]

## Wire, spool, and feed roller

Same physical wire-loading, feed-roller, and gun-cable-connection procedures as MIG — see `mig-setup.md` and `wire-feed.md`. Feed Roller: use the **knurled-groove** side (0.030"/0.035" or 0.045") for flux-cored wire, not the V-groove (solid-core) side. [owner-manual p.12]

Tensioner note: keep tension lower for flux-cored (spec: **2–3** on the tensioner scale, vs 3–5 for solid wire) — too much force will crush flux-cored wire and cause feeding issues. [owner-manual p.15]

## Technique

- Drag angle (gun tilted 0–15° in the direction of travel, i.e. trailing) is used for flux-cored without gas — opposite of the push angle used for gas-shielded MIG. [owner-manual p.22, figure `pages/owner-manual-p22.png`]
- CTWD ≤ 1/2".
- Slag forms over flux-cored welds (shields the weld from impurities during cooling) and must be removed with a Chipping Hammer + Wire Brush after welding — unlike gas-shielded MIG welds, which don't produce slag. [owner-manual p.36]

## Troubleshooting specific to flux-cored

From the MIG/Flux-Cored Troubleshooting table: "Welding Arc Not Stable" cause #6 "Incorrect polarity for process being run" → solution: "Ensure polarity is correct for operation: DCEP for MIG welding and DCEN for Flux-Cored self-shielded welding." [owner-manual p.42, table verified]

See `troubleshooting.md` for the full Porosity in the Weld Metal entry (cause #5 "Polarity is incorrect for the application" → "Check the polarity and ensure it is DCEP for MIG and DCEN for Flux-Cored").

## Weld diagnosis — Porosity (judges' sample question)

**Wire Weld – Porosity** (applies to both MIG and flux-cored wire welding, same diagnosis section): "Small cavities or holes in the bead." Depicted as a line-art top-view diagram (not a photograph) — a stylized rippled bead with roughly 10–15 small round white dots (each ~5–10% of the bead width) scattered irregularly across the bead surface. [owner-manual p.37, figure `pages/owner-manual-p37.png`, verified via direct vision inspection]

Possible causes and fixes:
1. Incorrect polarity → check that polarity is set correctly (DCEP for MIG, DCEN for Flux-Cored).
2. Insufficient shielding gas (MIG only) → increase gas flow; clean nozzle; maintain proper CTWD.
3. Incorrect shielding gas (MIG only) → use the gas type recommended by the wire supplier.
4. Dirty workpiece or welding wire → clean workpiece to bare metal; ensure wire is clean/free of oil, coatings, residues.
5. Inconsistent travel speed → maintain steady travel speed.
6. CTWD too long → reduce CTWD.
[owner-manual p.37]

The dedicated Troubleshooting-table "Porosity in the Weld Metal" entry (p.43) adds: check gas bottle isn't empty, check gas regulator flow, ensure gun isn't used too far from workpiece (CTWD), and that welding wire is clean/free of rust — see `troubleshooting.md` for the full table.
