/** Messages between the main thread and the simulation worker. */

export interface InitMessage {
  type: 'init';
  cellCount: number;
  seed: number;
  lut: Float32Array;
  radius: Float32Array;
}

export interface TickMessage {
  type: 'tick';
  /** Wall-clock seconds since the previous tick. */
  wallDt: number;
  /** True while the body view is hidden: skip computing cell positions. */
  skipPositions?: boolean;
  /** Buffers handed back for reuse. */
  positions?: Float32Array;
  saturations?: Float32Array;
}

export interface ControlMessage {
  type: 'control';
  speed?: number;
  paused?: boolean;
}

/** Follow a cell by index, a random cell just leaving the heart (-1), or stop (null). */
export interface FollowMessage {
  type: 'follow';
  cell: number | null;
}

/**
 * Follow a cell picked in the microscope view: a tracer takes over that local cell's place
 * (segment, time into the segment, transit time and PO2) and is followed from there.
 */
export interface AdoptMessage {
  type: 'adopt';
  segment: number;
  elapsed: number;
  duration: number;
  po2: number;
}

export type ToWorker = InitMessage | TickMessage | ControlMessage | FollowMessage | AdoptMessage;

/** Steady-state oxygen along each segment, for colouring vessels. */
export interface ReadyMessage {
  type: 'ready';
  cellCount: number;
  /** segments × PROFILE_SAMPLES saturations from inlet to outlet. */
  profiles: Float32Array;
  arterialSaturation: number;
  mixedVenousSaturation: number;
  meanCirculationTime: number;
  /** Exchange models of every capillary bed, for the microscope view. */
  exchange: ExchangeInfo[];
}

export interface ExchangeInfo {
  segment: number;
  conductance: number;
  targetPo2: number;
  po2In: number;
  saturationIn: number;
  saturationOut: number;
}

export interface RouteStep {
  segment: number;
  enter: number;
  exit?: number;
  saturationIn: number;
  saturationOut?: number;
}

export interface FollowInfo {
  cell: number;
  segment: number;
  /** 0–1 through the current segment. */
  progress: number;
  /** Time spent / expected in the current segment, s. */
  segmentElapsed: number;
  segmentDuration: number;
  po2: number;
  saturation: number;
  /** Current speed, mm/s. */
  speed: number;
  /** Time since this cell last left the left ventricle, s (NaN until it gets there). */
  circuitElapsed: number;
  /** Organ beds passed so far in this circuit. */
  circuitVia: string[];
  laps: { duration: number; via: string[] }[];
  /** Most recent segments, oldest first. */
  route: RouteStep[];
  /** The representative haemoglobin: which of α1, β1, α2, β2 hold O2. */
  sites: boolean[];
  bound: number;
  /** Fraction of this cell's Hb molecules with 0..4 O2 bound. */
  hbDistribution: number[];
}

export interface FrameMessage {
  type: 'frame';
  /** Simulation time, s. */
  time: number;
  /** cellCount × 3, cm. */
  positions: Float32Array;
  saturations: Float32Array;
  /** False when positions were skipped for this frame (contents are stale). */
  positionsValid: boolean;
  follow?: FollowInfo;
}

export type FromWorker = ReadyMessage | FrameMessage;

export const PROFILE_SAMPLES = 16;
