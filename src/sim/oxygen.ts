/**
 * O2 exchange in capillaries and the whole-body steady state.
 *
 * In an exchanging capillary a red cell's PO2 follows the Bohr integration:
 *
 *   dC/dt = a · (P_target − P)   ⇒   dP/dt = a · (P_target − P) / β(P)
 *
 * where C is O2 content (mL O2 per mL blood), β = dC/dP is the blood's O2
 * capacitance, and a is a conductance per unit blood volume:
 *
 * - Lungs: a = DLO2 / Vc (diffusing capacity over capillary blood volume),
 *   P_target = alveolar PO2. Loading is limited by diffusion through the
 *   alveolar membrane and plasma, so the ~0.25 s equilibration time emerges
 *   from DLO2, Vc and the curve's shape.
 * - Tissues: a = DmO2 / capillary blood volume, P_target = tissue PO2. Each
 *   bed's O2 diffusing capacity DmO2 is set at rest from its measured
 *   tissue PO2, and in muscle and heart it rises with blood flow (see
 *   `DIFFUSION` in params.ts). At any activity level, tissue PO2 is then
 *   the value at which diffusion delivers exactly the tissue's VO2 (the
 *   Fick principle): it falls when the tissue works harder or gets less
 *   blood. Each cell's extraction depends on its own transit time.
 *
 * The dissociation curve shifts along the way. Blood picks up CO2, and with
 * it acid (and, in working muscle, a little heat), as it unloads O2, so the curve moves right
 * and helps unloading: the Bohr effect. In the lungs CO2 leaves and the
 * curve moves back left, which helps loading. The shift is tied to the
 * exchange: conditions move from the inlet's to the outlet's as O2 content
 * moves from the bed's inlet content to its mean outlet content (in the
 * lungs, to full equilibrium with alveolar gas). Integration therefore runs
 * on O2 content, which is also what a cell carries from vessel to vessel;
 * PO2 and saturation follow from the local curve.
 */
import {
  ARTERIAL_CHEMISTRY,
  BLOOD,
  conditionsFromChemistry,
  o2Content,
  O2_CAPACITY,
  po2FromContent,
  po2Standard,
  saturationSlopeStandard,
  saturationStandard,
  virtualPo2Factor,
  type BloodConditions,
  type Chemistry,
} from '../physiology/dissociation';
import { arterialChemistry } from '../physiology/activity';
import { SEGMENT_DEFS } from '../physiology/anatomy';
import { DIFFUSION, REST } from '../physiology/params';
import { Circulation } from './circulation';

export interface ExchangeModel {
  /** Conductance, mL O2 / mL blood / s / mmHg. */
  conductance: number;
  /** PO2 the blood equilibrates towards, mmHg. */
  targetPo2: number;
  /** Blood conditions at the start and end of exchange. */
  conditionsIn: BloodConditions;
  conditionsOut: BloodConditions;
  /** O2 contents (mL/mL) over which conditions move from conditionsIn to conditionsOut. */
  contentStart: number;
  contentEnd: number;
  /** Severinghaus virtual-PO2 factors of conditionsIn and conditionsOut, and ln(factorOut / factorIn). */
  factorIn: number;
  factorOut: number;
  logFactorRatio: number;
  /** O2 content at which blood reaches the target PO2. */
  targetContent: number;
  /** The bed's O2 diffusing capacity now and at rest, mL O2/min/mmHg. */
  diffusingCapacity: number;
  restDiffusingCapacity: number;
}

export function exchangeModel(
  conductance: number,
  targetPo2: number,
  conditionsIn: BloodConditions,
  conditionsOut: BloodConditions,
  contentStart: number,
  contentEnd: number,
): ExchangeModel {
  const factorIn = virtualPo2Factor(conditionsIn);
  const factorOut = virtualPo2Factor(conditionsOut);
  const model: ExchangeModel = {
    conductance,
    targetPo2,
    conditionsIn,
    conditionsOut,
    contentStart,
    contentEnd,
    factorIn,
    factorOut,
    logFactorRatio: Math.log(factorOut / factorIn),
    targetContent: 0,
    diffusingCapacity: 0,
    restDiffusingCapacity: 0,
  };
  model.targetContent = exchangeContent(model, targetPo2);
  return model;
}

/**
 * How far exchange has progressed at an O2 content: 0 at the inlet, 1 at the
 * outlet. Tissues add CO2 in proportion to the O2 they remove, so blood
 * chemistry moves in step with O2 content.
 */
function progress(ex: ExchangeModel, content: number): number {
  const span = ex.contentEnd - ex.contentStart;
  if (Math.abs(span) < 1e-12) return 1;
  return Math.min(1, Math.max(0, (content - ex.contentStart) / span));
}

/** Blood conditions of a cell with this O2 content inside the bed. */
export function conditionsAt(ex: ExchangeModel, content: number): BloodConditions {
  const x = progress(ex, content);
  const a = ex.conditionsIn;
  const b = ex.conditionsOut;
  return {
    pH: a.pH + (b.pH - a.pH) * x,
    pco2: a.pco2 + (b.pco2 - a.pco2) * x,
    temperature: a.temperature + (b.temperature - a.temperature) * x,
  };
}

/** Virtual-PO2 factor at this content, interpolated geometrically between inlet and outlet. */
function factorAt(ex: ExchangeModel, content: number): number {
  return ex.factorIn * Math.exp(ex.logFactorRatio * progress(ex, content));
}

/**
 * Plasma PO2 of blood with O2 content c on the curve with virtual-PO2 factor f (bracketed
 * Newton). `guess` is a nearby PO2 to start from, if known.
 */
export function po2OnCurve(c: number, f: number, guess = -1): number {
  if (c <= 0) return 0;
  let lo = 0;
  let hi = c / BLOOD.solubility;
  // Otherwise start from the haemoglobin-only PO2, less a typical dissolved share.
  let p = guess > 0 && guess < hi ? guess : Math.min(hi, po2Standard(Math.min(Math.max(c - BLOOD.solubility * 40, 0) / O2_CAPACITY, 0.999)) / f);
  for (let i = 0; i < 30; i++) {
    const err = O2_CAPACITY * saturationStandard(p * f) + BLOOD.solubility * p - c;
    if (Math.abs(err) < 1e-12) break;
    if (err > 0) hi = p;
    else lo = p;
    const next = p - err / (O2_CAPACITY * saturationSlopeStandard(p * f) * f + BLOOD.solubility);
    p = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return p;
}

/** Plasma PO2 of a cell with this O2 content inside the bed, mmHg (`guess`: a nearby PO2, if known). */
export function exchangePo2(ex: ExchangeModel, content: number, guess = -1): number {
  return po2OnCurve(content, factorAt(ex, content), guess);
}

/** O2 saturation of a cell with this O2 content inside the bed. */
export function exchangeSaturation(ex: ExchangeModel, content: number): number {
  return Math.max(0, (content - BLOOD.solubility * exchangePo2(ex, content)) / O2_CAPACITY);
}

/** O2 content of a cell at this plasma PO2 inside the bed (content rises with PO2). */
export function exchangeContent(ex: ExchangeModel, po2: number): number {
  let lo = 0;
  let hi = O2_CAPACITY + BLOOD.solubility * po2 + 1e-6;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (exchangePo2(ex, mid) < po2) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** RK4 step limits: at most 50 ms, and a tenth of the local time constant. Smaller steps change no result in the 6th digit. */
const MAX_STEP = 0.05;
const TAU_FRACTION = 0.1;

/** Advance a cell's O2 content by `duration` seconds inside an exchanging capillary (RK4). `po2Guess`: its PO2 now, if known. */
export function integrateContent(content: number, duration: number, ex: ExchangeModel, po2Guess = -1): number {
  let p = po2Guess;
  const f = (c: number) => ex.conductance * (ex.targetPo2 - exchangePo2(ex, c, p));
  // Content moves monotonically towards the target content; it can never pass it.
  const sign = Math.sign(ex.targetContent - content);
  let t = 0;
  let c = content;
  while (t < duration && (ex.targetContent - c) * sign > 0) {
    // Step limited by the local time constant β/a (β = dC/dPO2) for stability near the flat top of the curve.
    const fac = factorAt(ex, c);
    p = po2OnCurve(c, fac, p);
    const beta = O2_CAPACITY * saturationSlopeStandard(p * fac) * fac + BLOOD.solubility;
    const h = Math.min(duration - t, MAX_STEP, (TAU_FRACTION * beta) / ex.conductance);
    const k1 = ex.conductance * (ex.targetPo2 - p);
    const k2 = f(c + (h / 2) * k1);
    const k3 = f(c + (h / 2) * k2);
    const k4 = f(c + h * k3);
    const next = c + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    c = (ex.targetContent - next) * sign < 0 ? ex.targetContent : next;
    t += h;
  }
  return c;
}

/** Advance a cell's plasma PO2 by `duration` seconds inside an exchanging capillary. */
export function integratePo2(po2: number, duration: number, ex: ExchangeModel): number {
  const c = integrateContent(exchangeContent(ex, po2), duration, ex);
  return c === ex.targetContent ? ex.targetPo2 : exchangePo2(ex, c);
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

/**
 * Mean capillary PO2 (mmHg): PO2 averaged over the time cells spend in the bed, over its
 * transit-time distribution. This is what Bohr-integration studies of muscle report.
 */
export function meanCapillaryPo2(ex: ExchangeModel, contentIn: number, nodes: number[], steps = 20): number {
  let sum = 0;
  let time = 0;
  for (const T of nodes) {
    let c = contentIn;
    const h = T / steps;
    for (let k = 0; k < steps; k++) {
      const mid = integrateContent(c, h / 2, ex);
      sum += exchangePo2(ex, mid) * h;
      c = integrateContent(c, h, ex);
    }
    time += T;
  }
  return sum / time;
}

/** Expected outlet content over a transit-time distribution. */
function expectedOutletContent(contentIn: number, nodes: number[], ex: ExchangeModel): number {
  let c = 0;
  for (const t of nodes) c += integrateContent(contentIn, t, ex);
  return c / nodes.length;
}

export interface SegmentO2 {
  /** Flow-weighted mean O2 content entering / leaving, mL/mL. */
  contentIn: number;
  contentOut: number;
  /** Plasma PO2 entering / leaving, mmHg, under the blood's conditions there. */
  po2In: number;
  po2Out: number;
  saturationIn: number;
  saturationOut: number;
  /** Blood conditions (PCO2, pH, temperature) entering / leaving. */
  conditionsIn: BloodConditions;
  conditionsOut: BloodConditions;
}

export interface OxygenParams {
  alveolarPo2: number;
  /** Pulmonary diffusing capacity, mL O2/min/mmHg. */
  dlo2: number;
  /** Respiratory quotient: CO2 produced per O2 consumed. */
  rq: number;
  /** Arterial PCO2 (mmHg), lactic fall in pH and temperature above 37 °C. */
  arterialPco2: number;
  arterialAcid: number;
  bodyHeat: number;
}

export interface SteadyState {
  segments: SegmentO2[];
  exchange: Map<number, ExchangeModel>;
  arterial: SegmentO2;
  mixedVenous: SegmentO2;
}

const addChemistry = (a: Chemistry, b: Chemistry, w = 1): Chemistry => ({
  co2: a.co2 + w * b.co2,
  acid: a.acid + w * b.acid,
  heat: a.heat + w * b.heat,
});

/**
 * Solve the deterministic steady state: flow-weighted mean O2 content and
 * blood chemistry at every segment, plus the exchange model for every
 * capillary bed.
 *
 * Tissues add CO2 in proportion to the O2 they use (the respiratory
 * quotient); working muscle also adds a little heat. Everything mixes by
 * flow in the veins. The lungs return blood to arterial chemistry: they
 * unload the CO2, and stand in for the skin in shedding the heat, so
 * arterial blood keeps the activity level's chemistry.
 */
export function solveSteadyState(circ: Circulation, params: OxygenParams = circ.activity): SteadyState {
  const n = circ.segments.length;
  const lungCaps = circ.segments.filter((s) => s.exchange?.type === 'lung');
  const vc = lungCaps.reduce((a, s) => a + s.volume, 0);
  const lungConductance = params.dlo2 / 60 / vc;
  const arterialChem0 = arterialChemistry(params);
  const arterialConditions = conditionsFromChemistry(arterialChem0);

  const contentIn = new Float64Array(n);
  const contentOut = new Float64Array(n);
  const chemIn: Chemistry[] = new Array(n);
  const chemOut: Chemistry[] = new Array(n);
  const lungModels = new Map<number, ExchangeModel>();
  let arterialContent = O2_CAPACITY * 0.97;
  let arterialChem = arterialChem0;

  const equilibrated = o2Content(params.alveolarPo2, arterialConditions);
  const lungModel = (cin: number, chem: Chemistry): ExchangeModel =>
    exchangeModel(lungConductance, params.alveolarPo2, conditionsFromChemistry(chem), arterialConditions, cin, equilibrated);

  const sweep = () => {
    const sumContent = new Float64Array(n);
    const inflow = new Float64Array(n);
    const sumChem: Chemistry[] = Array.from({ length: n }, () => ({ co2: 0, acid: 0, heat: 0 }));
    const root = circ.root.index;
    for (const i of circ.order) {
      const s = circ.segments[i];
      const cin = i === root ? arterialContent : sumContent[i] / inflow[i];
      const chem = i === root ? arterialChem : addChemistry(ARTERIAL_CHEMISTRY, sumChem[i], 1 / inflow[i]);
      contentIn[i] = cin;
      chemIn[i] = chem;
      let cout = cin;
      let chemExit = chem;
      if (s.exchange?.type === 'lung') {
        const model = lungModel(cin, chem);
        lungModels.set(i, model);
        cout = expectedOutletContent(cin, transitQuadrature(s.transit, s.transitCv ?? 0), model);
        chemExit = arterialChem0;
      } else if (s.exchange?.type === 'tissue') {
        cout = cin - s.exchange.vo2 / 60 / s.flow;
        chemExit = addChemistry(chem, { co2: params.rq * (cin - cout), acid: s.exchange.acid ?? 0, heat: s.exchange.heat ?? 0 });
      }
      contentOut[i] = cout;
      chemOut[i] = chemExit;
      let prev = 0;
      s.nextIndex.forEach((j, k) => {
        const q = s.flow * (s.nextCumulative[k] - prev);
        prev = s.nextCumulative[k];
        if (j === root) return;
        sumContent[j] += cout * q;
        inflow[j] += q;
        sumChem[j] = addChemistry(sumChem[j], chemExit, q);
      });
    }
    // Arterial blood = what the left atrium hands to the left ventricle.
    const la = circ.get('la').index;
    return { content: contentOut[la], chem: chemOut[la] };
  };

  for (let iter = 0; iter < 50; iter++) {
    const next = sweep();
    const done = Math.abs(next.content - arterialContent) < 1e-9 && Math.abs(next.chem.co2 - arterialChem.co2) < 1e-9;
    arterialContent = next.content;
    arterialChem = next.chem;
    if (done) break;
  }
  sweep();

  // Diffusing capacities: calibrated from tissue PO2 at rest, scaled from the resting values otherwise.
  const resting = circ.activity.level === 0;
  const rest = resting ? null : restingBeds();
  const exchange = new Map<number, ExchangeModel>();
  for (const s of circ.segments) {
    const i = s.index;
    let model: ExchangeModel;
    if (s.exchange?.type === 'lung') model = lungModels.get(i)!;
    else if (s.exchange?.type === 'tissue') {
      const nodes = transitQuadrature(s.transit, s.transitCv ?? 0);
      const condIn = conditionsFromChemistry(chemIn[i]);
      const condOut = conditionsFromChemistry(chemOut[i]);
      if (!rest) {
        model = calibrateTissue(contentIn[i], contentOut[i], condIn, condOut, s.exchange.tissuePo2, nodes, s.id);
      } else {
        const recruits = s.tissue === 'muscle' || s.tissue === 'heart';
        const dm = rest.capacity[i] * (recruits ? Math.pow(s.flow / rest.flow[i], DIFFUSION.recruitmentExponent) : 1);
        model = tissueAtCapacity(contentIn[i], contentOut[i], condIn, condOut, dm / 60 / s.volume, nodes, s.id);
      }
    } else continue;
    model.diffusingCapacity = model.conductance * s.volume * 60;
    model.restDiffusingCapacity = rest ? rest.capacity[i] : model.diffusingCapacity;
    exchange.set(i, model);
  }

  const segments = circ.segments.map((s): SegmentO2 => {
    const i = s.index;
    const ex = exchange.get(i);
    const condIn = conditionsFromChemistry(chemIn[i]);
    const condOut = conditionsFromChemistry(chemOut[i]);
    const po2In = ex ? exchangePo2(ex, contentIn[i]) : po2FromContent(contentIn[i], condIn);
    const po2Out = ex ? exchangePo2(ex, contentOut[i]) : po2FromContent(contentOut[i], condOut);
    const sat = (c: number, p: number) => (c - BLOOD.solubility * p) / O2_CAPACITY;
    return {
      contentIn: contentIn[i],
      contentOut: contentOut[i],
      po2In,
      po2Out,
      saturationIn: sat(contentIn[i], po2In),
      saturationOut: sat(contentOut[i], po2Out),
      conditionsIn: condIn,
      conditionsOut: ex ? conditionsAt(ex, contentOut[i]) : condOut,
    };
  });
  // The standard resting solve also gives every other level its resting diffusing capacities.
  if (resting && !restCache && circ.cardiacOutput === REST.cardiacOutput && circ.segments.length === SEGMENT_DEFS.length) {
    restCache = {
      capacity: Float64Array.from(circ.segments, (s) => exchange.get(s.index)?.diffusingCapacity ?? 0),
      flow: Float64Array.from(circ.segments, (s) => s.flow),
    };
  }
  return {
    segments,
    exchange,
    arterial: segments[circ.root.index],
    mixedVenous: segments[circ.get('pulm_trunk').index],
  };
}

/** Resting O2 diffusing capacity (mL/min/mmHg) and flow (mL/s) of every bed, solved once. */
let restCache: { capacity: Float64Array; flow: Float64Array } | null = null;
function restingBeds(): { capacity: Float64Array; flow: Float64Array } {
  if (!restCache) {
    const circ = new Circulation();
    const ss = solveSteadyState(circ);
    restCache = {
      capacity: Float64Array.from(circ.segments, (s) => ss.exchange.get(s.index)?.diffusingCapacity ?? 0),
      flow: Float64Array.from(circ.segments, (s) => s.flow),
    };
  }
  return restCache;
}

/** At rest: the conductance at which a bed with this tissue PO2 extracts exactly its VO2. */
function calibrateTissue(
  cin: number,
  ctarget: number,
  conditionsIn: BloodConditions,
  conditionsOut: BloodConditions,
  tissuePo2: number,
  nodes: number[],
  id: string,
): ExchangeModel {
  const venousPo2 = po2FromContent(ctarget, conditionsOut);
  if (!(tissuePo2 < venousPo2)) throw new Error(`${id}: resting tissue PO2 must lie below venous PO2 (${venousPo2.toFixed(1)} mmHg)`);
  const model = exchangeModel(0, tissuePo2, conditionsIn, conditionsOut, cin, ctarget);
  let lo = Math.log(1e-8);
  let hi = Math.log(10);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    model.conductance = Math.exp(mid);
    if (expectedOutletContent(cin, nodes, model) > ctarget) lo = mid;
    else hi = mid;
  }
  model.conductance = Math.exp((lo + hi) / 2);
  return model;
}

/**
 * With a given conductance: the tissue PO2 at which the bed extracts exactly its VO2. A tissue
 * that works harder, or gets less blood, draws its PO2 down until diffusion keeps up.
 */
function tissueAtCapacity(
  cin: number,
  ctarget: number,
  conditionsIn: BloodConditions,
  conditionsOut: BloodConditions,
  conductance: number,
  nodes: number[],
  id: string,
): ExchangeModel {
  const at = (tissuePo2: number) => exchangeModel(conductance, tissuePo2, conditionsIn, conditionsOut, cin, ctarget);
  if (expectedOutletContent(cin, nodes, at(0)) > ctarget) throw new Error(`${id}: O2 diffusion cannot meet the tissue's VO2`);
  let lo = 0;
  let hi = po2FromContent(ctarget, conditionsOut);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (expectedOutletContent(cin, nodes, at(mid)) > ctarget) hi = mid;
    else lo = mid;
  }
  return at((lo + hi) / 2);
}
