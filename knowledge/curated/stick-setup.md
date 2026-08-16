# Stick (SMAW) Setup — Vulcan OmniPro 220

Stick welding uses a **Stick Electrode without shielding gas**, for mild steel and stainless steel. Deep penetration, good for thicker material and outdoor/windy conditions, forgiving of rust/mill scale, but requires higher skill and produces slag that must be cleaned. [owner-manual p.28; selection-chart p.1]

## Polarity / cable connections

| Cable | Socket |
|---|---|
| **Ground Clamp Cable** | **NEGATIVE Socket** |
| **Electrode Holder Cable** | **POSITIVE Socket** |

Twist both clockwise all the way to lock in place. Directly labeled on the Stick cable-setup diagram [owner-manual p.27, figure `pages/owner-manual-p27.png`] and confirmed in text: "1. Plug Ground Clamp Cable into Negative Socket... 2. Plug Electrode Holder Cable into Positive Socket." [owner-manual p.27]

This is the **opposite** socket assignment from TIG welding (Ground Clamp → Positive for TIG; see `tig-setup.md`).

## No gas required

Stick welding needs no shielding gas connection — the electrode's flux coating shields the arc. [selection-chart p.1 "NO-GAS REQUIRED"]

## LCD settings workflow

1. Home Button → turn Main Control Knob to Stick → press to select. [owner-manual p.32]
2. Polarity Setting: plug cables per on-screen diagram.
3. Set Electrode type via Main Control Knob.
4. Left Knob = Electrode Diameter, Right Knob = Material Thickness.
5. Auto Weld Settings: Left Knob = output amperage, Right Knob = ON to energize the Electrode Holder. **Warning: welder is now energized and Open Circuit Voltage is present.** [owner-manual p.32]
6. Optional Settings: Hot Start (adjust start-of-weld amperage), Arc Force (adjust penetration/smoothness), Recall Setting, Save Setting (5 slots). [owner-manual p.33]

## Welding procedure

Place the bare-metal end of the Stick Electrode in the Electrode Holder jaws. Ignite the arc by tapping, stroking, or striking the surface like a match. After ignition: lift the electrode off the workpiece by roughly the diameter of the bare metal end, tilt the electrode back 10–20°, and drag it to the back of the weld puddle to deposit material. When finished, lift the electrode, set the holder on a nonconductive/nonflammable surface, and turn the Power Switch OFF. [owner-manual p.33]

## Duty cycle

See `duty-cycle.md` — Stick 240V: 25% @ 175A / 100% continuous @ 100A (2.5 min welding / 7.5 min resting per 10 min). Stick 120V: 40% @ 80A / 100% continuous @ 60A (4 min welding / 6 min resting). [owner-manual p.7, p.29]

## Weld cleaning

Stick welds are covered by slag until cleaned — remove with a Chipping Hammer, then a Wire Brush (an angle grinder, sold separately, can also shape the weld). [owner-manual p.34, p.40]

## Weld diagnosis — Porosity

**Stick Weld – Porosity**: "Small cavities or holes in the bead." Depicted as a line-art top-view diagram (verified via direct vision inspection — NOT a photograph), using the same small-scattered-dot visual convention as MIG/wire-weld porosity — roughly 15–25 small irregular dots/ovals (~5–15% of bead width) scattered pseudo-randomly across the bead. [owner-manual p.40, figure `pages/owner-manual-p40.png`]

Causes and fixes:
1. Dirty workpiece or fill material → clean workpiece to bare metal; ensure fill material and electrode are clean/free of oil, coatings, residues.
2. Inconsistent welding speed → maintain steady weld speed.
[owner-manual p.40]

## Safety

Do not weld without the Grounding Clamp attached. When not holding the Electrode Holder, rest it on a nonconductive, nonflammable surface. [owner-manual p.32]
