/**
 * Activity level, from rest to maximal running.
 *
 * Four anchor states are interpolated linearly; the slider level (0–1) maps
 * onto them. Values are for a healthy, moderately fit 70 kg adult (VO2max
 * ≈ 46 mL/kg/min):
 *
 * - Heart rate, cardiac output and VO2: Åstrand & Rodahl, Textbook of Work
 *   Physiology; Guyton & Hall ch. 85 (CO 5 → 22 L/min, VO2 0.25 → 3.25 L/min).
 * - Flow redistribution: working muscle rises from ~17 % to ~85 % of cardiac
 *   output; kidney and splanchnic flow fall to ~25–30 % of resting; coronary
 *   flow rises ~4–5×; skin rises for heat loss at moderate work and falls
 *   again at maximal work; brain flow is nearly constant (Rowell, Human
 *   Circulation, 1986).
 * - Capillary recruitment: muscle capillary blood volume up to ~4×
 *   (Saltin & Gollnick); pulmonary capillary volume ~2× and DLO2 ~2.5× at
 *   maximal exercise (DLO2 25 → ~75 mL/min/mmHg; Hsia, Respir Physiol 1999), which keeps pulmonary
 *   transit near 0.4 s.
 * - Working-muscle venous blood at maximal exercise: ~39 °C, pH ~7.2, PCO2
 *   ~60 mmHg, which right-shifts the dissociation curve (Bohr effect) and
 *   helps unloading.
 */
import type { BloodConditions } from './dissociation';
import type { Tissue } from './params';

export interface ActivityState {
  /** Slider position, 0 (rest) to 1 (maximal). */
  level: number;
  label: string;
  /** Metabolic equivalents (1 MET = resting). */
  met: number;
  heartRate: number;
  /** mL/s. */
  cardiacOutput: number;
  /** Whole-body O2 consumption, mL/min. */
  vo2: number;
  /** Blood flow to each tissue, mL/min. */
  tissueFlow: Record<Tissue, number>;
  /** O2 consumption of each tissue, mL/min. */
  tissueVo2: Record<Tissue, number>;
  /** Capillary blood volume factor in fully working muscle. */
  muscleCapillaryRecruitment: number;
  /** Arteriolar blood volume factor in fully working muscle (vasodilation). */
  muscleArterioleDilation: number;
  /** Pulmonary capillary blood volume factor. */
  lungCapillaryRecruitment: number;
  /** Pulmonary diffusing capacity for O2, mL/min/mmHg. */
  dlo2: number;
  alveolarPo2: number;
  /** Blood conditions in fully working muscle capillaries. */
  muscleConditions: BloodConditions;
}

type Numeric = Omit<ActivityState, 'level' | 'label' | 'tissueFlow' | 'tissueVo2' | 'muscleConditions'>;

interface Anchor extends Numeric {
  level: number;
  label: string;
  tissueFlow: Omit<Record<Tissue, number>, 'muscle'>;
  tissueVo2: Omit<Record<Tissue, number>, 'muscle'>;
  muscleConditions: BloodConditions;
}

const ANCHORS: Anchor[] = [
  {
    level: 0, label: 'Rest', met: 1, heartRate: 70, cardiacOutput: 5000 / 60, vo2: 250,
    tissueFlow: { brain: 700, heart: 225, kidney: 1000, gut: 950, liver: 325, skin: 400, bronchial: 75, other: 475 },
    tissueVo2: { brain: 48, heart: 30, kidney: 18, gut: 28, liver: 32, skin: 10, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 1, muscleArterioleDilation: 1, lungCapillaryRecruitment: 1, dlo2: 25, alveolarPo2: 100,
    muscleConditions: { pH: 7.4, pco2: 40, temperature: 37 },
  },
  {
    level: 0.25, label: 'Walking', met: 3.5, heartRate: 100, cardiacOutput: 9000 / 60, vo2: 875,
    tissueFlow: { brain: 720, heart: 400, kidney: 900, gut: 850, liver: 290, skin: 700, bronchial: 80, other: 450 },
    tissueVo2: { brain: 48, heart: 50, kidney: 18, gut: 28, liver: 32, skin: 12, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 2.2, muscleArterioleDilation: 1.3, lungCapillaryRecruitment: 1.3, dlo2: 35, alveolarPo2: 102,
    muscleConditions: { pH: 7.37, pco2: 46, temperature: 37.5 },
  },
  {
    level: 0.6, label: 'Jogging', met: 8, heartRate: 145, cardiacOutput: 16000 / 60, vo2: 2000,
    tissueFlow: { brain: 750, heart: 700, kidney: 600, gut: 550, liver: 190, skin: 1200, bronchial: 90, other: 350 },
    tissueVo2: { brain: 48, heart: 90, kidney: 18, gut: 28, liver: 32, skin: 14, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 3.2, muscleArterioleDilation: 1.7, lungCapillaryRecruitment: 1.8, dlo2: 55, alveolarPo2: 105,
    muscleConditions: { pH: 7.3, pco2: 52, temperature: 38.5 },
  },
  {
    level: 1, label: 'Maximal', met: 13, heartRate: 185, cardiacOutput: 22000 / 60, vo2: 3250,
    tissueFlow: { brain: 800, heart: 1000, kidney: 275, gut: 300, liver: 100, skin: 600, bronchial: 100, other: 250 },
    tissueVo2: { brain: 48, heart: 120, kidney: 18, gut: 28, liver: 32, skin: 15, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 4, muscleArterioleDilation: 2, lungCapillaryRecruitment: 2.2, dlo2: 75, alveolarPo2: 110,
    muscleConditions: { pH: 7.2, pco2: 60, temperature: 39.5 },
  },
];

export const ACTIVITY_LABELS = ANCHORS.map((a) => ({ level: a.level, label: a.label }));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The physiological state at a slider level (0–1). */
export function activityState(level: number): ActivityState {
  const x = Math.min(1, Math.max(0, level));
  let i = 0;
  while (i < ANCHORS.length - 2 && x > ANCHORS[i + 1].level) i++;
  const a = ANCHORS[i];
  const b = ANCHORS[i + 1];
  const t = (x - a.level) / (b.level - a.level);
  const num = (k: keyof Numeric) => lerp(a[k] as number, b[k] as number, t);
  const tissues = Object.keys(a.tissueFlow) as Exclude<Tissue, 'muscle'>[];
  const cardiacOutput = num('cardiacOutput');
  const vo2 = num('vo2');
  const tissueFlow = Object.fromEntries(tissues.map((k) => [k, lerp(a.tissueFlow[k], b.tissueFlow[k], t)])) as Record<Tissue, number>;
  const tissueVo2 = Object.fromEntries(tissues.map((k) => [k, lerp(a.tissueVo2[k], b.tissueVo2[k], t)])) as Record<Tissue, number>;
  // Muscle receives whatever cardiac output and VO2 the other tissues don't.
  tissueFlow.muscle = cardiacOutput * 60 - tissues.reduce((s, k) => s + tissueFlow[k], 0);
  tissueVo2.muscle = vo2 - tissues.reduce((s, k) => s + tissueVo2[k], 0);
  const nearest = t < 0.5 ? a : b;
  return {
    level: x,
    label: Math.abs(x - nearest.level) < 0.04 ? nearest.label : `${a.label}–${b.label.toLowerCase()}`,
    met: num('met'),
    heartRate: num('heartRate'),
    cardiacOutput,
    vo2,
    tissueFlow,
    tissueVo2,
    muscleCapillaryRecruitment: num('muscleCapillaryRecruitment'),
    muscleArterioleDilation: num('muscleArterioleDilation'),
    lungCapillaryRecruitment: num('lungCapillaryRecruitment'),
    dlo2: num('dlo2'),
    alveolarPo2: num('alveolarPo2'),
    muscleConditions: {
      pH: lerp(a.muscleConditions.pH, b.muscleConditions.pH, t),
      pco2: lerp(a.muscleConditions.pco2, b.muscleConditions.pco2, t),
      temperature: lerp(a.muscleConditions.temperature, b.muscleConditions.temperature, t),
    },
  };
}

export const REST_STATE = activityState(0);
