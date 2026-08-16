# MIG (Solid-Core, Gas-Shielded) Setup — Vulcan OmniPro 220

MIG welding uses **solid wire + shielding gas**, for mild steel and stainless steel (aluminum possible with optional Spool Gun). Better control on thin workpieces than flux-cored. [owner-manual p.18]

## Polarity: DCEP (Direct Current Electrode Positive)

| Cable | Socket |
|---|---|
| Ground Clamp Cable | **NEGATIVE (–) Socket** |
| Wire Feed Power Cable | **POSITIVE (+) Socket** |

Twist both cables clockwise all the way to lock in place. [owner-manual p.14, figure `pages/owner-manual-p14.png` "DCEP Solid Core (Gas Shielded) Polarity Setup"]

Sockets are on the front panel; see [owner-manual p.8, figure `pages/owner-manual-p08.png`] for the full front-panel socket diagram.

## Gas

- Gas-shielded solid-core wire requires shielding gas (type depends on material — determined via the Settings Chart on the inside of the welder door, which is not present in the three source PDFs; see `settings-charts.md` for what data IS available in these files).
- Cylinder setup: secure 100 lb-class cylinder with 2 straps; remove cap; briefly open/close valve to blow out dust; thread Regulator on and wrench-tighten; connect Gas Hose to Regulator outlet and Welder's gas inlet, wrench-tighten both. For C100 gas, use the included CGA 580/320 adapter. [owner-manual p.14, steps c–f]
- Open cylinder valve fully; set Flow Gauge to the SCFH value on the Settings Chart. On the LCD Polarity/Gas screen, **set SCFH between 20–30** for MIG. [owner-manual p.21, p.20]

## Wire spool & feed roller

- 1-2 lb spool: mounts directly on the Spool Spindle against the Spool Brake Pad, secured with Spacer + Wingnut; spool must unwind **clockwise**. [owner-manual p.10, figure `pages/owner-manual-p10.png`]
- 10-12 lb spool: requires the Spool Adapter (pin aligns with spool hole) + Spool Knob threaded into the adapter. [owner-manual p.11, figure `pages/owner-manual-p11.png`]
- Feed Roller has 4 grooves: 2× V-groove for solid-core (0.025" and 0.030"/0.035") and 2× knurled groove for flux-cored (0.030"/0.035" and 0.045"); unscrew the Feed Roller Knob counterclockwise, flip/replace the roller so the exposed groove number matches the wire diameter on the spool label, then re-secure the knob. [owner-manual p.12, figure `pages/owner-manual-p12.png`]
- See `wire-feed.md` for the tensioner-calibration procedure.

## Gun cable connection

Loosen the knob on the Wire Feed mechanism, insert the Gun Cable Connector through the front hole into the Wire Feed socket, ensure it's **fully inserted** (an incompletely seated connector leaks the gas connection and starves the arc of shielding gas), then tighten the knob (do not overtighten). Insert the Wire Feed Control Cable (keyed, one orientation only) into its socket inside the machine and tighten the lock ring. [owner-manual p.13, figure `pages/owner-manual-p13.png` shows correct-vs-incorrect insertion]

## Wire threading

Cut off bent/crimped wire cleanly (no burrs). Feed at least 12" of wire into the Wire Inlet Liner and Feed Guide while keeping tension on it (unrestrained wire can unravel/tangle). Seat wire in the Feed Roller groove, push the Idler Arm down, swing the Feed Tensioner up to latch across the arm tip. Then thread a Contact Tip compatible with the wire size onto the gun clockwise, replace the Nozzle, and trim the wire to 1/2" stickout. [owner-manual p.15, p.17, figure `pages/owner-manual-p15.png`]

Stainless steel wire is stiffer/less flexible — keep the gun cable straight while feeding it. [owner-manual p.15]

## LCD settings workflow

1. Press Home Button; turn Main Control Knob to the desired process; press to select. [owner-manual p.20]
2. Polarity/Gas screen: plug cables per on-screen diagram, connect gas per on-screen diagram, set SCFH 20–30.
3. Left Knob = Wire Diameter, Right Knob = Material Thickness.
4. Auto Weld Settings screen: Left Knob = Wire Feed Speed (Amperage), Right Knob = Voltage. A white tick mark on the adjustment bar shows the machine's synergic recommended setting for the chosen wire/thickness if you adjust manually. [owner-manual p.20, figure `pages/owner-manual-p20.png`]
5. Optional Settings (via Main Control Knob press): Run-In WFS (% of preset WFS before wire contacts workpiece), Inductance (arc length — more = fluid puddle/flatter bead, less = colder puddle), Spot Timer, Recall Setting, Save Setting (5 slots). [owner-manual p.21]

## Power / startup

Plug either the 120 VAC or 240 VAC power cord into the Power Input Socket (fits only one way). Plug into a properly grounded GFCI-protected 120 VAC (20A rated) or 240 VAC receptacle on a delayed-action circuit breaker/fuse. Rest the MIG Gun on a nonconductive, nonflammable surface before turning the Power Switch ON. [owner-manual p.16, p.20]

## Basic technique

- Narrow weld = stringer bead (straight line); wider = weave bead (back-and-forth).
- Butt (end-to-end) joints: gun at 90°. Fillet (T-shaped) joints: gun at 45°.
- Push angle (gun tilted 0–15° away from travel direction) for solid wire + gas; drag angle (0–15° toward travel direction) for flux-cored without gas.
- CTWD (Contact-Tip-to-Work Distance): keep ≤ 1/2". [owner-manual p.22, figure `pages/owner-manual-p22.png`]

Follow duty-cycle limits from `duty-cycle.md` while welding; see `troubleshooting.md` and `settings-charts.md` for weld-quality tuning.
