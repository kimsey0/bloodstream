import type { BloodConditions } from '../physiology/dissociation';
import type { Scenario } from '../physiology/scenario';
import type { OxygenBudget } from './budget';
import type { ExchangeModel } from './oxygen';

/** Messages between the main thread and the simulation worker. */

export interface InitMessage {
  type: 'init';
  cellCount: number;
  seed: number;
  lut: Float32Array;
  radius: Float32Array;
  /** Segment → first path / number of strands / organ bed id (-1 for named vessels). */
  pathBase: Int32Array;
  pathCount: Int32Array;
  bedOfSegment: Int32Array;
  /** Path → fraction along the feeding / draining named vessel where it branches off / joins, or -1. */
  pathStart: Float32Array;
  pathEnd: Float32Array;
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
  /** O2 content of the adopted cell, mL O2 per mL blood. */
  content: number;
}

/** Change the activity level (0 = rest, 1 = maximal exercise). */
export interface ActivityMessage {
  type: 'activity';
  level: number;
  /** "What if" blood and altitude (default: keep the current one). */
  scenario?: Scenario;
}

export type ToWorker = InitMessage | TickMessage | ControlMessage | FollowMessage | AdoptMessage | ActivityMessage;

export interface ActivitySummary {
  level: number;
  label: string;
  met: number;
  heartRate: number;
  /** mL/s. */
  cardiacOutput: number;
  /** mL/min. */
  vo2: number;
}

/** Steady-state oxygen along each segment, for colouring vessels. */
export interface ReadyMessage {
  /** 'ready' once after start-up, 'state' after each activity change. */
  type: 'ready' | 'state';
  activity: ActivitySummary;
  cellCount: number;
  /** segments × PROFILE_SAMPLES saturations from inlet to outlet. */
  profiles: Float32Array;
  arterialSaturation: number;
  mixedVenousSaturation: number;
  /** Mean arterial and mixed venous PO2 (mmHg), and blood conditions, for the dissociation-curve chart. */
  arterialPo2: number;
  mixedVenousPo2: number;
  arterialConditions: BloodConditions;
  mixedVenousConditions: BloodConditions;
  meanCirculationTime: number;
  /** Exchange models of every capillary bed, for the microscope view. */
  exchange: ExchangeInfo[];
  /** Mean red-cell transit time of every segment now, s. */
  transits: Float32Array;
  /** The "what if" scenario this state is for. */
  scenario: Scenario;
  /** Cardiac output the tissues asked for, mL/s (above the actual one when the maximum binds). */
  demandedCardiacOutput: number;
  /** O2 delivery, use and extraction, whole body and per organ. */
  budget: OxygenBudget;
}

/** An activity level or scenario the body cannot sustain; the previous state stays. */
export interface RejectedMessage {
  type: 'rejected';
  level: number;
  scenario: Scenario;
  /** Segment id of the tissue that could not get its O2. */
  segment: string;
}

export interface ExchangeInfo {
  segment: number;
  model: ExchangeModel;
  /** Lungs: the exchange models and V/Q ratios of the bed's gas-exchange units. */
  units?: ExchangeModel[];
  vq?: number[];
  /** Mean inlet O2 content, mL O2 per mL blood. */
  contentIn: number;
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
  /** O2 content, mL O2 per mL blood. */
  content: number;
  /** In an exchanging capillary: the PO2 it exchanges with (alveolar gas or the tissue's cells). */
  /** In a capillary: the PO2 it exchanges with, and in the lungs its gas-exchange unit's V/Q ratio. */
  exchangeTarget: { po2: number; kind: 'alveolar' | 'tissue'; vq?: number } | null;
  /** Blood conditions around the cell: PCO2, pH and temperature shift the O2 curve. */
  conditions: BloodConditions;
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
  /** Phase within the heartbeat (0 = start of ejection) and the systolic fraction of the beat. */
  beatPhase: number;
  systole: number;
  follow?: FollowInfo;
}

export type FromWorker = ReadyMessage | FrameMessage | RejectedMessage;

export const PROFILE_SAMPLES = 16;
