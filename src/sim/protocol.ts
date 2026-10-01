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
  /** Buffers handed back for reuse. */
  positions?: Float32Array;
  saturations?: Float32Array;
}

export interface ControlMessage {
  type: 'control';
  speed?: number;
  paused?: boolean;
}

export type ToWorker = InitMessage | TickMessage | ControlMessage;

/** Steady-state oxygen along each segment, for colouring vessels. */
export interface ReadyMessage {
  type: 'ready';
  cellCount: number;
  /** segments × PROFILE_SAMPLES saturations from inlet to outlet. */
  profiles: Float32Array;
  arterialSaturation: number;
  mixedVenousSaturation: number;
  meanCirculationTime: number;
}

export interface FrameMessage {
  type: 'frame';
  /** Simulation time, s. */
  time: number;
  /** cellCount × 3, cm. */
  positions: Float32Array;
  saturations: Float32Array;
}

export type FromWorker = ReadyMessage | FrameMessage;

export const PROFILE_SAMPLES = 16;
