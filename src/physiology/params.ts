/**
 * Whole-body parameters for a resting adult (70 kg, Hb 15 g/dL). Every
 * physiological number in the model is listed, with its source and status,
 * in docs/SOURCES.md.
 *
 * Sources (textbook reference values):
 * - Cardiac output, VO2, blood volume: Guyton & Hall, Textbook of Medical
 *   Physiology, 14th ed.; Ganong's Review of Medical Physiology, 26th ed.
 * - Distribution of blood volume (heart 7 %, pulmonary 9 %, systemic
 *   arteries 13 %, arterioles + capillaries 7 %, veins 64 %): Guyton & Hall
 *   ch. 14.
 * - Organ blood flow and O2 consumption at rest: Ganong table 32-1 (flows
 *   rescaled to a 5 L/min cardiac output; organ VO2 adjusted so they add up
 *   to 250 mL/min).
 * - Alveolar PO2 from the alveolar gas equation:
 *   0.21 × (760 − 47) − 40 / 0.8 ≈ 100 mmHg.
 * - DLO2 20–30 mL/min/mmHg; pulmonary capillary transit ≈ 0.75 s with O2
 *   equilibrium after ≈ 0.25 s: West's Respiratory Physiology, 10th ed.
 *   (ch. 3); Wagner, Physiol Rev 1977.
 */
export const REST = {
  /** Cardiac output, mL/s (5.0 L/min). */
  cardiacOutput: 5000 / 60,
  /** Heart rate, beats/min. */
  heartRate: 70,
  /** Whole-body O2 consumption, mL/min (≈ 3.5 mL/kg/min = 1 MET). */
  vo2: 250,
  /** Alveolar PO2, mmHg. */
  alveolarPo2: 100,
  /** Pulmonary diffusing capacity for O2, mL O2 / min / mmHg. */
  dlo2: 25,
  /** Reference total blood volume, mL (≈ 70 mL/kg). */
  bloodVolume: 5000,
} as const;

export type Tissue =
  | 'brain'
  | 'heart'
  | 'kidney'
  | 'gut'
  | 'liver'
  | 'muscle'
  | 'skin'
  | 'bronchial'
  | 'other';

export interface TissueParams {
  /** Fraction of cardiac output supplied by arteries to this tissue at rest. */
  flowFraction: number;
  /** O2 consumption, mL/min at rest. */
  vo2: number;
  /**
   * Mean tissue PO2 at rest, mmHg: what capillaries unload towards. It sets
   * each bed's O2 diffusing capacity; at other activity levels tissue PO2
   * follows from that capacity and the tissue's O2 use.
   */
  tissuePo2: number;
  /** Mean RBC transit through small arteries + arterioles, s. */
  arterialTransit: number;
  /** Mean RBC transit through the capillary bed, s (typical 0.5–3 s). */
  capillaryTransit: number;
  /** Capillary path length from arteriole to venule, mm. */
  capillaryLength: number;
  /** Capillary diameter, µm. */
  capillaryDiameter: number;
  /** Mean RBC transit through venules + unnamed veins, s. */
  venousTransit: number;
}

/**
 * Per-tissue parameters at rest. Venous transit times are longest in the gut
 * and skin because their venous beds are the body's blood reservoirs: about
 * 64 % of blood volume sits in systemic veins, and the splanchnic (gut +
 * liver) circulation alone holds roughly a third of all blood. Resting
 * muscle (≈ 3 mL/min per 100 g, total transit ≈ 30–40 s) holds much less. Tissue PO2 values are
 * typical measured resting values: brain 25 (awake human white matter
 * 22.6 ± 7.2 mmHg, Pennings et al., J Neurotrauma 2008; grey matter runs
 * higher); muscle 34, inside the cells (myoglobin
 * spectroscopy; Richardson et al., J Physiol 2006); others interstitial.
 * Each lies below the tissue's venous PO2, as diffusion requires.
 */
export const TISSUES: Record<Tissue, TissueParams> = {
  brain: { flowFraction: 0.14, vo2: 48, tissuePo2: 25, arterialTransit: 2, capillaryTransit: 1.0, capillaryLength: 0.6, capillaryDiameter: 5, venousTransit: 3 },
  heart: { flowFraction: 0.045, vo2: 30, tissuePo2: 10, arterialTransit: 1.5, capillaryTransit: 1.0, capillaryLength: 0.5, capillaryDiameter: 5.5, venousTransit: 4 },
  kidney: { flowFraction: 0.2, vo2: 18, tissuePo2: 30, arterialTransit: 1.5, capillaryTransit: 1.5, capillaryLength: 0.6, capillaryDiameter: 7, venousTransit: 4 },
  gut: { flowFraction: 0.19, vo2: 28, tissuePo2: 30, arterialTransit: 4, capillaryTransit: 1.5, capillaryLength: 0.5, capillaryDiameter: 6, venousTransit: 49 },
  liver: { flowFraction: 0.065, vo2: 32, tissuePo2: 25, arterialTransit: 3, capillaryTransit: 1.5, capillaryLength: 0.4, capillaryDiameter: 9, venousTransit: 27 },
  muscle: { flowFraction: 0.17, vo2: 55, tissuePo2: 34, arterialTransit: 6, capillaryTransit: 2.5, capillaryLength: 1.0, capillaryDiameter: 5, venousTransit: 25 },
  skin: { flowFraction: 0.08, vo2: 10, tissuePo2: 30, arterialTransit: 5, capillaryTransit: 2.0, capillaryLength: 0.5, capillaryDiameter: 6, venousTransit: 50 },
  bronchial: { flowFraction: 0.015, vo2: 3, tissuePo2: 25, arterialTransit: 2, capillaryTransit: 1.5, capillaryLength: 0.5, capillaryDiameter: 6, venousTransit: 4 },
  other: { flowFraction: 0.095, vo2: 26, tissuePo2: 20, arterialTransit: 6, capillaryTransit: 2.0, capillaryLength: 0.6, capillaryDiameter: 6, venousTransit: 40 },
};

/**
 * Tissue O2 diffusing capacity (DmO2, mL O2/min/mmHg): how much O2 a bed's
 * capillaries pass to its cells per mmHg of PO2 difference. Each bed's resting
 * value follows from its resting tissue PO2.
 *
 * In muscle and heart it rises with blood flow, as dilated vessels carry more
 * red cells through more capillary surface: DmO2 ∝ flow^exponent. The single
 * exponent is set so thigh muscle reaches the intracellular PO2 of ~3 mmHg
 * measured at maximal exercise (Richardson et al., J Clin Invest 1995). It
 * then gives DmO2 ≈ 30× resting and ≈ 13 mL/min/mmHg per kg at maximal
 * exercise (Richardson 1995: 35 for 2.5 kg of quadriceps), and the
 * capillary–cell PO2 difference rises ~4× (Richardson 2006: ~3.5×).
 * Other tissues do not recruit: their tissue PO2 falls if their O2 supply does.
 */
export const DIFFUSION = {
  /** DmO2 ∝ flow^recruitmentExponent in muscle and heart. */
  recruitmentExponent: 0.875,
  /** Resting muscle mass, kg (~40 % of a 70 kg body), for per-kg values. */
  muscleMass: 28,
} as const;

/**
 * Myoglobin, the O2 store inside muscle and heart cells: half saturated at
 * 3.2 mmHg near 39 °C (Richardson et al., J Clin Invest 1995). Its saturation
 * is how intracellular PO2 is measured.
 */
export const MYOGLOBIN_P50 = 3.2;

export function myoglobinSaturation(po2: number): number {
  return po2 <= 0 ? 0 : po2 / (po2 + MYOGLOBIN_P50);
}

/** Pulmonary microcirculation at rest. */
export const LUNG = {
  /** Fraction of pulmonary flow to the left lung (the right lung is larger). */
  leftFraction: 0.45,
  /** Mean RBC transit through the pulmonary arterial tree beyond the named arteries, s. */
  arterialTransit: 1.1,
  /** Mean RBC transit through a pulmonary capillary, s. */
  capillaryTransit: 0.75,
  capillaryLength: 0.6,
  capillaryDiameter: 7,
  /** Mean RBC transit through pulmonary venules and unnamed veins, s. */
  venousTransit: 2.4,
} as const;

/**
 * Ratio of tube haematocrit to discharge haematocrit (the Fåhraeus effect):
 * RBCs travel faster than the surrounding plasma in narrow vessels, so they
 * occupy a smaller share of those vessels' volume.
 * Pries et al., Circ Res 1990; Desjardins & Duling 1990.
 */
export const HCT_RATIO = {
  arteriole: 0.9,
  capillary: 0.6,
  pulmonaryCapillary: 0.85,
  venule: 0.95,
} as const;

/** Coefficient of variation of individual RBC transit times per segment type. */
export const TRANSIT_CV = {
  chamber: 0.4,
  arteriole: 0.3,
  capillary: 0.5,
  pulmonaryCapillary: 0.4,
  venule: 0.4,
} as const;
