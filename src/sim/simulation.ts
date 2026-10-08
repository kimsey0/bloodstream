/**
 * Monte Carlo simulation of a sample of tracer red blood cells.
 *
 * Each cell sits in one segment, with a transit time drawn for that visit.
 * When the transit ends it moves to a downstream segment, chosen with
 * probability proportional to flow, so each cell takes its own route. A
 * cell carries its O2 content; in exchanging capillaries that is integrated
 * with the Bohr model from `oxygen.ts`. Its PO2 and saturation follow from
 * the blood's conditions where it is. Everything is in physiological
 * seconds and independent of frame rate.
 */
import { BLOOD, O2_CAPACITY, virtualPo2Factor, type BloodConditions } from '../physiology/dissociation';
import { CardiacWaveform, flowRate, PULSE_CHANNELS, pulseChannel, pulsatility } from '../physiology/heartbeat';
import { REST } from '../physiology/params';
import { Circulation, type Segment } from './circulation';
import { conditionsAt, exchangePo2, integrateContent, po2OnCurve, solveSteadyState, type ExchangeModel, type SteadyState } from './oxygen';
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
  /** Cell PO2 at the transition, mmHg, under the entered segment's blood conditions. */
  po2: number;
  /** Cell O2 saturation and content (mL O2 per mL blood) at the transition. */
  saturation: number;
  content: number;
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
  /** Cell O2 content, mL O2 per mL blood: what a cell carries from vessel to vessel. */
  readonly content: Float64Array;
  /** Cached PO2 (mmHg) and saturation per cell, refreshed whenever content or surroundings change. */
  private readonly po2Now: Float64Array;
  private readonly satNow: Float64Array;
  /**
   * Segment each cell moves into when its current transit ends, chosen (by flow) as it enters
   * the current one. Knowing it early lets the body view branch cells off a feeding artery
   * at the right place.
   */
  readonly next: Int32Array;

  private readonly rng: Rng;
  private exchange: (ExchangeModel | undefined)[];
  /** Per segment, the exchange models of its V/Q units (lungs only). */
  private units: (ExchangeModel[] | undefined)[];
  /** Which V/Q unit each cell passes through while in a lung capillary bed. */
  readonly unit: Uint8Array;
  /** Per-segment pulsatility (see heartbeat.ts). */
  private alpha: Float64Array;
  /** Per-segment pulse channel: aortic, or left or right coronary (see heartbeat.ts). */
  private channel: Uint8Array;
  /** Blood conditions in each segment outside capillaries (in capillaries they shift with exchange). */
  private conditions: BloodConditions[];
  /** Virtual-PO2 factor of each segment's conditions. */
  private factors: Float64Array;
  /** Waveform value of each pulse channel at the current instant. */
  private pulseNow = new Float64Array(PULSE_CHANNELS).fill(1);
  /** Mean waveform value of each pulse channel over the current step. */
  private readonly pulseStep = new Float64Array(PULSE_CHANNELS);
  /** Heartbeats since the start (fractional part = phase), kept continuous when heart rate changes. */
  private beats = 0;
  private readonly listeners = new Set<TransitionListener>();

  constructor(opts: SimulationOptions) {
    this.circulation = opts.circulation ?? new Circulation();
    this.steady = opts.steadyState ?? solveSteadyState(this.circulation);
    this.count = opts.cellCount;
    this.rng = new Rng(opts.seed ?? 1);
    this.exchange = this.circulation.segments.map((s) => this.steady.exchange.get(s.index));
    this.units = this.circulation.segments.map((s) => this.steady.lungUnits.get(s.index)?.models);
    this.alpha = new Float64Array(this.circulation.segments.map(pulsatility));
    this.channel = new Uint8Array(this.circulation.segments.map(pulseChannel));
    this.conditions = this.steady.segments.map((o) => o.conditionsIn);
    this.factors = new Float64Array(this.conditions.map(virtualPo2Factor));
    const hr = opts.heartRate ?? REST.heartRate;
    this.waveform = hr > 0 ? new CardiacWaveform(hr) : null;
    this.segment = new Int32Array(this.count);
    this.elapsed = new Float64Array(this.count);
    this.duration = new Float64Array(this.count);
    this.content = new Float64Array(this.count);
    this.po2Now = new Float64Array(this.count).fill(-1);
    this.satNow = new Float64Array(this.count);
    this.next = new Int32Array(this.count);
    this.unit = new Uint8Array(this.count);
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
      this.next[i] = this.chooseNext(k);
      this.duration[i] = this.drawTransit(s);
      this.elapsed[i] = this.rng.next() * this.duration[i];
      this.chooseUnit(i, k);
      const ex = this.exchangeOf(i);
      const c0 = this.steady.segments[k].contentIn;
      this.content[i] = ex ? integrateContent(c0, this.elapsed[i], ex) : c0;
      this.refresh(i);
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

  /** In a lung capillary bed, send the cell through one of its V/Q units (equal blood flow each). */
  private chooseUnit(cell: number, k: number): void {
    const u = this.units[k];
    if (u) this.unit[cell] = Math.floor(this.rng.next() * u.length);
  }

  /** The exchange model a cell follows where it is: its V/Q unit's in the lungs. */
  exchangeOf(cell: number): ExchangeModel | undefined {
    const k = this.segment[cell];
    const u = this.units[k];
    return u ? u[this.unit[cell] % u.length] : this.exchange[k];
  }

  /** Downstream segment for a cell leaving segment `k`, with probability proportional to flow. */
  chooseNext(k: number): number {
    const s = this.circulation.segments[k];
    const u = this.rng.next();
    let c = 0;
    while (c < s.nextCumulative.length - 1 && u >= s.nextCumulative[c]) c++;
    return s.nextIndex[c];
  }

  addListener(l: TransitionListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Advance the simulation by dt physiological seconds. */
  step(dt: number): void {
    const segs = this.circulation.segments;
    const t0 = this.time;
    // Mean pulse over this step: segments advance at mean × (1 + α (W − 1)), with W from their channel.
    const db = this.waveform ? dt / this.waveform.period : 0;
    const W = this.pulseStep;
    for (let c = 0; c < PULSE_CHANNELS; c++) W[c] = this.waveform ? this.waveform.channelOverBeats(c, this.beats, db) : 1;
    for (let i = 0; i < this.count; i++) {
      let remaining = dt;
      while (remaining > 0) {
        const k = this.segment[i];
        const rate = flowRate(this.alpha[k], W[this.channel[k]]);
        // `elapsed` and `duration` are in flow-weighted time: a segment's transit is reached
        // after `duration` seconds of mean flow, faster in systole, slower (or not at all) in diastole.
        const left = this.duration[i] - this.elapsed[i];
        const needed = rate > 1e-9 ? left / rate : Infinity;
        const h = Math.min(remaining, needed);
        const ex = this.exchangeOf(i);
        if (ex && h > 0) {
          this.content[i] = integrateContent(this.content[i], h, ex, this.po2Now[i]);
          this.refresh(i);
        }
        remaining -= h;
        if (h < needed) {
          this.elapsed[i] += h * rate;
          break;
        }
        const next = this.next[i];
        this.segment[i] = next;
        this.chooseUnit(i, next);
        // Same content, but the curve around the cell may differ: it shifts inside capillaries, and mixing changes it in veins.
        if (ex || this.exchange[next] || this.factors[next] !== this.factors[k]) this.refresh(i);
        this.next[i] = this.chooseNext(next);
        this.elapsed[i] = 0;
        this.duration[i] = this.drawTransit(segs[next]);
        if (this.listeners.size) {
          const e: TransitionEvent = { cell: i, from: k, to: next, time: t0 + dt - remaining, po2: this.po2(i), saturation: this.saturation(i), content: this.content[i] };
          for (const l of this.listeners) l(e);
        }
      }
    }
    this.time = t0 + dt;
    this.beats += db;
    for (let c = 0; c < PULSE_CHANNELS; c++) this.pulseNow[c] = this.waveform ? this.waveform.channelAt(c, this.beatPhase) : 1;
  }

  /** Phase within the current heartbeat (0 = start of ejection), or 0 for steady flow. */
  get beatPhase(): number {
    return this.beats - Math.floor(this.beats);
  }

  /**
   * Switch to a new physiological state (another activity level) on the same graph. Cells stay
   * where they are and keep their chosen next segment: time already spent in a segment is
   * rescaled to its new transit time, and O2 content is kept. The heartbeat keeps its phase.
   * When the blood itself changed (`reseedO2`, e.g. another Hb or CO level), contents are reset to
   * the new steady state instead: blood with other haemoglobin cannot keep its old content.
   */
  setState(circulation: Circulation, steady: SteadyState, heartRate: number, reseedO2 = false): void {
    const old = this.circulation.segments;
    this.circulation = circulation;
    this.steady = steady;
    this.exchange = circulation.segments.map((s) => steady.exchange.get(s.index));
    this.units = circulation.segments.map((s) => steady.lungUnits.get(s.index)?.models);
    this.conditions = steady.segments.map((o) => o.conditionsIn);
    this.factors = new Float64Array(this.conditions.map(virtualPo2Factor));
    for (let i = 0; i < this.count; i++) {
      const k = this.segment[i];
      const ratio = circulation.segments[k].transit / old[k].transit;
      this.elapsed[i] *= ratio;
      this.duration[i] *= ratio;
      if (reseedO2) {
        const ex = this.exchangeOf(i);
        const c0 = steady.segments[k].contentIn;
        this.content[i] = ex ? integrateContent(c0, this.elapsed[i], ex) : c0;
        this.po2Now[i] = -1;
      }
      this.refresh(i);
    }
    this.waveform = heartRate > 0 ? new CardiacWaveform(heartRate) : null;
  }

  /** Recompute a cell's PO2 and saturation after its content, segment or the state changed. */
  refresh(cell: number): void {
    const k = this.segment[cell];
    const ex = this.exchangeOf(cell);
    const c = this.content[cell];
    const guess = this.po2Now[cell];
    const p = ex ? exchangePo2(ex, c, guess) : po2OnCurve(c, this.factors[k], guess);
    this.po2Now[cell] = p;
    this.satNow[cell] = Math.max(0, (c - BLOOD.solubility * p) / O2_CAPACITY);
  }

  /** A cell's plasma PO2, mmHg, from its O2 content and the blood's conditions around it. */
  po2(cell: number): number {
    return this.po2Now[cell];
  }

  /** Blood conditions (PCO2, pH, temperature) around a cell. */
  conditionsOf(cell: number): BloodConditions {
    const k = this.segment[cell];
    const ex = this.exchangeOf(cell);
    return ex ? conditionsAt(ex, this.content[cell]) : this.conditions[k];
  }

  saturation(cell: number): number {
    return this.satNow[cell];
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
    const mean = (seg.length / this.duration[cell]) * flowRate(this.alpha[seg.index], this.pulseNow[this.channel[seg.index]]);
    const t = this.progress(cell);
    if (seg.kind === 'venule') return mean * rampUpSlope(t);
    if (seg.kind === 'arteriole') return mean * rampUpSlope(1 - t);
    return mean;
  }
}
