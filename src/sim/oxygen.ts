/**
 * O2 exchange in capillaries and the whole-body steady state.
 *
 * In an exchanging capillary a red cell's PO2 follows the Bohr integration:
 *
 *   dC/dt = a · (P_target − P)   ⇒   dP/dt = a · (P_target − P) / β(P)
 *
 * where C is O2 content (mL O2 per mL blood), β = dC/dP is the blood's O2
 * capacitance from the dissociation curve, and a is a conductance per unit
 * blood volume:
 *
 * - Lungs: a = DLO2 / Vc (diffusing capacity over capillary blood volume),
 *   P_target = alveolar PO2. Loading is limited by diffusion through the
 *   alveolar membrane and plasma, so the ~0.25 s equilibration time emerges
 *   from DLO2, Vc and the curve's shape.
 * - Tissues: P_target = mean tissue PO2. `a` is calibrated per bed so the
 *   average cell gives up exactly VO2 / flow (the Fick principle). Each
 *   cell's extraction then depends on its own transit time.
 */
import { o2Content, o2ContentSlope, po2FromContent, saturation, STANDARD_CONDITIONS, type BloodConditions } from '../physiology/dissociation';
import { REST } from '../physiology/params';
import type { Circulation, Segment } from './circulation';

export interface ExchangeModel {
  /** Conductance, mL O2 / mL blood / s / mmHg. */
  conductance: number;
  /** PO2 the blood equilibrates towards, mmHg. */
  targetPo2: number;
  conditions: BloodConditions;
}

const MAX_STEP = 0.005;

/** Advance a cell's PO2 by `duration` seconds inside an exchanging capillary (RK4). */
export function integratePo2(po2: number, duration: number, ex: ExchangeModel): number {
  const f = (p: number) => (ex.conductance * (ex.targetPo2 - p)) / o2ContentSlope(Math.max(p, 0), ex.conditions);
  let t = 0;
  let p = po2;
  while (t < duration) {
    // Step limited by the local time constant β/a for stability near the flat top of the curve.
    const tau = o2ContentSlope(Math.max(p, 0), ex.conditions) / ex.conductance;
    const h = Math.min(duration - t, MAX_STEP, 0.25 * tau);
    const k1 = f(p);
    const k2 = f(p + (h / 2) * k1);
    const k3 = f(p + (h / 2) * k2);
    const k4 = f(p + h * k3);
    const next = p + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    // Exchange can never overshoot the target pressure.
    p = (ex.targetPo2 - next) * (ex.targetPo2 - p) < 0 ? ex.targetPo2 : next;
    t += h;
  }
  return p;
}

/** Inverse standard normal CDF (Acklam's rational approximation, |ε| < 1.2e-9). */
function probit(q: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (q < lo) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - lo) return -probit(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Equal-probability quadrature nodes for a log-normal transit time distribution. */
export function transitQuadrature(mean: number, cv: number, n = 12): number[] {
  if (cv <= 0) return [mean];
  const s2 = Math.log(1 + cv * cv);
  const nodes = Array.from({ length: n }, (_, i) => mean * Math.exp(Math.sqrt(s2) * probit((i + 0.5) / n) - s2 / 2));
  // Rescale so the discrete mean matches exactly.
  const m = nodes.reduce((a, b) => a + b, 0) / n;
  return nodes.map((t) => (t * mean) / m);
}

/** Expected outlet content over a transit-time distribution. */
function expectedOutletContent(po2In: number, nodes: number[], ex: ExchangeModel): number {
  let c = 0;
  for (const t of nodes) c += o2Content(integratePo2(po2In, t, ex), ex.conditions);
  return c / nodes.length;
}

export interface SegmentO2 {
  /** Flow-weighted mean O2 content entering / leaving, mL/mL. */
  contentIn: number;
  contentOut: number;
  po2In: number;
  po2Out: number;
  saturationIn: number;
  saturationOut: number;
}

export interface OxygenParams {
  alveolarPo2: number;
  /** Pulmonary diffusing capacity, mL O2/min/mmHg. */
  dlo2: number;
}

export interface SteadyState {
  segments: SegmentO2[];
  exchange: Map<number, ExchangeModel>;
  arterial: SegmentO2;
  mixedVenous: SegmentO2;
}

/**
 * Solve the deterministic steady state: flow-weighted mean O2 content at
 * every segment, plus the exchange model for every capillary bed.
 */
export function solveSteadyState(circ: Circulation, params: OxygenParams = REST): SteadyState {
  const n = circ.segments.length;
  const lungCaps = circ.segments.filter((s) => s.exchange?.type === 'lung');
  const vc = lungCaps.reduce((a, s) => a + s.volume, 0);
  const lungModel: ExchangeModel = {
    conductance: params.dlo2 / 60 / vc,
    targetPo2: params.alveolarPo2,
    conditions: STANDARD_CONDITIONS,
  };

  const contentIn = new Float64Array(n);
  const contentOut = new Float64Array(n);
  let arterialContent = o2Content(95);

  const tissueOutlet = (s: Segment, cin: number) => {
    if (s.exchange?.type !== 'tissue') return cin;
    return cin - s.exchange.vo2 / 60 / s.flow;
  };

  const lungOutlet = (s: Segment, cin: number) =>
    expectedOutletContent(po2FromContent(cin), transitQuadrature(s.transit, s.transitCv ?? 0), lungModel);

  const sweep = () => {
    contentIn.fill(0);
    const inflow = new Float64Array(n);
    const root = circ.root.index;
    for (const i of circ.order) {
      const s = circ.segments[i];
      const cin = i === root ? arterialContent : contentIn[i] / inflow[i];
      contentIn[i] = cin;
      inflow[i] = 1;
      const cout = s.exchange?.type === 'lung' ? lungOutlet(s, cin) : tissueOutlet(s, cin);
      contentOut[i] = cout;
      let prev = 0;
      s.nextIndex.forEach((j, k) => {
        const q = s.flow * (s.nextCumulative[k] - prev);
        prev = s.nextCumulative[k];
        if (j === root) return;
        contentIn[j] += cout * q;
        inflow[j] += q;
      });
    }
    // Arterial content = what the left atrium hands to the left ventricle.
    return contentOut[circ.get('la').index];
  };

  for (let iter = 0; iter < 50; iter++) {
    const next = sweep();
    if (Math.abs(next - arterialContent) < 1e-9) break;
    arterialContent = next;
  }
  sweep();

  const exchange = new Map<number, ExchangeModel>();
  for (const s of circ.segments) {
    if (s.exchange?.type === 'lung') exchange.set(s.index, lungModel);
    if (s.exchange?.type === 'tissue') {
      exchange.set(
        s.index,
        calibrateTissue(contentIn[s.index], contentOut[s.index], s.exchange.tissuePo2, transitQuadrature(s.transit, s.transitCv ?? 0), s.id),
      );
    }
  }

  const describe = (cin: number, cout: number): SegmentO2 => {
    const po2In = po2FromContent(cin);
    const po2Out = po2FromContent(cout);
    return { contentIn: cin, contentOut: cout, po2In, po2Out, saturationIn: saturation(po2In), saturationOut: saturation(po2Out) };
  };
  const segments = circ.segments.map((s) => describe(contentIn[s.index], contentOut[s.index]));
  const ptrunk = segments[circ.get('pulm_trunk').index];
  return {
    segments,
    exchange,
    arterial: segments[circ.root.index],
    mixedVenous: ptrunk,
  };
}

function calibrateTissue(cin: number, ctarget: number, tissuePo2: number, nodes: number[], id: string): ExchangeModel {
  const model: ExchangeModel = { conductance: 0, targetPo2: tissuePo2, conditions: STANDARD_CONDITIONS };
  const po2In = po2FromContent(cin);
  if (o2Content(tissuePo2) >= ctarget) {
    throw new Error(`${id}: tissue PO2 ${tissuePo2} mmHg is too high to deliver the required VO2`);
  }
  let lo = Math.log(1e-8);
  let hi = Math.log(1);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    model.conductance = Math.exp(mid);
    if (expectedOutletContent(po2In, nodes, model) > ctarget) lo = mid;
    else hi = mid;
  }
  model.conductance = Math.exp((lo + hi) / 2);
  return model;
}
