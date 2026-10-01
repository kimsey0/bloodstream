/** Reactive UI state shared between the app controller and the Svelte HUD. */
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
  meanCirculationTime: 0,
  cardiacOutput: 0,
  bloodVolume: 0,
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
  /** Heartbeat phase (0 = start of ejection) and systolic fraction, updated every frame. */
  beatPhase: 0,
  systole: 0.35,
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
}

/** Recent (time, saturation, speed) samples of the followed cell, for the sparkline. Not reactive on purpose. */
export const history = { t: [] as number[], s: [] as number[], v: [] as number[] };
