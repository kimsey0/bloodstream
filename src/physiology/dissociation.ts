/**
 * Haemoglobin–oxygen dissociation curve for whole human blood.
 *
 * Cell-level saturation uses Severinghaus' modified Hill equation, which fits
 * the standard human curve (37 °C, pH 7.40, PCO2 40 mmHg, normal 2,3-DPG) to
 * within ±0.0055 fractional saturation and has P50 ≈ 26.8 mmHg.
 *
 *   Severinghaus JW. Simple, accurate equations for human blood O2
 *   dissociation computations. J Appl Physiol 1979;46:599–602.
 *
 * Non-standard conditions (Bohr effect, temperature, CO2) are applied via the
 * "virtual PO2" approach from the same paper and from Kelman (1966): the
 * actual PO2 is scaled to the PO2 that would give the same saturation under
 * standard conditions.
 */

/** O2 content constants for whole blood. */
export const BLOOD = {
  /** Haemoglobin concentration, g/mL (15 g/dL, adult male reference). */
  hb: 0.15,
  /** Hüfner's constant as measured in vivo, mL O2 per g Hb. */
  hufner: 1.34,
  /** O2 solubility in plasma, mL O2 per mL blood per mmHg (0.003 mL/dL/mmHg). */
  solubility: 0.00003,
  /** O2 solubility as molar concentration, µM per mmHg at 37 °C. */
  solubilityMicromolar: 1.38,
} as const;

/** Maximum Hb-bound O2, mL O2 per mL blood (≈ 0.201). */
export const O2_CAPACITY = BLOOD.hb * BLOOD.hufner;

export interface BloodConditions {
  /** Plasma pH. */
  pH: number;
  /** PCO2 in mmHg. */
  pco2: number;
  /** Temperature in °C. */
  temperature: number;
}

export const STANDARD_CONDITIONS: BloodConditions = { pH: 7.4, pco2: 40, temperature: 37 };

/**
 * Blood chemistry carried round the circulation, as excesses over arterial
 * blood. Tissues add CO2, and working muscle also adds lactic acid and heat;
 * these mix by flow in the veins. The lungs return CO2 to arterial levels.
 */
export interface Chemistry {
  /** Extra CO2 content, mL CO2 per mL blood. */
  co2: number;
  /** Fall in pH from non-respiratory (lactic) acid. */
  acid: number;
  /** Temperature above 37 °C. */
  heat: number;
}

export const ARTERIAL_CHEMISTRY: Chemistry = { co2: 0, acid: 0, heat: 0 };

/**
 * Whole-blood CO2 capacitance in vivo, mL CO2 per mL blood per mmHg, and the
 * fall in pH per mmHg PCO2. Guyton & Hall ch. 41: blood gains 4 mL CO2/dL
 * between arterial PCO2 40 and venous 45 mmHg, and pH falls from 7.41 to
 * 7.37. Both slopes include the Haldane effect: deoxygenated haemoglobin
 * takes up more CO2 and H+.
 */
export const CO2_CAPACITANCE = 0.008;
export const PH_PER_MMHG_CO2 = 0.008;

export function conditionsFromChemistry(c: Chemistry): BloodConditions {
  const pco2 = STANDARD_CONDITIONS.pco2 + c.co2 / CO2_CAPACITANCE;
  return {
    pH: STANDARD_CONDITIONS.pH - PH_PER_MMHG_CO2 * (pco2 - STANDARD_CONDITIONS.pco2) - c.acid,
    pco2,
    temperature: STANDARD_CONDITIONS.temperature + c.heat,
  };
}

/**
 * Factor converting actual PO2 to the equivalent PO2 under standard
 * conditions. Coefficients: Severinghaus 1979 (pH 0.40 per unit, CO2 0.06
 * per log10 unit, temperature 0.024 per °C).
 */
export function virtualPo2Factor(c: BloodConditions): number {
  return Math.pow(
    10,
    0.024 * (37 - c.temperature) + 0.4 * (c.pH - 7.4) + 0.06 * Math.log10(40 / c.pco2),
  );
}

/** Fractional saturation (0–1) at standard conditions for a given PO2 (mmHg). */
export function saturationStandard(po2: number): number {
  if (po2 <= 0) return 0;
  const x = po2 * po2 * po2 + 150 * po2;
  return x / (x + 23400);
}

/** d(S)/d(PO2) at standard conditions, per mmHg. */
export function saturationSlopeStandard(po2: number): number {
  if (po2 <= 0) return 150 / 23400;
  const x = po2 * po2 * po2 + 150 * po2;
  const dx = 3 * po2 * po2 + 150;
  return (23400 * dx) / ((x + 23400) * (x + 23400));
}

/**
 * Inverse of the Severinghaus equation at standard conditions. Solves the
 * depressed cubic P³ + 150 P − q = 0, q = 23400 S/(1−S), with Cardano's
 * formula (one real root because the linear coefficient is positive).
 */
export function po2Standard(saturation: number): number {
  if (saturation <= 0) return 0;
  const s = Math.min(saturation, 1 - 1e-12);
  const q = (23400 * s) / (1 - s);
  const d = Math.sqrt((q * q) / 4 + 125000); // (150/3)³ = 125 000
  return Math.cbrt(q / 2 + d) + Math.cbrt(q / 2 - d);
}

export function saturation(po2: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return saturationStandard(po2 * virtualPo2Factor(c));
}

export function po2FromSaturation(s: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return po2Standard(s) / virtualPo2Factor(c);
}

/** PO2 at 50 % saturation under the given conditions. */
export function p50(c: BloodConditions = STANDARD_CONDITIONS): number {
  return po2FromSaturation(0.5, c);
}

/** Total O2 content (bound + dissolved), mL O2 per mL blood. */
export function o2Content(po2: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return O2_CAPACITY * saturation(po2, c) + BLOOD.solubility * po2;
}

/** dC/dPO2, mL O2 per mL blood per mmHg: the blood's O2 "capacitance". */
export function o2ContentSlope(po2: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  const f = virtualPo2Factor(c);
  return O2_CAPACITY * saturationSlopeStandard(po2 * f) * f + BLOOD.solubility;
}

/** Inverse of o2Content, by bisection (content is strictly increasing in PO2). */
export function po2FromContent(content: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  let lo = 0;
  let hi = 800;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (o2Content(mid, c) < content) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
