# Bloodstream architecture

Bloodstream is a static web app. A physiology model of the whole
circulation runs in a Web Worker and drives a three.js view of the body and
a true-scale "microscope" view of capillary beds. Everything that can be
derived (velocities, transit times, saturations, circuit times) is computed
from flows, volumes and published parameters, never set by hand, and the
test suite checks the results against reference values.

```
src/physiology/   reference parameters, O2 dissociation, haemoglobin, activity levels, heartbeat
src/sim/          circulation graph → O2 steady state → tracer-cell simulation (in a worker)
src/anatomy/      stylised body shape, vessel layout, tissue territories, 3D paths
src/render/       three.js body and microscope scenes
src/micro/        capillary-bed networks and their local cell stream
src/ui/           Svelte HUD
src/color/        saturation colour scale
tests/            physiology validation suite
```

## Stack

| Concern | Choice |
|---|---|
| Language and build | TypeScript, Vite; static output, no backend |
| 3D | three.js on WebGL2, `OrbitControls` for mouse and touch |
| UI | Svelte 5 components over the canvas |
| Simulation | Plain TypeScript in a Web Worker, transferable `Float32Array`s each frame |
| Tests | Vitest, headless (no rendering) |
| Hosting | GitHub Pages, deployed by GitHub Actions after typecheck, tests and build |

## Circulation model

### The graph

`src/physiology/anatomy.ts` defines 220 segments, built into a graph by
`src/sim/circulation.ts`:

- **Heart chambers and named vessels** (74 segments): left and right
  atria and ventricles; the aorta (root, ascending, arch, thoracic,
  suprarenal and infrarenal abdominal); the carotids, subclavians, brachial,
  forearm, coronary, coeliac, mesenteric, renal, iliac, femoral, lower-leg
  and foot arteries; the matching veins; the venae cavae; the azygos and
  portal systems; and the pulmonary trunk, arteries and veins. Each has a
  length and lumen diameter, so volume = π d²/4 × length. Paired structures
  are separate per side.
- **Organ beds** (47 beds): each microcirculation is lumped into small
  arteries + arterioles, capillaries, and venules + unnamed veins. There are
  beds for both lungs, the left and right coronary territories, both brain
  hemispheres, face and scalp, arms, hands, trunk wall, gut, spleen and
  stomach, liver, kidneys, pelvis, thighs, lower legs and feet, split by
  tissue (muscle, skin, bone/connective "other"). Lumped volumes come from
  resting red-cell transit times and flows.
- **Special topology**: the hepatic portal system (gut and spleen →
  portal vein → liver sinusoids, which also receive the hepatic artery); the
  kidney's glomerulus → efferent arteriole → peritubular capillaries in
  series; and the bronchial circulation, which drains into the right
  pulmonary veins as a small shunt.

Branches leave from the end of their parent segment, so the aortic root and
abdominal aorta are split where the coronary and visceral arteries leave.

### Flows, volumes and transit times

Each organ bed's entry segment has a supply weight (its share of cardiac
output). At every branch, the split is proportional to the supply below
each child. Cardiac output is injected at the left ventricle and pushed
through the graph in topological order. Then:

- transit time = volume × haematocrit ratio / flow (red-cell transit; the
  Fåhraeus ratio is 0.6 in systemic capillaries, 0.85 in lung capillaries,
  0.9 in arterioles, 0.95 in venules);
- mean velocity = path length / transit time.

Lumped arterioles and venules span vessels of very different widths. Cells
slow linearly from 1.75× to 0.25× of the segment mean through arterioles and
do the reverse through venules, so they enter capillaries at ~2 mm/s and
reach ~1 cm/s in small veins. Transit times are unaffected.

### Reference parameters at rest

`src/physiology/params.ts`, with sources in its doc comments (Guyton & Hall,
Ganong, West):

| Quantity | Value |
|---|---|
| Cardiac output / heart rate / VO2 | 5.0 L/min / 70 bpm / 250 mL/min |
| Alveolar PO2 / DLO2 | 100 mmHg / 25 mL/min/mmHg |
| Haemoglobin | 15 g/dL (O2 capacity 20.1 mL/dL) |
| Flow share: brain / heart / kidney / gut / liver artery / muscle / skin / bronchial / other | 14 / 4.5 / 20 / 19 / 6.5 / 17 / 8 / 1.5 / 9.5 % |
| VO2 (mL/min): brain / heart / kidney / gut / liver / muscle / skin / bronchial / other | 48 / 30 / 18 / 28 / 32 / 55 / 10 / 3 / 26 |
| Capillary transit (s): brain, heart 1.0; kidney, gut, liver 1.5; skin, other 2.0; muscle 2.5; lung 0.75 | |
| Capillary length / diameter | 0.4–1.0 mm / 5–9 µm by tissue |
| Venous transit | longest in gut (49 s) and skin (50 s), the main venous reservoirs; 25 s in muscle; a few seconds in brain, heart and kidney |

## Oxygen model

### Dissociation curve and content

`src/physiology/dissociation.ts` uses Severinghaus's equation (P50
26.8 mmHg) with its analytic inverse, total O2 content (bound + dissolved),
its slope, and a "virtual PO2" correction for pH, PCO2 and temperature
(the Bohr effect).

### Capillary exchange

In an exchanging capillary, a cell's PO2 follows

    dC/dt = a · (P_target − P)   ⇒   dP/dt = a · (P_target − P) / β(P)

where β = dC/dP comes from the dissociation curve (`src/sim/oxygen.ts`,
integrated with RK4 and a step limited by the local time constant):

- **Lungs:** a = DLO2 / capillary blood volume, target = alveolar PO2.
  Loading is diffusion-limited. At rest blood reaches equilibrium about
  0.25 s into a 0.75 s transit.
- **Tissues:** target = tissue PO2. The conductance `a` is calibrated for
  each bed so that the average cell, over the bed's log-normal transit
  distribution, gives up exactly VO2 / flow (the Fick principle). Cells that
  linger longer extract more. Where a bed must extract more than its tissue
  PO2 allows (gut and kidney at maximal exercise, when their flow is cut),
  the tissue PO2 is capped at half the required venous PO2.

### Steady state

`solveSteadyState` iterates flow-weighted mean O2 content around the loop:
lung outlet (integrated over the transit distribution), each tissue bed by
Fick, mixing at confluences. Once arterial content converges, it calibrates
every tissue bed. The result gives the vessel colours, the initial cell
states, and the exchange models used by the tracer cells and the microscope.

### One haemoglobin molecule

`src/physiology/hemoglobin.ts` models a tetramer as a continuous-time Markov
chain over 0–4 bound O2, simulated exactly (Gillespie). Equilibrium uses
Imai's intrinsic Adair constants (k1 0.0037, k2 0.047, k3 0.012, k4 1.1 per
mmHg). On-rates per free site lie in the measured T-state and R-state
ranges; off-rates follow from k_off = k_on / k_i (≈ 3000 s⁻¹ for the first O2,
≈ 38 s⁻¹ for the last). The molecule is driven by the PO2 at which Adair's
curve matches the cell's saturation, so its time-averaged occupancy equals
the cell's saturation. The same constants give the distribution of the
cell's ~270 million Hb molecules over 0–4 bound O2.

## Tracer simulation

`src/sim/simulation.ts` simulates a sample of red cells (3,000 on phones and
≤ 4-core devices, 8,000 otherwise):

- **Seeding:** cells are spread in proportion to red-cell volume, at
  steady-state O2.
- **Routing:** at each branch a cell picks a child with probability
  proportional to flow, so every cell has its own route and circuit time.
- **Transit per visit:** log-normal in lumped segments and chambers
  (CV 0.3–0.5). In named vessels the cell takes a flux-weighted radial
  position in a blunted velocity profile, which keeps the mean transit equal
  to volume / flow.
- **Pulsatility:** time in a segment advances at the flow rate set by the
  heartbeat (below).
- **O2:** integrated in exchanging capillaries. When blood moves between
  segments with different blood conditions, PO2 is re-expressed at constant
  O2 content.
- **State changes:** `setState` swaps in another activity level's
  circulation and steady state. Cells keep their place, time already spent
  in a segment is rescaled to its new transit, and the heartbeat phase stays
  continuous.

`src/sim/tracking.ts` records circuits (left ventricle to left ventricle)
and capillary visits, and follows one cell with its route, circuit times,
beds passed and live haemoglobin molecule.

## Heartbeat

`src/physiology/heartbeat.ts`: aortic flow is a half-sine during ejection
and nearly zero in diastole, normalised to mean 1, so the peak is ~4.5× the
mean at rest. Ejection lasts 0.30 s at 70 bpm and 0.20 s near 180 bpm.
Ventricles empty only while ejecting. Other segments flow at
mean × (1 + α (w − 1)), with α 0.9 in the aorta, 0.7 in medium arteries,
0.5 in small arteries, 0.25 in arterioles, 0.08 in systemic capillaries, 0.8
and 0.3 in pulmonary arteries and capillaries, and 0 in veins and atria.
Averaged over a beat this is the mean, so transit times and steady-state
results are unaffected.

## Activity levels

`src/physiology/activity.ts` interpolates four anchor states from a 0–1
level:

| | Rest | Walking | Jogging | Maximal |
|---|---|---|---|---|
| MET | 1 | 3.5 | 8 | 13 |
| Heart rate (bpm) | 70 | 100 | 145 | 185 |
| Cardiac output (L/min) | 5 | 9 | 16 | 22 |
| VO2 (L/min) | 0.25 | 0.875 | 2.0 | 3.25 |
| Muscle capillary recruitment | 1× | 2.2× | 3.2× | 4× |
| Lung capillary recruitment / DLO2 | 1× / 25 | 1.3× / 35 | 1.8× / 55 | 2.2× / 75 |
| Working-muscle pH / PCO2 / temperature | 7.40 / 40 / 37 | 7.37 / 46 / 37.5 | 7.30 / 52 / 38.5 | 7.20 / 60 / 39.5 |

Flow and VO2 are set per tissue. Muscle takes what the other tissues
don't, and its extra flow and VO2 go mostly to the legs (thighs 25 % each,
calves 15 % each). Kidney and splanchnic flow fall to about a quarter of
resting, coronary flow rises ~4×, and skin rises at moderate work and falls
again at maximal. Muscle tissue PO2 falls with activity. Sources: Åstrand &
Rodahl; Rowell; Hsia (pulmonary recruitment).

`Circulation` takes an activity state. The worker solves each level once
(~1.5–2 s) and caches it.

## Geometry

- `src/anatomy/bodyShape.ts`: the stylised 175 cm body (torso profile,
  limb capsules, head, hands, feet, organ ellipsoids). It is shared by the
  translucent body mesh and the placement of capillaries.
- `src/anatomy/layout.ts`: 3D control points (cm) for every named vessel,
  and a hub point for each organ bed.
- `src/anatomy/territories.ts`: where each bed's capillaries are. Skin is
  just under the skin surface, muscle fills the limb or body-wall volume,
  "other" tissue sits near the bone, and organs are inside their organ
  shells. Each bed has 4–28 strands.
- `src/anatomy/paths.ts`: one Catmull–Rom curve per named vessel and per
  strand of each bed segment (1,776 paths), joined end to start so cells
  never jump. Arteriole strands fan out from the feeding artery and venule
  strands converge on the draining vein. A cell picks a strand when it
  enters a bed and keeps it until it leaves. Each path is baked into an
  arc-length lookup table of positions and frames that the worker samples
  without three.js (`src/anatomy/lut.ts`).

## Rendering

`src/render/scene.ts` and friends:

- **Vessels:** named vessels are merged glass tubes (a Fresnel shader:
  clear face-on, solid at the silhouette). Bed strands are merged thin lines.
  Both are coloured along their length by steady-state saturation.
- **Cells:** a point cloud with a custom shader. Each cell is a disc
  coloured by saturation with a light rim, drawn ~0.5 cm wide (about 600×
  real size) with minimum and maximum pixel sizes.
- **Body:** the skin is drawn as a depth pre-pass followed by an equal-depth
  colour pass, so only the nearest surface is tinted. The organ shells are
  faint, and the heart shell contracts during ejection.
- **Draw order:** cells, then organ shells and vessels (no depth write, so
  cells inside vessels stay visible), then skin.
- **Colour:** custom shaders write gamma-encoded colours straight from
  `src/color/saturation.ts`, the single source of on-screen colour.
- **Follow mode:** the camera flies in and then moves with the cell. A
  screen-space ring and a saturation-coloured trail mark the cell.
- **Adaptive quality:** after a sustained run of slow frames (over ~24 ms),
  the device pixel ratio steps down (2 → 1.5 → 1.25 → 1) and is never raised
  again.

## Microscope view

- `src/micro/beds.ts`: seven menu beds (lung, heart muscle, brain,
  thigh muscle, kidney, liver, fingertip skin), plus a tissue → style
  mapping so any bed can be opened.
- `src/micro/network.ts`: procedural networks in µm, each with one terminal
  arteriole, N capillaries and one venule. The styles are `fibers`
  (capillaries between muscle fibres, cardiomyocytes, tubules or hepatocyte
  plates), `alveoli` (a capillary sheet between air sacs), `tortuous` (a
  winding 3D mesh) and `hairpin` (skin papillary loops). Every capillary is
  fitted to the bed's modelled capillary length.
- `src/micro/microSim.ts`: a local population of cells.
  - Cells move single file at one speed per capillary, so none overtake.
  - Capillary transits come from the body model's distribution, with equal
    cell flux per capillary.
  - Spacing comes from tube haematocrit (90 fL per cell).
  - O2 uses the bed's calibrated exchange model.
  - Every 10⁹ O2 molecules moved emits one "dot".
- `src/render/microScene.ts`:
  - Cells are instanced Evans–Fung biconcave discs. In capillaries they
    fold to fit and face the flow; in arterioles and venules they tumble.
  - Each capillary is coloured by its own saturation profile.
  - Tissue context is drawn as translucent shapes.
  - O2 dots drift across the capillary wall.
- **Following:** the followed body-scale cell is shown in the patch while
  it passes the bed's last arterioles, its capillaries and its first venules.
  Tapping a local cell makes a body-scale tracer take over its segment,
  timing and PO2, so it can then be followed through the body.

## Worker and UI

`src/sim/worker.ts` owns the simulation. The protocol is in
`src/sim/protocol.ts`:

- **Ticks:** the main thread sends one tick per animation frame. The worker
  steps the simulation and returns cell positions, saturations, heartbeat
  phase and the followed cell's state. Buffers are passed back and forth,
  and a new tick is only sent after the previous frame arrives, so slow
  devices never queue up.
- **Other messages:** follow, adopt (follow a microscope cell), playback
  speed and pause, and activity level.
- **Microscope open:** the worker skips body-view positions.

`src/app/main.ts` connects the worker, both scenes and the Svelte HUD
(`src/ui/`):

- **Dock:** speed, pause, follow, activity, magnifier, reset view and info.
- **Follow panel:** collapsible to a pill. It shows saturation and PO2,
  location and speed, a circuit timer and previous circuits, an SO2/speed
  sparkline, the haemoglobin molecule and the Hb distribution, and a journey
  log.
- **Microscope panel:** collapsible to a pill.
- **Sheets:** bed picker (all beds, grouped by region) and activity slider.
- **Tap menu** for organs, and a first-visit hint.

## Colour scale

`src/color/saturation.ts` runs from deep navy at 0 % through blue at 50 % and
violet at 75 % to red at 100 %, interpolated in OKLab. This follows both the
anatomical red/blue convention and the blue → red ramp of oximetry imaging:

- Lightness rises monotonically, so the scale also reads in greyscale.
- The blue ↔ red axis survives red–green colour blindness.
- Stops are denser above 50 %, where most blood sits.
- The haemoglobin molecule's five states (0–4 O2) use the colours at 0, 25,
  50, 75 and 100 %.

Tests check the scale under simulated deuteranopia, protanopia and
tritanopia (Machado et al. 2009).

## Validation

`npm test` runs 61 headless tests. The main emergent results:

| Quantity | Model | Reference |
|---|---|---|
| Blood volume; share in systemic veins / pulmonary / heart | 4.84 L; 64 / 10 / 7 % | ~5 L; 64 / 9 / 7 % |
| Splanchnic share of blood volume | 35 % | ~⅓ |
| Mean circulation time, red cells / plasma | 54 s / 58 s | ~60 s; F-cell ratio ~0.9 |
| Arterial SO2 / PO2 | 97.5 % / 96 mmHg | 97–98 % / 95–100 |
| Mixed venous SO2 / PO2 | 73 % / 39 mmHg | ~75 % / ~40 |
| Lung capillary: time to 95 % PO2 equilibrium | ≈ 0.25 s of 0.75 s | ~0.25 s of 0.75 s |
| Coronary sinus / jugular / renal vein SO2 | 32 / 66 / 89 % | 25–40 / 55–75 / ~90 % |
| Median circuit via heart wall / brain / kidney / thigh muscle / foot / gut → liver | ~17 / 21 / 23 / 62 / 94 / 98 s | |
| Peak / mean aortic flow at rest | ~4.5× | ~4–6× |
| Maximal exercise: arterial / mixed venous / femoral venous SO2 | 95.7 / 23 / 16 % | > 94 / 20–30 / 10–25 % |
| Maximal exercise: lung transit / mean circulation | 0.37 s / 13 s | 0.3–0.45 s / ~13 s |

Other checks:

- flow conservation at every segment;
- Fick (lung uptake = VO2) at every activity level;
- visit fractions per tissue match flow fractions;
- single-molecule occupancy averages to the cell's saturation;
- microscope outlet saturations within 2 % of the body model;
- O2 dot counts within 15 % of theory;
- 3D paths join without gaps, and skin capillaries lie under the skin.

## Simplifications

- The anatomy is stylised and organ beds are lumped. In the body view,
  cells and capillary loops are drawn far larger than life; the microscope
  is true to scale but shows a representative patch without anastomoses,
  and the kidney view shows peritubular capillaries only.
- Red cells split at branches in proportion to blood flow, with no plasma
  skimming.
- Systemic O2 exchange happens only in capillaries, not in arterioles.
- Vertebral arteries are folded into the carotids; anterior cardiac and
  Thebesian veins into the coronary sinus.
- Atria and veins carry no pulse.
- Activity changes take effect immediately rather than over 1–2 minutes.
  Exercise is modelled as running, so the arms do little.
- O2 dot motion is illustrative. The count is quantitative; the drift
  speed is not diffusion.

## Build and deploy

- `npm run build` writes the app (`index.html`) and a plain diagnostics page
  of the simulation core (`diagnostics.html`) to `dist/`.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every
  push and pull request, and deploys `dist/` to GitHub Pages from `main`.
- `npm run artifact` builds a single self-contained HTML file, with the
  worker inlined, for hosts that need one file.
