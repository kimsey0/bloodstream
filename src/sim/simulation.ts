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
import { saturation } from '../physiology/dissociation';
import { Circulation, type Segment } from './circulation';
import { integratePo2, solveSteadyState, type ExchangeModel, type SteadyState } from './oxygen';
import { Rng } from './rng';

export interface SimulationOptions {
  cellCount: number;
  seed?: number;
  circulation?: Circulation;
  steadyState?: SteadyState;
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

export class Simulation {
  readonly circulation: Circulation;
  readonly steady: SteadyState;
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
  private readonly exchange: (ExchangeModel | undefined)[];
  private readonly listeners = new Set<TransitionListener>();

  constructor(opts: SimulationOptions) {
    this.circulation = opts.circulation ?? new Circulation();
    this.steady = opts.steadyState ?? solveSteadyState(this.circulation);
    this.count = opts.cellCount;
    this.rng = new Rng(opts.seed ?? 1);
    this.exchange = this.circulation.segments.map((s) => this.steady.exchange.get(s.index));
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
      const p0 = this.steady.segments[k].po2In;
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
    for (let i = 0; i < this.count; i++) {
      let remaining = dt;
      while (remaining > 0) {
        const k = this.segment[i];
        const left = this.duration[i] - this.elapsed[i];
        const h = Math.min(remaining, left);
        const ex = this.exchange[k];
        if (ex && h > 0) this.po2[i] = integratePo2(this.po2[i], h, ex);
        remaining -= h;
        if (h < left) {
          this.elapsed[i] += h;
          break;
        }
        const s = segs[k];
        const u = this.rng.next();
        let c = 0;
        while (c < s.nextCumulative.length - 1 && u >= s.nextCumulative[c]) c++;
        const next = s.nextIndex[c];
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
  }

  saturation(cell: number): number {
    return saturation(this.po2[cell]);
  }

  /** Fraction (0–1) of the current segment already travelled. */
  progress(cell: number): number {
    return this.elapsed[cell] / this.duration[cell];
  }

  /** The cell's current speed, mm/s. */
  speed(cell: number): number {
    return this.circulation.segments[this.segment[cell]].length / this.duration[cell];
  }
}
