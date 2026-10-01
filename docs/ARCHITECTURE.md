# Bloodstream: architecture proposal

Status: all milestones implemented, including the activity-level slider and a pulsatile heartbeat. See "Implementation status" at the end.

## Goal

A browser app (desktop and Android) that shows a translucent 3D body with its
vascular tree, a sample of individual red blood cells (RBCs) moving through
it, and each cell's oxygen state down to the four haem sites of a
representative haemoglobin molecule. The user can pan, rotate, zoom, follow a
single cell, and read real-time transit times and velocities. Timings and
ratios should match published physiology. Stretch goal: an activity-level
slider (rest → maximal exercise).

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language / build | TypeScript + Vite | Fast dev loop, static output, no backend needed |
| 3D | three.js (WebGL2) | Runs on any recent Android Chrome; mature instancing, `OrbitControls` handle touch pinch/rotate/pan out of the box. WebGPU is optional later (three's `WebGPURenderer` falls back to WebGL2) |
| UI / HUD | Svelte 5 for panels, plain DOM overlay | Picked over Preact: components are plain HTML + script with no JSX/virtual DOM, and it compiles to a smaller bundle. The 3D scene is driven imperatively, not through a component tree. (Milestone 1's diagnostics page is vanilla TS; Svelte arrives with the HUD.) |
| Simulation | Plain TS module, run in a Web Worker | Keeps the main thread free for rendering on phones; positions shared via `SharedArrayBuffer` if cross-origin isolation is available, otherwise transferable `Float32Array` snapshots each frame |
| Charts (saturation curve, timelines) | uPlot or hand-drawn canvas | Tiny, fast |
| Tests | Vitest | Physiology regression tests run headless (see "Validation") |
| Hosting | GitHub Pages via GitHub Actions | Static site, free |

No backend. All data (geometry, physiological parameters) ships as static
assets.

## Core architectural decisions

### 1. Separate the physiological model from the 3D geometry

The real body has ~25 trillion RBCs, ~10 billion capillaries and on the
order of 100,000 km of vessels. None of that can be rendered literally, so
the app is built from two layers that share an ID space:

- **Circulation graph (the truth).** A directed graph of vessel segments
  and organ beds: heart chambers → aorta → major arteries → organ beds
  (arterioles → capillaries → venules) → veins → vena cava → right heart →
  pulmonary arteries → pulmonary capillaries → pulmonary veins → left heart.
  Each edge carries length, total cross-sectional area, flow fraction and
  compliance. Velocity and transit time follow from flow / area, so they are
  derived values, not hand-tuned ones.
- **Geometry (the picture).** 3D centrelines (splines) and tube meshes for
  the visible vessels, keyed to graph edges. Many graph edges (e.g. "kidney
  capillary bed") map to a procedurally generated local mesh rather than to
  real anatomy.

A cell's state is `(edgeId, arcLength s, …)`. The renderer maps that to a
3D position by sampling the edge's spline. This lets the physics be
validated in tests without any rendering.

### 2. Multi-scale view with semantic zoom

Scales run from about 1 m (body) to about 5 nm (haemoglobin), nine orders of
magnitude. A single continuous zoom would break depth precision and show
nothing useful in between. The proposal is distinct levels with animated
transitions:

1. **Body**: translucent skin shell, major arteries/veins, organs as faint
   shells, RBCs as glowing points coloured by saturation.
2. **Organ / bed**: zoom into a region (lung, kidney, a muscle). A
   procedurally generated arteriole → capillary → venule network is shown,
   with RBCs as instanced biconcave discs.
3. **Capillary close-up**: single-file RBCs squeezing through ~5–8 µm
   capillaries, O₂ diffusion visualised as particles/gradient.
4. **Molecular inset (HUD, not 3D zoom)**: one representative haemoglobin
   molecule (2α2β) with its four haem sites, lit when O₂ is bound. Also shows
   the cell's overall SO₂, local PO₂, and position on the dissociation
   curve.

Level 4 is always available as an inset for the followed cell, so the user
does not need to zoom to see binding state.

### 3. Sampled cells, not all cells

The sim tracks a configurable sample (about 2k on phones, 10–20k on desktop)
of "tracer" RBCs. Each one routes through the graph exactly as a real cell
would statistically: at each bifurcation it picks a child with probability
proportional to flow (red cells do not split exactly by flow because of the
Zweifach–Fung effect / plasma skimming, but flow weighting is a reasonable
first approximation). Every cell therefore has its own route and round-trip
time, and the distribution of round-trip times (short coronary loops of a
few seconds up to over a minute through the legs) emerges from the model
instead of being scripted.

Within a vessel, a cell's speed is the segment's mean velocity times a
radial-position factor (Poiseuille profile, cells near the axis go faster),
plus pulsatility in large arteries (see 5).

### 4. Oxygen: two models at two scales

- **Cell-level saturation (deterministic ODE).** Each tracer carries SO₂.
  In a capillary segment, plasma PO₂ and SO₂ evolve by Roughton–Forster
  style uptake/unloading: flux = D_m·(P_alv − P_plasma), with the in-cell
  reaction rate θ·V_c, and SO₂ related to PO₂ via the Hill/Adair
  dissociation curve (P50 ≈ 26.8 mmHg, n ≈ 2.7), shifted by pH, PCO₂,
  temperature and 2,3-DPG (Bohr effect, needed for the exercise mode). In
  systemic beds, each organ has an O₂ consumption (VO₂) and the
  Fick principle sets how much each pass extracts. Tissue PO₂ comes from
  that, not the other way round.
- **Molecule-level occupancy (stochastic).** The inset haemoglobin is a
  continuous-time Markov chain over 0–4 bound O₂ using Adair stepwise
  constants (the 4th site has much higher affinity than the 1st:
  cooperativity). Its rates are scaled to the cell's local PO₂, so averaged
  over time it matches the cell's SO₂ while each site visibly binds and
  releases. A small panel shows "this molecule: 3/4" next to "this cell:
  96.8 %, about 1.0×10⁹ of 1.08×10⁹ sites" (270 M Hb × 4).

O₂-binding chemistry itself is fast (ms). Lung equilibration (~0.25 s) is
limited mostly by diffusion across the alveolar membrane and plasma, so the
model has to include that resistance. Otherwise lung loading would look
instantaneous.

### 5. Time

- Simulation clock in real physiological seconds, fixed timestep (e.g. 1 ms
  in capillaries, adaptive elsewhere), decoupled from frame rate.
- Playback speed control from 0.01× (watch 0.25 s of lung loading over
  25 s) up to 10× (watch a whole circulation in seconds). "Real time" is
  1×.
- Optional cardiac cycle (~0.8 s at 75 bpm) modulates arterial velocity
  (aortic peak ~1 m/s vs mean ~0.2 m/s). Damped towards steady flow by the
  capillaries.
- A followed cell has a stopwatch: time since leaving the left ventricle,
  segment times, a log of lung and tissue capillary visits.

### 6. Activity level (stretch, but designed in from the start)

One scalar, "metabolic rate" (MET 1 → ~15), drives a parameter set:
heart rate, stroke volume → cardiac output (5 → 20–25 L/min); flow
redistribution (muscle from ~20 % to ~80 %+ of CO, splanchnic/renal
reduced); muscle VO₂; capillary recruitment; temperature/pH/PCO₂ shifts in
working muscle (right-shift of the curve); shorter pulmonary transit
(~0.75 s → ~0.3 s). Because velocities, transit times and extraction are all
derived from these parameters, the slider changes everything consistently.

### 7. Rendering notes for phones

- One `InstancedMesh` per cell LOD (point sprite far away, low-poly
  biconcave disc near). Instance colour = saturation (dark red ↔ bright
  red, optionally with a blue-ish colour-blind mode).
- Translucent body: a single skin mesh with a fresnel shader, depth-write
  off, drawn last. Vessels and cells are opaque, so sorting stays simple and
  order-independent transparency is not needed.
- Vessels as tube geometry merged per region. Arteries red, veins blue, by
  convention, with an option to colour by actual mean SO₂.
- Adaptive quality: measure frame time, scale tracer count and pixel ratio.
- `OrbitControls` (or `CameraControls`) for touch/mouse. "Follow cell"
  locks the target to the cell and lerps the camera behind it.

### 8. Saturation colour scale

There is no formal standard for colouring O2 saturation. Two conventions
overlap: anatomical illustration (arteries red, veins blue) and oximetry /
photoacoustic sO2 imaging (a blue → red ramp). The scale follows both:

- 0 % deep navy → 50 % blue → 75 % violet/magenta → 100 % red,
  interpolated in OKLab (`src/color/saturation.ts`).
- Lightness rises monotonically with saturation, so it also reads in
  greyscale.
- Blue ↔ red is the hue axis that deuteranopia and protanopia (the
  red–green deficiencies, ~8 % of men) preserve. A "realistic"
  bright-red ↔ dark-red ramp is avoided because those viewers can barely
  tell it apart.
- Stops are denser above 50 %, where physiology happens (arterial 97 %,
  mixed venous 73 %, coronary sinus 32 %).
- The same scale is used everywhere: vessels (by mean segment saturation),
  individual cells, and the haemoglobin molecule's five states (0–4 O2,
  coloured at 0, 25, 50, 75, 100 %).

Tests check monotonic lightness and that the five haemoglobin steps and
arterial vs. venous blood stay distinguishable under simulated
deuteranopia, protanopia and tritanopia (Machado et al. 2009).

### 9. Anatomy source

Options, in order of preference:

1. **Stylised, hand-authored centrelines** for about 60–100 named vessels
   (aorta, carotids, subclavians, coeliac, renals, iliacs, femorals, venae
   cavae, pulmonary trunk and so on) on top of a low-poly body silhouette.
   Fully under our control and easy to map to the graph.
2. **Z-Anatomy / BodyParts3D** meshes (CC BY-SA). Anatomically real, but
   heavy, with licence obligations, and the meshes are surfaces rather than
   centrelines, so they need preprocessing.

Decided: (1) stylised anatomy.

## Physiological parameters (starting values, adult at rest)

These are textbook values used as targets. Each will be given a citation in
`src/physiology/params.ts` when implemented.

| Quantity | Value |
|---|---|
| Blood volume | ~5 L |
| Cardiac output (rest / max exercise) | ~5 L/min / 20–25 L/min |
| Heart rate (rest) | ~70 bpm |
| Mean whole-body circulation time | ~1 min (= volume / CO) |
| RBC count / size | ~25×10¹² cells, ~7.5–8 µm × 2 µm |
| Hb molecules per RBC | ~270×10⁶ |
| Pulmonary capillary transit (rest / exercise) | ~0.75 s / ~0.25–0.35 s |
| Time to O₂ equilibrium in pulmonary capillary | ~0.25 s (first third of transit) |
| Arterial SO₂ / PO₂ | ~97–98 % / ~95–100 mmHg |
| Mixed venous SO₂ / PO₂ (rest) | ~75 % / ~40 mmHg |
| Mixed venous SO₂ (heavy exercise) | ~20–40 % |
| P50 / Hill n | ~26.8 mmHg / ~2.7 |
| Systemic capillary transit | ~1–2 s, length ~0.5–1 mm |
| Velocity: aorta (mean / peak) | ~20 cm/s / ~100 cm/s |
| Velocity: capillary | ~0.3–1 mm/s |
| Velocity: vena cava | ~10–20 cm/s |
| CO fraction (rest): splanchnic+liver / kidneys / muscle / brain / skin / heart | ~25 / ~20 / ~20 / ~14 / ~6 / ~4–5 % |
| O₂ extraction (rest): heart / brain / kidney / resting muscle | ~70 % / ~35 % / ~8–10 % / ~25–30 % |
| Special topology | Hepatic portal (gut/spleen → liver, two capillary beds in series), renal glomerular → peritubular (two in series), bronchial & Thebesian shunts (small venous admixture) |

## Validation (automated)

Headless Vitest suites run the sim (no rendering) and assert emergent
behaviour against the table above, within tolerances, e.g.:

- Mean round-trip time ≈ blood volume / CO (±10 %), with plausible minimum
  (coronary) and maximum (lower limb) loop times.
- Fraction of tracers per organ bed ≈ CO fraction.
- Pulmonary capillary: SO₂ 75 → >95 % within ~0.25–0.3 s at rest.
- Arterial and mixed-venous SO₂ at steady state.
- Time-averaged single-molecule occupancy / 4 ≈ cell SO₂.
- Exercise preset reproduces the exercise targets.

## Proposed layout

```
src/
  physiology/   params.ts, activity.ts (presets), dissociation.ts (Hill/Adair, Bohr shifts)
  sim/          graph.ts, router.ts, oxygen.ts, hemoglobin.ts (Markov), worker.ts
  anatomy/      vessels.json (centrelines + graph mapping), capillaryGen.ts
  render/       scene.ts, cells.ts (instancing), vessels.ts, body.ts, follow.ts
  ui/           HUD, inset molecule, controls, charts
tests/          physiology validation suites
```

## Milestones

1. ✅ Sim core + validation tests (graph, routing, O₂ model). No 3D.
2. ✅ Body-level 3D: stylised vessels, tracers, orbit controls, time controls.
3. ✅ Follow-cell mode + HUD + haemoglobin inset.
4. ✅ Organ/capillary zoom levels with procedural beds.
5. ✅ Polish (done before the activity slider, which is now the stretch goal).
6. ✅ Activity slider and heartbeat.

## Open questions

- Should tracers be a statistically representative sample (proportional to
  flow everywhere, so capillary beds look sparse) or over-sampled in the
  region being viewed? Proposal: representative globally, with extra
  "local-only" tracers spawned when zoomed into a bed.

## Implementation status

### Milestone 1: simulation core (done)

| Module | Contents |
|---|---|
| `src/physiology/dissociation.ts` | Severinghaus curve, analytic inverse, O2 content and capacitance, virtual-PO2 Bohr/temperature/CO2 shift |
| `src/physiology/hemoglobin.ts` | Adair equilibrium (Imai constants), single-tetramer Gillespie chain with T/R-range kinetics |
| `src/physiology/params.ts` | Resting physiology with sources: cardiac output, VO2, per-tissue flow/VO2/transit/tissue PO2, Fåhraeus ratios |
| `src/physiology/anatomy.ts` | 186 segments: heart chambers, named vessels (per side), 3-segment organ beds, portal and renal serial beds, bronchial shunt |
| `src/sim/circulation.ts` | Graph build, flow propagation, volumes, transit times, velocities |
| `src/sim/oxygen.ts` | Bohr-integration exchange (RK4), whole-body steady-state solver, per-bed Fick calibration |
| `src/sim/simulation.ts` | Tracer red cells: flow-weighted routing, log-normal capillary transit, blunted radial velocity profile in large vessels |
| `src/sim/tracking.ts` | Lap and capillary-visit recorder, follow-one-cell tracker with a live haemoglobin molecule |
| `src/color/saturation.ts` | Colour scale + colour-vision-deficiency simulation |
| `src/main.ts` | Diagnostics page (no 3D) |

Emergent results at rest (asserted in `tests/`):

| Quantity | Model | Reference |
|---|---|---|
| Blood volume | 4.83 L | ~5 L |
| Volume distribution (veins / pulmonary / heart / arterial+micro) | 64 / 10 / 7 / 19 % | 64 / 9 / 7 / 20 % |
| Mean red-cell circulation time | 54 s (plasma 58 s) | ~60 s; F-cell ratio ~0.9 |
| Arterial SO2 / PO2 | 97.5 % / 96 mmHg | 97–98 % / 95–100 |
| Mixed venous SO2 / PO2 | 73.4 % / 39 mmHg | ~75 % / ~40 |
| Pulmonary capillary: time to 95 % PO2 equilibrium | ≈ 0.25 s of 0.75 s | ~0.25 s of 0.75 s |
| Coronary sinus / jugular / renal vein SO2 | 32 / 66 / 89 % | 25–40 / 55–75 / ~90 % |
| Median circuit time via heart wall / brain / kidney / lower leg | ~17 / 21 / 23 / ~95 s | — (emergent) |

Known simplifications, to revisit:

- Lumped arterioles and venules have a linear speed ramp (1.75× → 0.25× of
  their mean through arterioles, the reverse through venules), so cells
  slow to ~2 mm/s entering capillaries and speed up to ~1 cm/s in small
  veins, matching intravital measurements (venules < 30 µm: ~1.9 mm/s).

- Atria and veins are treated as steady (no venous pulse or atrial kick);
  activity changes take effect instantly rather than over 1–2 minutes.
- Vertebral arteries are folded into the carotids; anterior cardiac and
  Thebesian veins into the coronary sinus.
- Red cells split at bifurcations in proportion to blood flow (no plasma
  skimming / Zweifach–Fung effect).
- Systemic O2 exchange happens only in capillaries (arteriolar O2 loss is
  ignored), and all exchange uses the standard curve (no Bohr shift at rest).
- The steady-state calibration takes ~1 s at start-up (in the worker since
  milestone 2).

### Milestone 2: body-level 3D view (done)

| Module | Contents |
|---|---|
| `src/anatomy/layout.ts` | Stylised 3D coordinates (cm) for every named vessel and organ-bed centre |
| `src/anatomy/paths.ts` | One Catmull–Rom curve per segment, auto-joined end to start; tube radii; arc-length lookup table |
| `src/anatomy/lut.ts` | three.js-free LUT sampling used by the worker |
| `src/sim/worker.ts`, `protocol.ts` | Simulation in a Web Worker; one tick per animation frame, ping-pong so slow devices never queue up; transferable buffers |
| `src/render/` | Fresnel "glass" vessels coloured along their length by steady-state saturation; tracer cells as saturation-coloured point sprites with a light rim; translucent body (depth pre-pass, nearest surface only) and organ shells; orbit/pinch/pan controls |
| `src/ui/` | Svelte HUD: body clock, play/pause, speed (0.01× to 30×), reset view, saturation legend with arterial/venous marks, explainer panel |

Rendering decisions:

- Gamma-encoded colours are written straight out by custom shaders, so the
  colour-scale module is the single source of truth for on-screen colour.
- Draw order: opaque cells, then translucent organ shells and vessels
  (no depth write, so cells inside vessels stay visible), then the skin.
- Cells are drawn ~0.7 cm wide (≈ 900× real size) with a minimum pixel
  size. Capillary beds are drawn as short loops a few cm long (real: < 1 mm).
- 3,000 tracers on phones / ≤ 4-core devices, 8,000 otherwise.
- Branches leave from the end of their parent segment (a cell can't jump
  mid-segment), so the aortic root and the abdominal aorta are split into
  sub-segments where the coronaries and visceral arteries leave.

### Milestone 3: follow a cell (done)

- Hands and feet now have their own beds (skin and muscle/bone/tendon) fed by
  the radial/ulnar and foot arteries and drained by forearm and foot veins.
  Their flow is carved out of the arm and lower-leg skin and "other" shares,
  so tissue totals are unchanged.
- Tap a cell (nearest projected cell within ~28 px, nearer cells preferred)
  or press the target button to follow a random cell that is just leaving
  the left ventricle, so its first circuit is timed from the start.
- The worker runs a `CellTracker` for the followed cell and sends its state
  with every frame: segment, progress, PO2/SO2, speed, circuit timer, organ
  beds passed, the last circuits with their routes, the journey log, and
  the live haemoglobin tetramer.
- The camera flies in to ~45 cm and then moves with the cell; orbiting and
  zooming still work around it. A screen-space ring marks the cell and a
  trail coloured by saturation shows where it has been.
- Follow panel: SO2 and PO2; location, vessel type and speed; time in the
  segment; circuit timer and previous circuit times with the beds they went
  through; the haemoglobin tetramer (α1 β1 β2 α2, tinted by its 0–4 step
  colour, with O2 drawn on occupied haems); the distribution of the cell's
  ~270 M Hb over 0–4 bound O2; an SO2 + speed (log) sparkline over a window
  scaled to playback speed; and an expandable journey log. On phones the
  panel starts compact.

### Milestone 4: microscope view (done)

The organ and capillary zoom levels are one "microscope" view, opened from
the magnifier button (menu of seven representative beds) or from the follow
panel ("Zoom into this capillary bed", for any bed the followed cell is in).

| Module | Contents |
|---|---|
| `src/micro/beds.ts` | Menu beds (lung, heart muscle, brain, thigh muscle, kidney, liver, fingertip skin) and a tissue → network-style mapping for every other bed |
| `src/micro/network.ts` | Procedural networks in µm: one terminal arteriole, N capillaries, one venule. Styles: `fibers` (capillaries in the corners between muscle fibres / cardiomyocytes / tubules / hepatocyte plates), `alveoli` (a capillary sheet between air sacs), `tortuous` (brain-like 3D mesh), `hairpin` (skin papillary loops). Each capillary is fitted by bisection so its length equals the modelled capillary length |
| `src/micro/microSim.ts` | Local cells: single file at one velocity per capillary (no overtaking), capillary transits from the same log-normal quantiles as the body model, equal cell flux per capillary, spacing from tube haematocrit (90 fL cell, Hct 0.45 × Fåhraeus ratio). O2 uses the bed's calibrated exchange model. One "dot" per 10⁹ O2 molecules moved |
| `src/render/microScene.ts` | Evans–Fung biconcave discs (instanced), folded to fit and facing the flow in capillaries, tumbling in arterioles/venules. Capillaries coloured along their length by their own transit's saturation profile. Tissue context drawn as translucent fibres, alveoli or epidermis. O2 dots drift ~14 µm across the wall (outwards in tissue, inwards in lungs) |

Validated in `tests/micro.test.ts`: capillary lengths within 3 %, mean
capillary transit equals the body model, outlet saturation within 2 % of the
body model for lung, heart and kidney, and dot counts within 15 % of
ΔSO2 × 4 × 270 M / 10⁹ per passage.

The followed cell appears in the open patch for the last stretch of its
arterioles, its whole capillary passage (progress from the body simulation)
and the first stretch of its venules, on the route whose transit is closest
to its own. Local cells near it on that route are hidden so they don't
overlap.

Known simplifications: no anastomoses between capillaries; the kidney view
shows only peritubular capillaries (not the glomerulus); dot animation is
illustrative (the count is quantitative, the drift speed is not diffusion).

### Polish milestone (done)

- **Tap to zoom:** tapping near an organ in the body view projects every
  bed centre and offers "Zoom into capillaries" (and "Follow this red
  cell" if one was under the finger). Taps away from organs still follow
  the nearest cell. The magnifier menu also lists every capillary bed,
  grouped by body region.
- **Onboarding:** a dismissable first-visit card (remembered in
  `localStorage` when available) and a "Where the numbers come from" section
  in the info panel.
- **Performance:** adaptive drawing resolution (device pixel ratio 2 → 1.5 →
  1.25 → 1 after a sustained run of frames over ~24 ms, never raised again to
  avoid oscillation). The worker skips computing body-view cell positions
  while the microscope is open.
- **Colour-vision deficiency:** no separate palette; the default scale is
  already tested against simulated deuteranopia, protanopia and tritanopia
  (section 8).

### Tissue territories (body view)

Each organ microcirculation is drawn as 4–28 "strands" (`src/anatomy/territories.ts`):
capillary loops placed in the tissue's real territory of the stylised body
(`src/anatomy/bodyShape.ts`, shared with the translucent body mesh): just
under the skin surface for skin beds, through the limb or body-wall volume
for muscle, near the bone for "other" tissue, inside the organ for organs.
Arterioles fan out from the feeding artery's end; venules converge on the
draining vein. A cell picks a random strand when it enters a bed and keeps
it through arterioles, capillaries and venules (and the kidney's
glomerulus/efferent arteriole). The physiology graph is unchanged; this only
affects where cells are drawn. Strands are rendered as thin lines (one draw
call); named vessels stay glass tubes. Bronchial venous blood now drains
into the right pulmonary veins (as the deep bronchial veins do), so that no
microcirculation drains into another bed's venules.

### Activity levels and heartbeat (done)

`src/physiology/activity.ts` interpolates four anchor states (rest 1 MET,
walking 3.5, jogging 8, maximal 13) from a 0–1 slider level. Each sets heart
rate (70 → 185), cardiac output (5 → 22 L/min), VO2 (0.25 → 3.25 L/min),
per-tissue flow and VO2 (muscle gets the remainder; its extra flow and VO2
go 80 % to the legs), muscle capillary recruitment (up to 4×) and arteriolar
dilation, pulmonary capillary recruitment (2.2×) and DLO2 (→ 75), alveolar
PO2, and working-muscle blood conditions (pH 7.2, PCO2 60, 39.5 °C at
maximum). `Circulation` takes the state, `solveSteadyState` calibrates with
those conditions, and tissue PO2 falls where extraction must rise. The
worker caches solved states per 0.01 level (~1.5–2 s each) and
`Simulation.setState` swaps them live: cells keep their place, time in the
current segment is rescaled, PO2 is re-expressed under new conditions, and
the heartbeat phase stays continuous.

Validated (`tests/activity.test.ts`): Fick uptake = VO2 at every level;
> 80 % of cardiac output to muscle at maximum, > 70 % of it to the legs;
arterial SO2 > 94 % throughout; mixed venous 73 → 50 → 35 → 23 %; femoral
venous 16 % at maximum; pulmonary transit 0.37 s; mean circulation 54 →
13 s.

`src/physiology/heartbeat.ts`: a half-sine aortic ejection waveform (mean
1, ~4.5× peak at rest) with ejection lasting 0.30 s at 70 bpm and 0.20 s near
180 bpm. Ventricles empty only while ejecting; other segments follow
`1 + α (w − 1)` with α 0.9 in the aorta, 0.7 in medium arteries, 0.5 in small
arteries, 0.25 in arterioles, 0.08 in systemic capillaries, 0 in veins.
Mean transits are unchanged. The UI shows heart rate with a beating icon,
and the heart shell contracts in systole.

`npm run artifact` builds the app as one self-contained HTML fragment
(worker inlined as a blob) for publishing as a claude.ai Artifact. The
milestone 1 diagnostics page now lives at `diagnostics.html`.
