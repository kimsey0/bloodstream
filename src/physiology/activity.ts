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
 *   (Saltin & Gollnick); pulmonary capillary volume ~2× at maximal exercise,
 *   which keeps pulmonary capillary transit near 0.4 s (Hsia, Respir Physiol
 *   1999; Hopkins et al., Respir Physiol 1996).
 * - DLO2 rises from 25 to 85 mL/min/mmHg. Hopkins 1996 measured ~108 in
 *   athletes at a cardiac output of 33 L/min; that inert-gas estimate is the
 *   lowest value consistent with their data and assumes uniform transit
 *   times. The model has spread-out transit times but no ventilation–
 *   perfusion mismatch, so DLO2 is set to give the alveolar–arterial PO2
 *   difference Dempsey & Wagner report for VO2max 35–55 mL/kg/min: 5–10 mmHg
 *   at rest rising to 15–25 at maximal work.
 * - CO2 output per O2 used (the respiratory exchange ratio) rises from ~0.8
 *   at rest to ~1.1 at maximal work, as carbohydrate takes over from fat and
 *   lactate is buffered by bicarbonate (Åstrand & Rodahl). Tissues add CO2 to
 *   blood in that ratio.
 * - Arterial blood at maximal work: hyperventilation lowers PCO2 to ~34 mmHg
 *   and raises alveolar PO2 to ~115 mmHg; lactate lowers pH to ~7.33; blood
 *   warms ~1.5 °C over a progressive test (Dempsey & Wagner, J Appl Physiol
 *   1999; Calbet et al., Am J Physiol 2005).
 * - Working-muscle venous blood at maximal work: PCO2 ~65–70 mmHg and pH
 *   ~7.2, which the added CO2 alone explains (Calbet 2005), and only
 *   ~0.1–0.2 °C warmer than arterial blood (González-Alonso & Calbet,
 *   Circulation 2003). This right-shifts the dissociation curve (Bohr
 *   effect; femoral venous P50 ≈ 37 mmHg in Calbet 2005) and helps
 *   unloading.
 */
import { CO2_CAPACITANCE, STANDARD_CONDITIONS, type Chemistry } from './dissociation';
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
  /** Respiratory quotient: CO2 produced per O2 consumed. */
  rq: number;
  /** Arterial PCO2, mmHg (falls with hyperventilation). */
  arterialPco2: number;
  /** Fall in arterial pH from lactic acid. */
  arterialAcid: number;
  /** Arterial blood temperature above 37 °C. */
  bodyHeat: number;
  /** Further fall in pH from arterial to venous blood in fully working muscle (lactic acid). */
  muscleAcid: number;
  /** Venous temperature above arterial in fully working muscle, °C. */
  muscleHeat: number;
  /** Extra factor on a bed's flow, by capillary segment id (compensation in "what if" scenarios). */
  bedFlowScale?: Record<string, number>;
}

type Numeric = Omit<ActivityState, 'level' | 'label' | 'tissueFlow' | 'tissueVo2' | 'bedFlowScale'>;

interface Anchor extends Numeric {
  level: number;
  label: string;
  tissueFlow: Omit<Record<Tissue, number>, 'muscle'>;
  tissueVo2: Omit<Record<Tissue, number>, 'muscle'>;
}

const ANCHORS: Anchor[] = [
  {
    level: 0, label: 'Rest', met: 1, heartRate: 70, cardiacOutput: 5000 / 60, vo2: 250,
    tissueFlow: { brain: 700, heart: 225, kidney: 1000, gut: 950, liver: 325, skin: 400, bronchial: 75, other: 475 },
    tissueVo2: { brain: 48, heart: 30, kidney: 18, gut: 28, liver: 32, skin: 10, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 1, muscleArterioleDilation: 1, lungCapillaryRecruitment: 1, dlo2: 25, alveolarPo2: 100,
    rq: 0.8, arterialPco2: 40, arterialAcid: 0, bodyHeat: 0, muscleAcid: 0, muscleHeat: 0,
  },
  {
    level: 0.25, label: 'Walking', met: 3.5, heartRate: 100, cardiacOutput: 9000 / 60, vo2: 875,
    tissueFlow: { brain: 720, heart: 400, kidney: 900, gut: 850, liver: 290, skin: 700, bronchial: 80, other: 450 },
    tissueVo2: { brain: 48, heart: 50, kidney: 18, gut: 28, liver: 32, skin: 12, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 2.2, muscleArterioleDilation: 1.3, lungCapillaryRecruitment: 1.3, dlo2: 35, alveolarPo2: 103,
    rq: 0.85, arterialPco2: 40, arterialAcid: 0, bodyHeat: 0.2, muscleAcid: 0, muscleHeat: 0.1,
  },
  {
    level: 0.6, label: 'Jogging', met: 8, heartRate: 145, cardiacOutput: 16000 / 60, vo2: 2000,
    tissueFlow: { brain: 750, heart: 700, kidney: 600, gut: 550, liver: 190, skin: 1200, bronchial: 90, other: 350 },
    tissueVo2: { brain: 48, heart: 90, kidney: 18, gut: 28, liver: 32, skin: 14, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 3.2, muscleArterioleDilation: 1.7, lungCapillaryRecruitment: 1.8, dlo2: 62, alveolarPo2: 107,
    rq: 0.95, arterialPco2: 38, arterialAcid: 0.02, bodyHeat: 0.8, muscleAcid: 0, muscleHeat: 0.15,
  },
  {
    level: 1, label: 'Maximal', met: 13, heartRate: 185, cardiacOutput: 22000 / 60, vo2: 3250,
    tissueFlow: { brain: 800, heart: 1000, kidney: 275, gut: 300, liver: 100, skin: 600, bronchial: 100, other: 250 },
    tissueVo2: { brain: 48, heart: 120, kidney: 18, gut: 28, liver: 32, skin: 15, bronchial: 3, other: 26 },
    muscleCapillaryRecruitment: 4, muscleArterioleDilation: 2, lungCapillaryRecruitment: 2.2, dlo2: 85, alveolarPo2: 115,
    rq: 1.1, arterialPco2: 34, arterialAcid: 0.09, bodyHeat: 1.5, muscleAcid: 0, muscleHeat: 0.2,
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
    rq: num('rq'),
    arterialPco2: num('arterialPco2'),
    arterialAcid: num('arterialAcid'),
    bodyHeat: num('bodyHeat'),
    muscleAcid: num('muscleAcid'),
    muscleHeat: num('muscleHeat'),
  };
}

export const REST_STATE = activityState(0);

/** Arterial blood chemistry at an activity level, as excesses over resting arterial blood. */
export function arterialChemistry(a: Pick<ActivityState, 'arterialPco2' | 'arterialAcid' | 'bodyHeat'>): Chemistry {
  return { co2: (a.arterialPco2 - STANDARD_CONDITIONS.pco2) * CO2_CAPACITANCE, acid: a.arterialAcid, heat: a.bodyHeat };
}
