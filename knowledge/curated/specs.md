# Electrical Specifications — Vulcan OmniPro 220 (Item 57812)

Full specifications table for all three processes, both supply voltages. Source: Specifications table [owner-manual p.7] (pdfplumber-verified table extraction), cross-verified against the IEC 60974-1 rating nameplate illustration reprinted on [owner-manual p.14, p.16, p.25, p.27].

## MIG

| | 120 VAC / 60 Hz | 240 VAC / 60 Hz |
|---|---|---|
| Current Input at Output | 20.8 A at 100 A | 25.5 A at 200 A |
| Welding Current Range | 30–140 A | 30–220 A |
| Rated Duty Cycles | 40% @ 100 A; 100% @ 75 A | **25% @ 200 A**; 100% @ 115 A |
| Maximum OCV | 86 VDC | 86 VDC |
| Weldable Materials | Mild Steel, Stainless Steel, Aluminum (with optional Spool Gun) | same |
| Welding Wire Capacity | Solid Core: 0.025"/0.030"/0.035"; Flux Cored: 0.030"/0.035"/0.045" | same |
| Wire Speed | 50–500 IPM | same |
| Wire Spool Capacity | Up to 12 lb spool | same |

[owner-manual p.7]

## TIG

| | 120 VAC / 60 Hz | 240 VAC / 60 Hz |
|---|---|---|
| Current Input at Output | 20.6 A at 125 A | 15.6 A at 175 A |
| Welding Current Range | 10–125 A | 10–175 A |
| Rated Duty Cycles | 40% @ 125 A; 100% @ 90 A | 30% @ 175 A; 100% @ 105 A |
| Maximum OCV | 86 VDC | 86 VDC |
| Weldable Materials | Mild Steel, Stainless Steel, Chrome Moly | same |

[owner-manual p.7]

## Stick (SMAW)

| | 120 VAC / 60 Hz | 240 VAC / 60 Hz |
|---|---|---|
| Current Input at Output | 19.5 A at 80 A | 23.7 A at 175 A |
| Welding Current Range | 10–80 A | 10–175 A |
| Rated Duty Cycles | 40% @ 80 A; 100% @ 60 A | 25% @ 175 A; 100% @ 100 A |
| Maximum OCV | 86 VDC | 86 VDC |
| Weldable Materials | Mild Steel, Stainless Steel | same |

[owner-manual p.7]

## Rating nameplate cross-reference (IEC 60974-1 format)

The nameplate illustration repeated on [owner-manual p.14, p.16, p.25, p.27] expresses the same data as U0 (max OCV) / I2 (welding current) / U2 (arc voltage at that current) / X% (duty cycle), plus input current draw I1max/I1eff. The nameplate lays out six range blocks (MIG/Stick/TIG × 240V/120V); block order was disambiguated by matching each block's duty-cycle numbers against the authoritative narrative Specifications table on p.7 (every block matches p.7 exactly — no discrepancy):

**240V (U1=240V, single-phase 50/60Hz):**
- **MIG**: range 30A/15.5V–220A/25V. X=25%→I2=200A,U2=24V; X=60%→I2=130A,U2=20.5V; X=100%→I2=115A,U2=19.75V. I1max=25.5A, I1eff=12.8A.
- **Stick**: range 10A/20.4V–175A/27V. X=25%→I2=175A,U2=27V; X=60%→I2=115A,U2=24.6V; X=100%→I2=100A,U2=24V. I1max=23.7A, I1eff=11.9A.
- **TIG**: range 10A/10.4V–175A/17V. X=30%→I2=175A,U2=17V; X=60%→I2=125A,U2=15V; X=100%→I2=105A,U2=14.2V. I1max=15.6A, I1eff=8.5A.

**120V (U1=120V, single-phase 50/60Hz):**
- **MIG**: range 30A/15.5V–140A/21V. X=40%→I2=100A,U2=19V; X=60%→I2=85A,U2=18.25V; X=100%→I2=75A,U2=17.75V. I1max=20.8A, I1eff=13.1A.
- **Stick**: range 10A/20.4V–80A/23.2V. X=40%→I2=80A,U2=23.2V; X=60%→I2=70A,U2=22.8V; X=100%→I2=60A,U2=22.4V. I1max=19.5A, I1eff=12.3A.
- **TIG**: range 10A/10.4V–125A/15V. X=40%→I2=125A,U2=15V; X=60%→I2=105A,U2=14.2V; X=100%→I2=90A,U2=13.6V. I1max=20.6A, I1eff=13A.

U0 = 86V for all six blocks. Plug fits only one orientation; no extension cords permitted [owner-manual p.6].

[owner-manual p.14, p.16, p.25, p.27] — nameplate figure `pages/owner-manual-p14.png`

## Physical / interface

- Wire Feed Speed control range: 50–500 IPM [owner-manual p.7]
- Max wire spool: 12 lb (1-2 lb direct-spindle mount, or 10-12 lb via Spool Adapter) [owner-manual p.10–11]
- Front panel: LCD Display, Left/Right/Control (Main) Knobs, Home/Back Buttons, Power Switch, Positive Socket, Negative Socket, MIG Gun/Spool Gun Cable Socket, Spool Gun Gas Outlet, Storage Compartment [owner-manual p.8, figure `pages/owner-manual-p08.png`]
- Power cord: dual cords supplied (120 VAC and 240 VAC), twist-lock input plug, plug fits its input socket only one way; do not use an extension cord [owner-manual p.6, p.46 parts #55 "120 VAC Power Cord", #61 "240 VAC Power Cord"]
