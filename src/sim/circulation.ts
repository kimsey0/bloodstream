/**
 * The circulation graph: segments with computed flows, volumes, transit
 * times and velocities. Velocity and transit time are derived from flow and
 * geometry, never set by hand.
 */
import { SEGMENT_DEFS, type SegmentDef } from '../physiology/anatomy';
import { REST_STATE, type ActivityState } from '../physiology/activity';
import { REST } from '../physiology/params';

export interface Segment extends SegmentDef {
  index: number;
  nextIndex: number[];
  /** Cumulative branch probabilities aligned with nextIndex (last = 1). */
  nextCumulative: number[];
  prevIndex: number[];
  /** Blood flow through the segment, mL/s. */
  flow: number;
  /** Blood volume, mL. */
  volume: number;
  /** Tube/discharge haematocrit ratio. */
  hct: number;
  /** Mean RBC transit time, s. */
  transit: number;
  /** Mean RBC velocity, mm/s. */
  velocity: number;
}

export interface CirculationState {
  /** Cardiac output, mL/s (ignored when `activity` is given). */
  cardiacOutput?: number;
  /** Activity level: sets cardiac output, flow distribution, VO2, recruitment and working-muscle acid and heat. */
  activity?: ActivityState;
}

/** How much a muscle bed takes part in running exercise (0 = not at all, 1 = fully working). */
export function workingFraction(d: SegmentDef): number {
  return d.tissue === 'muscle' ? Math.min(1, (d.exerciseShare ?? 0) / 0.15) : 0;
}

/** A bed's blood flow (mL/min) and VO2 (mL/min) at an activity level. */
export function bedFlowAndVo2(d: SegmentDef, a: ActivityState): { flow: number; vo2: number } {
  const t = d.tissue!;
  const share = d.share ?? 1;
  if (t !== 'muscle') return { flow: a.tissueFlow[t] * share, vo2: a.tissueVo2[t] * share };
  const ex = d.exerciseShare ?? 0;
  return {
    flow: REST_STATE.tissueFlow.muscle * share + (a.tissueFlow.muscle - REST_STATE.tissueFlow.muscle) * ex,
    vo2: REST_STATE.tissueVo2.muscle * share + (a.tissueVo2.muscle - REST_STATE.tissueVo2.muscle) * ex,
  };
}

export class Circulation {
  readonly segments: Segment[];
  readonly byId: Map<string, Segment>;
  /** Left ventricle: the reference point where each circuit starts. */
  readonly root: Segment;
  readonly cardiacOutput: number;
  readonly activity: ActivityState;
  /** Segment indices in flow order starting at the left ventricle (edges into it cut). */
  readonly order: number[] = [];

  constructor(state: CirculationState = {}, defs: readonly SegmentDef[] = SEGMENT_DEFS) {
    this.activity = state.activity ?? REST_STATE;
    this.cardiacOutput = state.activity?.cardiacOutput ?? state.cardiacOutput ?? REST.cardiacOutput;
    this.segments = defs.map((d, index) => ({
      ...d,
      index,
      nextIndex: [],
      nextCumulative: [],
      prevIndex: [],
      flow: 0,
      volume: 0,
      hct: d.hctRatio ?? 1,
      transit: 0,
      velocity: 0,
    }));
    this.byId = new Map(this.segments.map((s) => [s.id, s]));
    if (this.byId.size !== this.segments.length) throw new Error('Duplicate segment id');
    for (const s of this.segments) {
      for (const n of s.next) {
        const t = this.byId.get(n);
        if (!t) throw new Error(`${s.id} → unknown segment ${n}`);
        s.nextIndex.push(t.index);
        t.prevIndex.push(s.index);
      }
    }
    const lv = this.byId.get('lv');
    if (!lv) throw new Error('Missing left ventricle');
    this.root = lv;

    this.computeBranchProbabilities();
    // Volumes of lumped segments are fixed by resting flows, then scaled by recruitment/dilation.
    const restFlows = this.propagateFlows(REST.cardiacOutput);
    defs.forEach((d, i) => {
      this.segments[i].volume = segmentVolume(d, restFlows[i], this.segments[i].hct) * this.volumeScale(d);
    });
    if (state.activity) this.applyActivity(state.activity);
    const flows = this.propagateFlows(this.cardiacOutput, this.order);
    for (const s of this.segments) {
      s.flow = flows[s.index];
      s.transit = (s.volume * s.hct) / s.flow;
      s.velocity = s.length / s.transit;
    }
  }

  get(id: string): Segment {
    const s = this.byId.get(id);
    if (!s) throw new Error(`Unknown segment ${id}`);
    return s;
  }

  /** Total blood volume, mL. */
  get totalVolume(): number {
    return this.segments.reduce((a, s) => a + s.volume, 0);
  }

  /** Total red-cell-weighted volume (Σ V·Hct ratio), mL of blood-equivalent. */
  get totalRbcVolume(): number {
    return this.segments.reduce((a, s) => a + s.volume * s.hct, 0);
  }

  /** Mean time for a red cell to return to the left ventricle, s. */
  get meanRbcCirculationTime(): number {
    return this.totalRbcVolume / this.cardiacOutput;
  }

  /** Capillary recruitment and arteriolar dilation at the current activity level. */
  private volumeScale(d: SegmentDef): number {
    const a = this.activity;
    if (d.exchange?.type === 'lung') return a.lungCapillaryRecruitment;
    const w = workingFraction(d);
    if (w === 0) return 1;
    if (d.kind === 'capillary') return 1 + (a.muscleCapillaryRecruitment - 1) * w;
    if (d.kind === 'arteriole') return 1 + (a.muscleArterioleDilation - 1) * w;
    return 1;
  }

  /** Redistribute flow, set tissue VO2 and working-muscle acid and heat for an activity level. */
  private applyActivity(a: ActivityState): void {
    for (const s of this.segments) {
      if (!s.tissue) continue;
      const { flow, vo2 } = bedFlowAndVo2(s, a);
      if (s.supply !== undefined) s.supply = flow;
      if (s.exchange?.type === 'tissue') {
        const w = workingFraction(s);
        s.exchange = {
          ...s.exchange,
          vo2,
          acid: a.muscleAcid * w,
          heat: a.muscleHeat * w,
        };
      }
    }
    this.computeBranchProbabilities();
  }

  private computeBranchProbabilities(): void {
    const memo = new Map<number, number>();
    const supply = (s: Segment, depth = 0): number => {
      if (s.supply !== undefined) return s.supply;
      if (depth > 100) throw new Error(`Cycle without supply at ${s.id}`);
      const cached = memo.get(s.index);
      if (cached !== undefined) return cached;
      const v = s.nextIndex.reduce((a, i) => a + supply(this.segments[i], depth + 1), 0);
      memo.set(s.index, v);
      return v;
    };
    for (const s of this.segments) {
      if (s.nextIndex.length === 0) throw new Error(`Dead end at ${s.id}`);
      if (s.nextIndex.length === 1) {
        s.nextCumulative = [1];
        continue;
      }
      const w = s.nextIndex.map((i) => supply(this.segments[i]));
      const total = w.reduce((a, b) => a + b, 0);
      if (!(total > 0)) throw new Error(`No supply below branch ${s.id}`);
      let acc = 0;
      s.nextCumulative = w.map((x) => (acc += x / total));
      s.nextCumulative[s.nextCumulative.length - 1] = 1;
    }
  }

  /**
   * Steady flows: inject cardiac output at the left ventricle and push it
   * through the graph in topological order (the edges back into the left
   * ventricle are cut to break the cycle).
   */
  private propagateFlows(cardiacOutput: number, order: number[] = []): Float64Array {
    const n = this.segments.length;
    const flow = new Float64Array(n);
    const pending = new Int32Array(n);
    for (const s of this.segments) {
      pending[s.index] = s.index === this.root.index ? 0 : s.prevIndex.length;
    }
    flow[this.root.index] = cardiacOutput;
    const queue = [this.root.index];
    let processed = 0;
    while (queue.length) {
      const i = queue.shift()!;
      order.push(i);
      processed++;
      const s = this.segments[i];
      let prev = 0;
      s.nextIndex.forEach((j, k) => {
        const p = s.nextCumulative[k] - prev;
        prev = s.nextCumulative[k];
        if (j === this.root.index) return;
        flow[j] += flow[i] * p;
        if (--pending[j] === 0) queue.push(j);
      });
    }
    if (processed !== n) throw new Error('Circulation graph has an unreachable segment or an inner cycle');
    return flow;
  }

  /** Inflow into the left ventricle from the left atrium (should equal cardiac output). */
  returnFlow(): number {
    return this.root.prevIndex.reduce((a, i) => {
      const s = this.segments[i];
      const k = s.nextIndex.indexOf(this.root.index);
      const p = s.nextCumulative[k] - (k > 0 ? s.nextCumulative[k - 1] : 0);
      return a + s.flow * p;
    }, 0);
  }
}

function segmentVolume(d: SegmentDef, restFlow: number, hct: number): number {
  if (d.volume !== undefined) return d.volume;
  if (d.restTransit !== undefined) return (d.restTransit * restFlow) / hct;
  return (Math.PI * d.diameter * d.diameter * d.length) / 4 / 1000;
}
