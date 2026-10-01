/// <reference lib="webworker" />
/**
 * Runs the Simulation off the main thread. The main thread sends one `tick`
 * per animation frame and gets back cell positions and saturations. Ticks
 * alternate with frames, so the queue never backs up on slow devices.
 */
import { samplePath } from '../anatomy/lut';
import { saturation } from '../physiology/dissociation';
import { integratePo2 } from './oxygen';
import { PROFILE_SAMPLES, type FromWorker, type InitMessage, type ToWorker } from './protocol';
import { Rng } from './rng';
import { Simulation } from './simulation';
import { CellTracker } from './tracking';

declare const self: DedicatedWorkerGlobalScope;

/** Longest physiological step taken per tick, s (keeps 30× smooth on slow frames). */
const MAX_STEP = 1;

let sim: Simulation | undefined;
let lut: Float32Array;
let radius: Float32Array;
let speed = 1;
let paused = false;
/** Fixed per-cell radial offset inside large vessels, so cells don't run single file down the centre line. */
let offsetR: Float32Array;
let offsetTheta: Float32Array;
let tracker: CellTracker | undefined;
const pickRng = new Rng(99);

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function init(msg: InitMessage): void {
  sim = new Simulation({ cellCount: msg.cellCount, seed: msg.seed });
  lut = msg.lut;
  radius = msg.radius;
  const rng = new Rng(msg.seed + 1);
  offsetR = new Float32Array(sim.count).map(() => 0.75 * Math.sqrt(rng.next()));
  offsetTheta = new Float32Array(sim.count).map(() => rng.next() * 2 * Math.PI);

  const segs = sim.circulation.segments;
  const profiles = new Float32Array(segs.length * PROFILE_SAMPLES);
  for (const s of segs) {
    const o = sim.steady.segments[s.index];
    const ex = sim.steady.exchange.get(s.index);
    for (let k = 0; k < PROFILE_SAMPLES; k++) {
      const f = k / (PROFILE_SAMPLES - 1);
      profiles[s.index * PROFILE_SAMPLES + k] = ex ? saturation(integratePo2(o.po2In, f * s.transit, ex)) : o.saturationIn;
    }
  }
  post({
    type: 'ready',
    cellCount: sim.count,
    profiles,
    arterialSaturation: sim.steady.arterial.saturationIn,
    mixedVenousSaturation: sim.steady.mixedVenous.saturationIn,
    meanCirculationTime: sim.circulation.meanRbcCirculationTime,
    exchange: [...sim.steady.exchange].map(([segment, ex]) => ({
      segment,
      conductance: ex.conductance,
      targetPo2: ex.targetPo2,
      po2In: sim!.steady.segments[segment].po2In,
      saturationIn: sim!.steady.segments[segment].saturationIn,
      saturationOut: sim!.steady.segments[segment].saturationOut,
    })),
  });
}

function tick(wallDt: number, positions?: Float32Array, saturations?: Float32Array): void {
  if (!sim) return;
  if (!paused) {
    const dt = Math.min(MAX_STEP, Math.max(0, wallDt) * speed);
    sim.step(dt);
    tracker?.stepMolecule(dt);
  }
  const n = sim.count;
  const pos = positions?.length === n * 3 ? positions : new Float32Array(n * 3);
  const sat = saturations?.length === n ? saturations : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const seg = sim.segment[i];
    samplePath(lut, radius, seg, sim.progress(i), offsetR[i], offsetTheta[i], pos, i * 3);
    sat[i] = sim.saturation(i);
  }
  post({ type: 'frame', time: sim.time, positions: pos, saturations: sat, follow: followInfo() }, [pos.buffer, sat.buffer]);
}

function follow(cell: number | null): void {
  tracker?.dispose();
  tracker = undefined;
  if (!sim || cell === null) return;
  if (cell < 0) {
    // A random cell currently in the left ventricle, so its first circuit is timed from the start.
    const lv = sim.circulation.root.index;
    const candidates: number[] = [];
    for (let i = 0; i < sim.count; i++) if (sim.segment[i] === lv) candidates.push(i);
    cell = candidates.length ? candidates[Math.floor(pickRng.next() * candidates.length)] : Math.floor(pickRng.next() * sim.count);
  }
  tracker = new CellTracker(sim, cell, Math.floor(pickRng.next() * 1e9));
}

function followInfo() {
  if (!sim || !tracker) return undefined;
  const c = tracker.cell;
  return {
    cell: c,
    segment: sim.segment[c],
    progress: sim.progress(c),
    segmentElapsed: sim.elapsed[c],
    segmentDuration: sim.duration[c],
    po2: sim.po2[c],
    saturation: sim.saturation(c),
    speed: sim.speed(c),
    circuitElapsed: tracker.timeSinceLapStart,
    circuitVia: [...tracker.currentVia],
    laps: tracker.laps.slice(-8),
    route: tracker.route.slice(-16).map((r) => ({ ...r })),
    sites: [...tracker.molecule.sites],
    bound: tracker.molecule.bound,
    hbDistribution: tracker.hemoglobinDistribution,
  };
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      init(msg);
      break;
    case 'tick':
      tick(msg.wallDt, msg.positions, msg.saturations);
      break;
    case 'follow':
      follow(msg.cell);
      break;
    case 'control':
      if (msg.speed !== undefined) speed = msg.speed;
      if (msg.paused !== undefined) paused = msg.paused;
      break;
  }
};
