/// <reference lib="webworker" />
/**
 * Runs the Simulation off the main thread. The main thread sends one `tick`
 * per animation frame and gets back cell positions and saturations. Ticks
 * alternate with frames, so the queue never backs up on slow devices.
 */
import { samplePath } from '../anatomy/lut';
import { exchangeSaturation, integrateContent } from './oxygen';
import { PROFILE_SAMPLES, type AdoptMessage, type FromWorker, type InitMessage, type ToWorker } from './protocol';
import { Rng } from './rng';
import { activityState } from '../physiology/activity';
import { Circulation } from './circulation';
import { solveSteadyState, type SteadyState } from './oxygen';
import { Simulation } from './simulation';
import { CellTracker } from './tracking';

declare const self: DedicatedWorkerGlobalScope;

/** Longest physiological step taken per tick, s (keeps 30× smooth on slow frames). */
const MAX_STEP = 1;

let sim: Simulation | undefined;
let lut: Float32Array;
let radius: Float32Array;
let pathBase: Int32Array;
let pathCount: Int32Array;
let bedOfSegment: Int32Array;
let pathStart: Float32Array;
let pathEnd: Float32Array;
/** Which strand of its current (or next) organ bed each cell uses; kept from arterioles to venules. */
let strand: Int32Array;
/** Path each cell was on in its previous segment (-1 if unknown). */
let prevPath: Int32Array;
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
  pathBase = msg.pathBase;
  pathCount = msg.pathCount;
  bedOfSegment = msg.bedOfSegment;
  pathStart = msg.pathStart;
  pathEnd = msg.pathEnd;
  const rng = new Rng(msg.seed + 1);
  strand = new Int32Array(sim.count).map(() => Math.floor(rng.next() * 1e6));
  prevPath = new Int32Array(sim.count).fill(-1);
  sim.addListener((e) => {
    prevPath[e.cell] = pathOf(e.cell, e.from);
    // About to enter a new organ bed: pick one of its strands now, so the cell can branch off
    // the feeding artery where that strand does.
    const next = sim!.next[e.cell];
    if (bedOfSegment[next] >= 0 && bedOfSegment[next] !== bedOfSegment[e.to]) strand[e.cell] = Math.floor(rng.next() * 1e6);
  });
  offsetR = new Float32Array(sim.count).map(() => 0.75 * Math.sqrt(rng.next()));
  offsetTheta = new Float32Array(sim.count).map(() => rng.next() * 2 * Math.PI);

  postState('ready');
}

function pathOf(cell: number, seg: number): number {
  return pathBase[seg] + (strand[cell] % pathCount[seg]);
}

/**
 * Where along its current path a cell is. In a named vessel, a cell that came from an organ
 * bed starts where that strand joined it, and one bound for a bed stops where its strand
 * branches off.
 */
function pathFraction(cell: number, seg: number): number {
  const f = sim!.positionFraction(cell);
  if (bedOfSegment[seg] >= 0) return f;
  const prev = prevPath[cell];
  const lo = prev >= 0 && pathEnd[prev] >= 0 ? pathEnd[prev] : 0;
  const next = sim!.next[cell];
  const start = bedOfSegment[next] >= 0 ? pathStart[pathOf(cell, next)] : -1;
  const hi = start >= 0 ? Math.max(start, lo) : 1;
  return lo + f * (hi - lo);
}

/** Send the current physiological state: vessel colours, headline numbers and exchange models. */
function postState(type: 'ready' | 'state'): void {
  if (!sim) return;
  const segs = sim.circulation.segments;
  const a = sim.circulation.activity;
  const profiles = new Float32Array(segs.length * PROFILE_SAMPLES);
  for (const s of segs) {
    const o = sim.steady.segments[s.index];
    const ex = sim.steady.exchange.get(s.index);
    for (let k = 0; k < PROFILE_SAMPLES; k++) {
      const f = k / (PROFILE_SAMPLES - 1);
      profiles[s.index * PROFILE_SAMPLES + k] = ex ? exchangeSaturation(ex, integrateContent(o.contentIn, f * s.transit, ex)) : o.saturationIn;
    }
  }
  post({
    type,
    cellCount: sim.count,
    profiles,
    arterialSaturation: sim.steady.arterial.saturationIn,
    mixedVenousSaturation: sim.steady.mixedVenous.saturationIn,
    arterialPo2: sim.steady.arterial.po2In,
    mixedVenousPo2: sim.steady.mixedVenous.po2In,
    arterialConditions: sim.steady.arterial.conditionsIn,
    mixedVenousConditions: sim.steady.mixedVenous.conditionsIn,
    meanCirculationTime: sim.circulation.meanRbcCirculationTime,
    activity: { level: a.level, label: a.label, met: a.met, heartRate: a.heartRate, cardiacOutput: a.cardiacOutput, vo2: a.vo2 },
    exchange: [...sim.steady.exchange].map(([segment, ex]) => ({
      segment,
      model: ex,
      contentIn: sim!.steady.segments[segment].contentIn,
      saturationIn: sim!.steady.segments[segment].saturationIn,
      saturationOut: sim!.steady.segments[segment].saturationOut,
    })),
  });
}

/** Solved states per activity level (rounded to 0.01), since solving takes ~1–2 s. */
const stateCache = new Map<number, { circ: Circulation; steady: SteadyState }>();

function setActivity(level: number): void {
  if (!sim) return;
  const key = Math.round(level * 100);
  let st = stateCache.get(key);
  if (!st) {
    const circ = new Circulation({ activity: activityState(key / 100) });
    st = { circ, steady: solveSteadyState(circ) };
    stateCache.set(key, st);
  }
  sim.setState(st.circ, st.steady, st.circ.activity.heartRate);
  postState('state');
}

function tick(wallDt: number, positions?: Float32Array, saturations?: Float32Array, skipPositions = false): void {
  if (!sim) return;
  if (!paused) {
    const dt = Math.min(MAX_STEP, Math.max(0, wallDt) * speed);
    sim.step(dt);
    tracker?.stepMolecule(dt);
  }
  const n = sim.count;
  const pos = positions?.length === n * 3 ? positions : new Float32Array(n * 3);
  const sat = saturations?.length === n ? saturations : new Float32Array(n);
  for (let i = 0; i < n && !skipPositions; i++) {
    const seg = sim.segment[i];
    samplePath(lut, radius, pathOf(i, seg), pathFraction(i, seg), offsetR[i], offsetTheta[i], pos, i * 3);
    sat[i] = sim.saturation(i);
  }
  post(
    {
      type: 'frame',
      time: sim.time,
      positions: pos,
      saturations: sat,
      positionsValid: !skipPositions,
      beatPhase: sim.beatPhase,
      systole: sim.waveform?.systole ?? 0.35,
      follow: followInfo(),
    },
    [pos.buffer, sat.buffer],
  );
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

/**
 * Put a tracer where the user tapped a microscope cell and follow it. Prefer a tracer already
 * in that segment (closest in progress), so the sample is disturbed as little as possible.
 */
function adopt(msg: AdoptMessage): void {
  if (!sim) return;
  const target = msg.elapsed / msg.duration;
  let cell = -1;
  let best = Infinity;
  for (let i = 0; i < sim.count; i++) {
    if (sim.segment[i] !== msg.segment) continue;
    const d = Math.abs(sim.progress(i) - target);
    if (d < best) {
      best = d;
      cell = i;
    }
  }
  if (cell < 0) cell = Math.floor(pickRng.next() * sim.count);
  sim.segment[cell] = msg.segment;
  sim.next[cell] = sim.chooseNext(msg.segment);
  prevPath[cell] = -1;
  sim.duration[cell] = msg.duration;
  sim.elapsed[cell] = Math.min(msg.elapsed, msg.duration * 0.999);
  sim.content[cell] = msg.content;
  sim.refresh(cell);
  follow(cell);
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
    po2: sim.po2(c),
    saturation: sim.saturation(c),
    content: sim.content[c],
    conditions: sim.conditionsOf(c),
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
      tick(msg.wallDt, msg.positions, msg.saturations, msg.skipPositions);
      break;
    case 'follow':
      follow(msg.cell);
      break;
    case 'activity':
      setActivity(msg.level);
      break;
    case 'adopt':
      adopt(msg);
      break;
    case 'control':
      if (msg.speed !== undefined) speed = msg.speed;
      if (msg.paused !== undefined) paused = msg.paused;
      break;
  }
};
