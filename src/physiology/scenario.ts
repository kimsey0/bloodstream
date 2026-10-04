/**
 * "What if" scenarios: blood and air that differ from a healthy adult at sea
 * level. A scenario changes the haemoglobin (amount, CO, standard P50) and
 * the altitude. O2 use stays that of the activity level.
 *
 * With `compensate` on, heart, brain and muscle raise their blood flow to
 * keep their cells supplied (see sim/compensation.ts). With it off, flows stay those of the
 * activity level, so the scenario shows what the change itself does.
 * Raising Hb at altitude is the slower compensation, set by hand.
 */
import type { ActivityState } from './activity';
import { NORMAL_HAEMOGLOBIN, STANDARD_P50, type Haemoglobin } from './dissociation';

export interface Scenario extends Haemoglobin {
  /** Altitude, m. */
  altitude: number;
  /** Let blood flow rise to keep up O2 delivery. */
  compensate: boolean;
}

export const NORMAL_SCENARIO: Scenario = { ...NORMAL_HAEMOGLOBIN, altitude: 0, compensate: true };

export function isNormalScenario(s: Scenario): boolean {
  return (
    s.altitude === 0 &&
    s.coFraction === 0 &&
    Math.abs(s.hb - NORMAL_SCENARIO.hb) < 1e-9 &&
    Math.abs(s.p50 - STANDARD_P50) < 1e-9
  );
}

export interface ScenarioPreset {
  id: string;
  label: string;
  scenario: Scenario;
  /** What to look for. */
  note: string;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'normal',
    label: 'Normal',
    scenario: NORMAL_SCENARIO,
    note: 'A healthy adult at sea level.',
  },
  {
    id: 'anaemia',
    label: 'Anaemia',
    scenario: { ...NORMAL_SCENARIO, hb: 8 },
    note: 'Hb 8 g/dL. Arterial blood is still ~97 % saturated, but carries little more than half the O₂. Tissues must take a larger share, so venous blood comes back darker.',
  },
  {
    id: 'polycythaemia',
    label: 'Polycythaemia',
    scenario: { ...NORMAL_SCENARIO, hb: 19 },
    note: 'Hb 19 g/dL, as after weeks at altitude. Each litre of blood carries more O₂.',
  },
  {
    id: 'altitude',
    label: '4,500 m',
    scenario: { ...NORMAL_SCENARIO, altitude: 4500 },
    note: 'Thin air: alveolar PO₂ falls towards the steep part of the curve, so arterial saturation drops. Try exercising: the lungs no longer load cells fully.',
  },
  {
    id: 'everest',
    label: 'Everest summit',
    scenario: { ...NORMAL_SCENARIO, altitude: 8848, hb: 18.5 },
    note: 'Barometric pressure 253 mmHg and alveolar PO₂ ~35 mmHg, with the extra haemoglobin of acclimatization (Hb 18.5). Only rest is possible.',
  },
  {
    id: 'co',
    label: 'CO poisoning',
    scenario: { ...NORMAL_SCENARIO, coFraction: 0.3 },
    note: '30 % of haemoglobin bound to carbon monoxide. PO₂ is normal, but less haemoglobin carries O₂ and the rest holds on to it more tightly (the curve shifts left), so tissues struggle to unload. A pulse oximeter would still read ~97 %.',
  },
  {
    id: 'fetal',
    label: 'High affinity',
    scenario: { ...NORMAL_SCENARIO, p50: 19 },
    note: 'Standard P50 19 mmHg, like fetal haemoglobin or blood stored without 2,3-DPG. Loading is easy, unloading needs lower tissue PO₂.',
  },
  {
    id: 'low-affinity',
    label: 'Low affinity',
    scenario: { ...NORMAL_SCENARIO, p50: 34 },
    note: 'Standard P50 34 mmHg, as with high 2,3-DPG. Unloading is easier; at altitude, loading suffers.',
  },
];

/**
 * Barometric pressure at altitude, mmHg: West's model atmosphere (J Appl
 * Physiol 1996), 760 at sea level and 253 on the Everest summit.
 */
export function barometricPressure(altitude: number): number {
  const h = altitude / 1000;
  return Math.exp(6.63268 - 0.1112 * h - 0.00149 * h * h);
}

/** Water vapour pressure at 37 °C, mmHg, and the O2 fraction of dry air. */
const PH2O = 47;
const FIO2 = 0.2093;

export function inspiredPo2(altitude: number): number {
  return FIO2 * (barometricPressure(altitude) - PH2O);
}

/**
 * Resting arterial PCO2 of an acclimatized lowlander, mmHg. Breathing rises at altitude, so
 * PCO2 falls with barometric pressure, roughly linearly (West et al., J Appl Physiol 1983):
 * 40 at sea level, 14.3 at 7,830 m (PB 288) and 7.5 on the summit (PB 253). Between these
 * points the values are interpolated.
 */
export function restingArterialPco2(altitude: number): number {
  const pb = barometricPressure(altitude);
  const pts: [number, number][] = [
    [253, 7.5],
    [288, 14.3],
    [760, 40],
  ];
  if (pb <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (pb <= pts[i][0]) {
      const [p0, c0] = pts[i - 1];
      const [p1, c1] = pts[i];
      return c0 + ((c1 - c0) * (pb - p0)) / (p1 - p0);
    }
  }
  return 40;
}

/**
 * The activity state as it plays out in a scenario:
 * - At altitude, arterial PCO2 scales down by the resting altitude ratio, and alveolar PO2
 *   shifts by the change the alveolar gas equation (PAO2 = PIO2 − PACO2 / R) predicts.
 * - The lungs' diffusing capacity scales with Hb as for DLCO (Cotes: DL ∝ 1.7 Hb / (10.22 + Hb);
 *   ATS/ERS 2017), because blood in the capillaries takes up O2 at a rate set by its Hb.
 *
 * Compensation by blood flow is added separately (`compensatedActivity` in sim/compensation.ts).
 */
export function scenarioActivity(a: ActivityState, s: Scenario): ActivityState {
  const pco2Ratio = restingArterialPco2(s.altitude) / 40;
  const arterialPco2 = a.arterialPco2 * pco2Ratio;
  const alveolar = (alt: number, pco2: number) => inspiredPo2(alt) - pco2 / a.rq;
  const alveolarPo2 = a.alveolarPo2 + alveolar(s.altitude, arterialPco2) - alveolar(0, a.arterialPco2);
  const cotes = (hb: number) => (1.7 * hb) / (10.22 + hb);
  return {
    ...a,
    arterialPco2,
    alveolarPo2,
    dlo2: a.dlo2 * (cotes(s.hb) / cotes(NORMAL_SCENARIO.hb)),
  };
}
