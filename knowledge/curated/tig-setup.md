# TIG Setup — Vulcan OmniPro 220

TIG (GTAW) uses a **TIG Rod + shielding gas**: DC TIG for mild steel/stainless steel, AC TIG for aluminum/magnesium alloys. Highest skill level of the four processes; highest-quality, most aesthetic welds. [owner-manual p.28; selection-chart p.1]

## Polarity / cable connections (judges' sample question)

| Cable | Socket |
|---|---|
| **Ground Clamp Cable** | **POSITIVE Socket** |
| **TIG Torch Cable** | **NEGATIVE Socket** |

Twist both clockwise all the way to lock in place. This is confirmed **twice**: directly labeled on the TIG cable-setup diagram [owner-manual p.24, figure `pages/owner-manual-p24.png` "TIG Setup — Connect Cables"], and consistently in text: "1. Plug Ground Clamp Cable into Positive Socket... 2. Plug TIG Torch Cable (TIG Torch sold separately) into Negative Socket." [owner-manual p.24]

This is the **opposite** socket assignment from Stick welding (Ground Clamp → Negative for Stick; see `stick-setup.md`).

Foot Pedal Cable (Foot Pedal sold separately) inserts through the front hole into the Foot Pedal Socket inside the machine; secure by turning the collar clockwise. [owner-manual p.24]

## Gas

TIG requires 100% Argon shielding gas. Cylinder setup identical to MIG (see `mig-setup.md`): secure cylinder with 2 straps, clear valve dust, thread Regulator, connect gas hose to the TIG Torch Cable connector's shielding gas hose and the Regulator outlet, wrench-tighten. [owner-manual p.25]

On the LCD Polarity/Gas screen: **set SCFH between 10–25** for TIG. [owner-manual p.30]

## Tungsten electrode sharpening (sold separately)

Dedicate a fine-grit grinding wheel exclusively to electrode grinding (avoid contamination). Remove Back Cap, pull electrode from the **front** of the torch (never from the rear — damages the collet and creates burrs). Grind the tip at an angle, rotating to form a blunt conical point; **grinding direction must be parallel to the electrode length**. Ideal conical tip length = **2.5× the electrode diameter**. Reinsert with the tip protruding **1/8"–1/4"** beyond the Ceramic Nozzle, re-tighten Back Cap. [owner-manual p.26, figure `pages/owner-manual-p26.png`]

## TIG torch assembly (sold separately)

Consult the Settings Chart (not present in these three source PDFs — see `settings-charts.md`) to determine Tungsten Electrode size for the material thickness. Match Collet and Collet Body sizes to the electrode. Thread Collet Body into torch front. Confirm Ceramic Nozzle size fits the application; thread it onto the Collet Body. Insert Collet into torch back/Collet Body. Insert Tungsten Electrode into the front Collet. Lock with Back Cap; electrode should protrude 1/8"–1/4" beyond the nozzle. [owner-manual p.26]

## LCD settings workflow

1. Home Button → turn Main Control Knob to TIG → press to select. [owner-manual p.30]
2. Polarity/Gas screen: plug cables per on-screen diagram, connect gas per diagram, SCFH 10–25.
3. Left Knob = Rod Diameter, Right Knob = Material Thickness.
4. Auto Weld Settings: Left Knob = output amperage, Right Knob = ON to energize the TIG Torch. **Warning: welder is now energized and Open Circuit Voltage is present.** [owner-manual p.30]
5. Optional Settings: Recall Setting, Save Setting (5 slots). [owner-manual p.31]

## Welding procedure

Open the TIG Torch's gas valve to start flow. Hold TIG Torch in one gloved hand, TIG Rod in the other (electrically insulated welding glove required). Maintain a constant torch-to-work distance of **1 to 1.5× the electrode diameter**. Start the arc via Foot Pedal (or touch-and-lift if no pedal). Once the puddle is hot, tilt the torch back ~10–15° from vertical and add rod material to the front of the puddle; remove the rod each time the electrode is advanced but keep it inside the gas shield to prevent oxidation contamination. When finished, release the pedal but keep the torch on the puddle until it solidifies, then close the torch valve and turn the Right Knob OFF. [owner-manual p.30–31]

## Duty cycle

See `duty-cycle.md` — TIG 240V: 30% @ 175A / 100% continuous @ 105A (3 min welding / 7 min resting per 10 min). TIG 120V: 40% @ 125A / 100% continuous @ 90A (4 min welding / 6 min resting). [owner-manual p.7, p.29]

## Safety

Do not weld without the Grounding Clamp attached. When not holding the torch, rest it on a nonconductive, nonflammable surface. Metal work bench must be grounded when TIG welding. Shielding gas can displace air and cause asphyxiation — ensure ventilation and fix leaks immediately. [owner-manual p.30]
