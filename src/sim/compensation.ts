/**
 * The body's fast compensation in "what if" scenarios: local blood flow.
 *
 * Heart, brain and skeletal muscle match their blood flow to their O2 needs
 * (local metabolic control: coronary and cerebral flow rise in anaemia and
 * hypoxia). Each such bed takes the flow at which its cells keep the tissue
 * PO2 they would have, at the same activity, with normal blood at sea level,
 * up to its maximal dilation (MAX_FACTOR); beyond that its cells' PO2 falls.
 * Kidney, gut, skin and other tissues extract more instead, and dilate only
 * as a rescue (below).
 *
 * Cardiac output is the sum of all bed flows and cannot exceed its maximum
 * (22 L/min). Beyond it, working muscle gets less than it needs: that is
 * where VO2max falls. The other tissues (kidney, gut, skin, …) dilate only to keep
 * their cells' PO2 above 2 mmHg, and as they dilate they open capillaries, raising their
 * diffusing capacity as muscle does. The liver, fed mostly by portal blood, is left out.
 *
 * These beds take arterial blood directly, so each is solved on its own from
 * the arterial blood the scenario gives. That comes from a lenient steady
 * state (tissues short of O2 don't stop it), first with uncompensated flows
 * and then once more with the compensated ones.
 */
import { activityState, arterialChemistry, type ActivityState } from '../physiology/activity';
import { conditionsFromChemistry, currentHaemoglobin, NORMAL_HAEMOGLOBIN, setHaemoglobin } from '../physiology/dissociation';
import { isNormalScenario, scenarioActivity, type Scenario } from '../physiology/scenario';
import { Circulation } from './circulation';
import { addChemistry, diffusionScale, exchangeModel, expectedOutletContent, restingBeds, solveSteadyState, transitQuadrature, type SteadyState } from './oxygen';

/** Maximal cardiac output, mL/s (the maximal-exercise anchor, 22 L/min). */
const MAX_CARDIAC_OUTPUT = 22000 / 60;
/** Lowest flow factor (vasoconstriction when blood carries more O2 than normal). */
const MIN_FACTOR = 0.5;
/**
 * Highest flow factor per tissue. Coronary flow can rise ~4× (coronary flow reserve); cerebral
 * flow about doubles in severe hypoxia. Working muscle barely raises its flow for O2-poor blood
 * (leg flow during submaximal exercise at altitude is about as at sea level; extraction rises
 * instead), so 1.5×. Other tissues: 3×, an assumption.
 */
const MAX_FACTOR: Record<string, number> = { heart: 4, brain: 2, muscle: 1.5 };
const RESCUE_MAX_FACTOR = 3;
/** Tissues that do not hold their PO2 still dilate rather than let their cells' PO2 fall below this, mmHg. */
const RESCUE_PO2 = 2;

const autoregulates = (tissue: string | undefined) => tissue === 'heart' || tissue === 'brain' || tissue === 'muscle';

interface NormalState {
  /** Tissue PO2 per capillary segment index. */
  tissuePo2: Map<number, number>;
}

const normalCache = new Map<number, NormalState>();

/** Tissue PO2s and the alveolar–arterial gap with normal blood at sea level, at an activity level. */
function normalState(level: number): NormalState {
  const key = Math.round(level * 100);
  let st = normalCache.get(key);
  if (!st) {
    const blood = currentHaemoglobin();
    setHaemoglobin(NORMAL_HAEMOGLOBIN);
    try {
      const a = activityState(key / 100);
      const circ = new Circulation({ activity: a });
      const ss = solveSteadyState(circ);
      const tissuePo2 = new Map<number, number>();
      for (const [i, ex] of ss.exchange) tissuePo2.set(i, ex.targetPo2);
      st = { tissuePo2 };
    } finally {
      setHaemoglobin(blood);
    }
    normalCache.set(key, st);
  }
  return st;
}

export interface Compensation {
  activity: ActivityState;
  /** Cardiac output asked for before the maximum was applied, mL/s. */
  demandedCardiacOutput: number;
}

/**
 * The scenario's activity state with compensating bed flows, cardiac output and heart rate. The
 * current haemoglobin must already be the scenario's; `a` already carries its altitude.
 */
export function compensatedActivity(a: ActivityState, scenario: Scenario): Compensation {
  if (!scenario.compensate) return { activity: a, demandedCardiacOutput: a.cardiacOutput };
  let out = flowsFor(a, a);
  out = flowsFor(a, out.activity);
  return out;
}

/** Compensating flows for activity `a`, given the arterial blood that state `guess` produces. */
function flowsFor(a: ActivityState, guess: ActivityState): Compensation {
  const normal = normalState(a.level);
  const rest = restingBeds();
  const circ = new Circulation({ activity: a });
  const arterial = solveSteadyState(new Circulation({ activity: guess }), guess, { lenient: true }).arterial;
  const chem = arterialChemistry(a);
  const condIn = arterial.conditionsIn;
  const ca = arterial.contentIn;

  const factors: Record<string, number> = {};
  let extra = 0;
  let muscleFlow = 0;
  for (const s of circ.segments) {
    if (s.exchange?.type !== 'tissue' || s.tissue === 'liver') continue;
    const ex = s.exchange;
    const holds = autoregulates(s.tissue);
    const target = holds ? normal.tissuePo2.get(s.index)! : RESCUE_PO2;
    const vo2 = ex.vo2 / 60;
    const enough = (k: number) => {
      const flow = s.flow * k;
      const cout = ca - vo2 / flow;
      if (cout <= 0) return false;
      const dm = rest.capacity[s.index] * diffusionScale(s.tissue, flow / rest.flow[s.index], k);
      const condOut = conditionsFromChemistry(
        addChemistry(chem, { co2: a.rq * (ca - cout), acid: ex.acid ?? 0, heat: ex.heat ?? 0 }),
      );
      const model = exchangeModel(dm / 60 / s.volume, target, condIn, condOut, ca, cout);
      // Holding tissue PO2 at its normal value, does diffusion take out at least what the tissue uses?
      // Red cells cross in the bed's red-cell transit time, which scales inversely with flow.
      return expectedOutletContent(ca, transitQuadrature(s.transit / k, s.transitCv ?? 0), model) <= cout;
    };
    const minFactor = holds ? MIN_FACTOR : 1;
    const maxFactor = holds ? MAX_FACTOR[s.tissue!] : RESCUE_MAX_FACTOR;
    let k = maxFactor;
    if (enough(minFactor)) k = minFactor;
    else if (enough(maxFactor)) {
      let lo = minFactor;
      let hi = maxFactor;
      for (let i = 0; i < 25; i++) {
        const mid = (lo + hi) / 2;
        if (enough(mid)) hi = mid;
        else lo = mid;
      }
      k = hi;
    }
    if (s.tissue === 'muscle') muscleFlow += s.flow * k;
    if (k === 1) continue;
    factors[s.id] = k;
    extra += s.flow * (k - 1);
  }

  const demanded = a.cardiacOutput + extra;
  const limit = Math.max(MAX_CARDIAC_OUTPUT, a.cardiacOutput);
  if (demanded > limit && muscleFlow > 0) {
    // Heart and brain keep their flow; muscle gives way.
    const trim = Math.max(0, (muscleFlow - (demanded - limit)) / muscleFlow);
    for (const s of circ.segments) if (s.tissue === 'muscle' && s.exchange) factors[s.id] = (factors[s.id] ?? 1) * trim;
  }
  const bedFlowScale = { ...a.bedFlowScale, ...factors };
  let cardiacOutput = a.cardiacOutput;
  for (const s of circ.segments) if (factors[s.id] !== undefined) cardiacOutput += s.flow * (factors[s.id] - 1);
  return {
    activity: {
      ...a,
      bedFlowScale,
      cardiacOutput,
      heartRate: Math.min(195, a.heartRate * (cardiacOutput / a.cardiacOutput)),
    },
    demandedCardiacOutput: demanded,
  };
}

export interface ScenarioState {
  circ: Circulation;
  steady: SteadyState;
  /** Cardiac output the tissues asked for, mL/s. */
  demandedCardiacOutput: number;
}

/**
 * Solve an activity level in a scenario. Sets the scenario's haemoglobin (and leaves it set).
 * Throws O2SupplyError when some tissue cannot get the O2 it uses.
 */
export function solveScenario(level: number, scenario: Scenario): ScenarioState {
  setHaemoglobin(scenario);
  const base = activityState(level);
  if (isNormalScenario(scenario)) {
    const circ = new Circulation({ activity: base });
    return { circ, steady: solveSteadyState(circ), demandedCardiacOutput: base.cardiacOutput };
  }
  const comp = compensatedActivity(scenarioActivity(base, scenario), scenario);
  const circ = new Circulation({ activity: comp.activity });
  return { circ, steady: solveSteadyState(circ), demandedCardiacOutput: comp.demandedCardiacOutput };
}
