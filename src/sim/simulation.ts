/**
 * Monte Carlo simulation of a sample of tracer red blood cells.
 *
 * Each cell sits in one segment, with a transit time drawn for that visit.
 * When the transit ends it moves to a downstream segment, chosen with
 * probability proportional to flow, so each cell takes its own route. In
 * exchanging capillaries its PO2 is integrated with the Bohr model from
 * `oxygen.ts`. Everything is in physiological seconds and independent of
 * frame rate.
 */
import { o2Content, po2FromContent, saturation, STANDARD_CONDITIONS, type BloodConditions } from '../physiology/dissociation';
import { CardiacWaveform, flowRate, pulsatility } from '../physiology/heartbeat';
import { REST } from '../physiology/params';
import { Circulation, type Segment } from './circulation';
import { integratePo2, solveSteadyState, type ExchangeModel, type SteadyState } from './oxygen';
import { Rng } from './rng';

export interface SimulationOptions {
  cellCount: number;
  seed?: number;
  circulation?: Circulation;
  steadyState?: SteadyState;
  /** Heart rate, beats/min (default: resting). Set to 0 for steady, non-pulsatile flow. */
  heartRate?: number;
}

export interface TransitionEvent {
  cell: number;
  /** Segment index being left. */
  from: number;
  /** Segment index being entered. */
  to: number;
  /** Simulation time of the transition, s. */
  time: number;
  /** Cell PO2 at the transition, mmHg. */
  po2: number;
}

export type TransitionListener = (e: TransitionEvent) => void;

/** Blunted velocity profile v ∝ 1 − (r/R)^k, with cells kept out of the cell-free layer near the wall. */
const PROFILE_K = 4;
const PROFILE_CORE = 0.9;
const PROFILE_MEAN = 1 - (2 * Math.pow(PROFILE_CORE, PROFILE_K)) / (PROFILE_K + 2);

/** Speed at the slow end of a lumped arteriole/venule segment, as a fraction of its mean (fast end: 2 − this). */
const RAMP_MIN = 0.25;
/** Position fraction for time fraction t when speed rises linearly from RAMP_MIN to 2 − RAMP_MIN times the mean. */
const rampUp = (t: number) => RAMP_MIN * t + (1 - RAMP_MIN) * t * t;
const rampUpSlope = (t: number) => RAMP_MIN + 2 * (1 - RAMP_MIN) * t;

export class Simulation {
  circulation: Circulation;
  steady: SteadyState;
  /** Aortic flow waveform, or null for steady flow. */
  waveform: CardiacWaveform | null;
  readonly count: number;
  time = 0;

  /** Current segment index per cell. */
  readonly segment: Int32Array;
  /** Time spent in the current segment, s. */
  readonly elapsed: Float64Array;
  /** Transit time drawn for the current visit, s. */
  readonly duration: Float64Array;
  /** Cell (plasma-equilibrated) PO2, mmHg. */
  readonly po2: Float64Array;

  private readonly rng: Rng;
  private exchange: (ExchangeModel | undefined)[];
  /** Per-segment pulsatility (see heartbeat.ts). */
  private alpha: Float64Array;
  /** Blood conditions a cell's PO2 refers to in each segment (non-standard in exercising muscle). */
  private conditions: BloodConditions[];
  /** Aortic waveform value at the current instant. */
  private pulseNow = 1;
  /** Heartbeats since the start (fractional part = phase), kept continuous when heart rate changes. */
  private beats = 0;
  private readonly listeners = new Set<TransitionListener>();

  constructor(opts: SimulationOptions) {
    this.circulation = opts.circulation ?? new Circulation();
    this.steady = opts.steadyState ?? solveSteadyState(this.circulation);
    this.count = opts.cellCount;
    this.rng = new Rng(opts.seed ?? 1);
    this.exchange = this.circulation.segments.map((s) => this.steady.exchange.get(s.index));
    this.alpha = new Float64Array(this.circulation.segments.map(pulsatility));
    this.conditions = this.circulation.segments.map((s) => this.exchange[s.index]?.conditions ?? STANDARD_CONDITIONS);
    const hr = opts.heartRate ?? REST.heartRate;
    this.waveform = hr > 0 ? new CardiacWaveform(hr) : null;
    this.segment = new Int32Array(this.count);
    this.elapsed = new Float64Array(this.count);
    this.duration = new Float64Array(this.count);
    this.po2 = new Float64Array(this.count);
    this.seed();
  }

  /** Spread cells over segments in proportion to their red cell volume, at steady-state O2. */
  private seed(): void {
    const segs = this.circulation.segments;
    const weights = segs.map((s) => s.volume * s.hct);
    const total = weights.reduce((a, b) => a + b, 0);
    const cumulative: number[] = [];
    let acc = 0;
    for (const w of weights) cumulative.push((acc += w / total));
    for (let i = 0; i < this.count; i++) {
      // Stratified sampling keeps small samples representative.
      const u = (i + this.rng.next()) / this.count;
      let k = cumulative.findIndex((c) => c >= u);
      if (k < 0) k = segs.length - 1;
      const s = segs[k];
      this.segment[i] = k;
      this.duration[i] = this.drawTransit(s);
      this.elapsed[i] = this.rng.next() * this.duration[i];
      const ex = this.exchange[k];
      const p0 = this.steady.segments[k].po2InLocal;
      this.po2[i] = ex ? integratePo2(p0, this.elapsed[i], ex) : p0;
    }
  }

  /** Transit time for one visit to a segment. */
  drawTransit(s: Segment): number {
    if (s.transitCv !== undefined) return this.rng.lognormal(s.transit, s.transitCv);
    // Named vessels: pick a radial position weighted by flux, keep it for the whole segment.
    // Weighting by flux keeps the mean transit equal to volume / flow.
    for (;;) {
      const x = PROFILE_CORE * Math.sqrt(this.rng.next());
      const g = 1 - Math.pow(x, PROFILE_K);
      if (this.rng.next() < g) return (s.transit * PROFILE_MEAN) / g;
    }
  }

  addListener(l: TransitionListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Advance the simulation by dt physiological seconds. */
  step(dt: number): void {
    const segs = this.circulation.segments;
    const t0 = this.time;
    // Mean pulse over this step: segments advance at mean × (1 + α (W − 1)).
    const db = this.waveform ? dt / this.waveform.period : 0;
    const W = this.waveform ? this.waveform.meanOverBeats(this.beats, db) : 1;
    for (let i = 0; i < this.count; i++) {
      let remaining = dt;
      while (remaining > 0) {
        const k = this.segment[i];
        const rate = flowRate(this.alpha[k], W);
        // `elapsed` and `duration` are in flow-weighted time: a segment's transit is reached
        // after `duration` seconds of mean flow, faster in systole, slower (or not at all) in diastole.
        const left = this.duration[i] - this.elapsed[i];
        const needed = rate > 1e-9 ? left / rate : Infinity;
        const h = Math.min(remaining, needed);
        const ex = this.exchange[k];
        if (ex && h > 0) this.po2[i] = integratePo2(this.po2[i], h, ex);
        remaining -= h;
        if (h < needed) {
          this.elapsed[i] += h * rate;
          break;
        }
        const s = segs[k];
        const u = this.rng.next();
        let c = 0;
        while (c < s.nextCumulative.length - 1 && u >= s.nextCumulative[c]) c++;
        const next = s.nextIndex[c];
        if (this.conditions[next] !== this.conditions[k]) {
          // Same O2 content, different curve: re-express PO2 under the new segment's conditions.
          this.po2[i] = po2FromContent(o2Content(this.po2[i], this.conditions[k]), this.conditions[next]);
        }
        this.segment[i] = next;
        this.elapsed[i] = 0;
        this.duration[i] = this.drawTransit(segs[next]);
        if (this.listeners.size) {
          const e: TransitionEvent = { cell: i, from: k, to: next, time: t0 + dt - remaining, po2: this.po2[i] };
          for (const l of this.listeners) l(e);
        }
      }
    }
    this.time = t0 + dt;
    this.beats += db;
    this.pulseNow = this.waveform ? this.waveform.w(this.beatPhase) : 1;
  }

  /** Phase within the current heartbeat (0 = start of ejection), or 0 for steady flow. */
  get beatPhase(): number {
    return this.beats - Math.floor(this.beats);
  }

  /**
   * Switch to a new physiological state (another activity level) on the same graph. Cells stay
   * where they are: time already spent in a segment is rescaled to its new transit time, and PO2
   * is re-expressed where blood conditions change. The heartbeat keeps its phase.
   */
  setState(circulation: Circulation, steady: SteadyState, heartRate: number): void {
    const old = this.circulation.segments;
    const oldConditions = this.conditions;
    this.circulation = circulation;
    this.steady = steady;
    this.exchange = circulation.segments.map((s) => steady.exchange.get(s.index));
    this.conditions = circulation.segments.map((s) => this.exchange[s.index]?.conditions ?? STANDARD_CONDITIONS);
    for (let i = 0; i < this.count; i++) {
      const k = this.segment[i];
      const ratio = circulation.segments[k].transit / old[k].transit;
      this.elapsed[i] *= ratio;
      this.duration[i] *= ratio;
      if (oldConditions[k] !== this.conditions[k]) {
        this.po2[i] = po2FromContent(o2Content(this.po2[i], oldConditions[k]), this.conditions[k]);
      }
    }
    this.waveform = heartRate > 0 ? new CardiacWaveform(heartRate) : null;
  }

  saturation(cell: number): number {
    return saturation(this.po2[cell], this.conditions[this.segment[cell]]);
  }

  /** Fraction (0–1) of the current segment's transit time already spent. */
  progress(cell: number): number {
    return this.elapsed[cell] / this.duration[cell];
  }

  /**
   * Fraction (0–1) of the current segment's length already travelled. Lumped arterioles and
   * venules span vessels of very different widths, so speed is not uniform along them: cells
   * slow from small-artery speeds to arteriole speeds, and speed up again from venules into
   * small veins. Transit time is unaffected.
   */
  positionFraction(cell: number): number {
    const t = this.progress(cell);
    switch (this.circulation.segments[this.segment[cell]].kind) {
      case 'venule':
        return rampUp(t);
      case 'arteriole':
        return 1 - rampUp(1 - t);
      default:
        return t;
    }
  }

  /** The cell's current speed, mm/s. */
  speed(cell: number): number {
    const seg = this.circulation.segments[this.segment[cell]];
    const mean = (seg.length / this.duration[cell]) * flowRate(this.alpha[seg.index], this.pulseNow);
    const t = this.progress(cell);
    if (seg.kind === 'venule') return mean * rampUpSlope(t);
    if (seg.kind === 'arteriole') return mean * rampUpSlope(1 - t);
    return mean;
  }
}
