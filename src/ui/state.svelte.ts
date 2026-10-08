/** Reactive UI state shared between the app controller and the Svelte HUD. */
import type { ColorScale } from '../color/saturation';
import { STANDARD_CONDITIONS } from '../physiology/dissociation';
import { NORMAL_SCENARIO, type Scenario } from '../physiology/scenario';
import type { OxygenBudget } from '../sim/budget';
import type { CapillaryProfile } from '../sim/oxygen';
import type { FollowInfo } from '../sim/protocol';

export const SPEEDS = [0.01, 0.1, 1, 10, 30] as const;

export const ui = $state({
  ready: false,
  paused: false,
  speed: 1 as number,
  time: 0,
  cellCount: 0,
  arterialSaturation: 0,
  mixedVenousSaturation: 0,
  arterialPo2: 0,
  mixedVenousPo2: 0,
  arterialConditions: STANDARD_CONDITIONS,
  mixedVenousConditions: STANDARD_CONDITIONS,
  meanCirculationTime: 0,
  cardiacOutput: 0,
  bloodVolume: 0,
  /** O2 delivery, use and extraction (null until the first state arrives). */
  budget: null as OxygenBudget | null,
  budgetOpen: false,
  infoOpen: false,
  follow: null as FollowInfo | null,
  /** Segment names, indexed like the circulation graph. */
  segmentNames: [] as string[],
  segmentKinds: [] as string[],
  segmentRegions: [] as string[],
  view: 'body' as 'body' | 'micro',
  pickerOpen: false,
  /** Capillary segment index of the bed the followed cell is in (or about to enter), else -1. */
  followBed: -1,
  /** Steady-state inlet/outlet saturation per capillary segment index. */
  bedSaturation: {} as Record<number, [number, number]>,
  micro: null as MicroInfo | null,
  microScalePx: 100,
  /** Where the followed cell is relative to the open microscope patch. */
  microFollow: 'none' as 'none' | 'here' | 'approaching' | 'elsewhere',
  /** Choice shown after tapping the body near an organ: follow the cell there, or zoom into the bed. */
  tapMenu: null as { x: number; y: number; cell: number | null; bed: number } | null,
  /** Panels collapsed to a small pill so the cells can be watched unobstructed. */
  followCollapsed: false,
  microCollapsed: false,
  /** Applied activity state, and the level being applied (null when idle). */
  activity: { level: 0, label: 'Rest', met: 1, heartRate: 70, cardiacOutput: 5000 / 60, vo2: 250 },
  activityPending: null as number | null,
  activityOpen: false,
  /** "What if" scenario applied, and the one being applied (null when idle). */
  scenario: NORMAL_SCENARIO as Scenario,
  scenarioPending: null as Scenario | null,
  whatIfOpen: false,
  /** The last activity or scenario the body could not sustain, and the organ that ran short. */
  limit: null as { level: number; organ: string; label: string } | null,
  /** Cardiac output the tissues ask for, mL/s (above the actual one when the maximum binds). */
  demandedCardiacOutput: 0,
  /** Heartbeat phase (0 = start of ejection) and systolic fraction, updated every frame. */
  beatPhase: 0,
  systole: 0.35,
  /** Saturation colour scale: blue–red code, or natural reds as real blood looks. */
  colorScale: 'blue-red' as ColorScale,
  /** First-visit hint card. */
  hintOpen: false,
});

export interface MicroInfo {
  capillary: number;
  label: string;
  blurb: string;
  lengthUm: number;
  diameterUm: number;
  transit: number;
  speedUm: number;
  saturationIn: number;
  saturationOut: number;
  /** Mean O2 dots per cell passage (each dot = 10⁹ molecules). */
  dotsPerPass: number;
  fiberLabel?: string;
  lung: boolean;
  /** PO2 the capillaries exchange with: alveolar gas, or the tissue's cells (mmHg). */
  targetPo2: number;
  /** Lungs: alveolar PO2 of the lowest and highest V/Q units, mmHg, else null. */
  unitPo2: [number, number] | null;
  /** Time-averaged PO2 of blood in the capillaries, mmHg. */
  meanCapillaryPo2: number;
  /** O2 diffusing capacity of this bed now and at rest, mL O2/min/mmHg. */
  diffusingCapacity: number;
  restDiffusingCapacity: number;
  /** Myoglobin saturation in muscle and heart cells, else null. */
  myoglobin: number | null;
  /** PO2 and saturation of a cell along the capillary, with the bed's mean and fastest-10 % transit times, s. */
  profile: CapillaryProfile & { transit: number; fastTransit: number };
}

/** Recent (time, saturation, speed, PO2, O2 content, virtual-PO2 factor of the blood around it) samples of the followed cell, for the sparkline. Not reactive on purpose. */
export const history = { t: [] as number[], s: [] as number[], v: [] as number[], p: [] as number[], c: [] as number[], f: [] as number[] };
