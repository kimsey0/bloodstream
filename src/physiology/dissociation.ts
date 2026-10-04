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
  /** Normal haemoglobin concentration, g/mL (15 g/dL, adult male reference). */
  hb: 0.15,
  /** Hüfner's constant as measured in vivo, mL O2 per g Hb. */
  hufner: 1.34,
  /** O2 solubility in plasma, mL O2 per mL blood per mmHg (0.003 mL/dL/mmHg). */
  solubility: 0.00003,
  /** O2 solubility as molar concentration, µM per mmHg at 37 °C. */
  solubilityMicromolar: 1.38,
} as const;

/**
 * The blood's haemoglobin, which "what if" scenarios change:
 * - concentration, g/dL (anaemia, polycythaemia);
 * - the fraction bound to carbon monoxide (COHb), which carries no O2;
 * - the standard P50 (pH 7.4, PCO2 40, 37 °C), which 2,3-DPG and fetal
 *   haemoglobin shift. Normal adult blood: 26.8 mmHg.
 */
export interface Haemoglobin {
  hb: number;
  coFraction: number;
  p50: number;
}

/** P50 of Severinghaus's standard curve, mmHg. */
export const STANDARD_P50 = 26.86;

export const NORMAL_HAEMOGLOBIN: Haemoglobin = { hb: BLOOD.hb * 100, coFraction: 0, p50: STANDARD_P50 };

let haemoglobin: Haemoglobin = NORMAL_HAEMOGLOBIN;
/** PO2 multiplier that moves the standard P50 to haemoglobin.p50. */
let p50Factor = 1;
/** O2 saturation against virtual PO2 with carbon monoxide present, on a fixed grid (null without CO). */
let coCurve: Float64Array | null = null;

/** Total haemoglobin O2 capacity, mL O2 per mL blood (≈ 0.201 at 15 g/dL). Includes Hb bound to CO. */
export let O2_CAPACITY = BLOOD.hb * BLOOD.hufner;

export function currentHaemoglobin(): Haemoglobin {
  return haemoglobin;
}

export function isNormalHaemoglobin(h: Haemoglobin = haemoglobin): boolean {
  return h.coFraction === 0 && Math.abs(h.hb - NORMAL_HAEMOGLOBIN.hb) < 1e-9 && Math.abs(h.p50 - STANDARD_P50) < 1e-9;
}

/**
 * Set the blood's haemoglobin. Every curve function in this module, and so the whole simulation,
 * uses it. Saturation is then the fraction of all haemoglobin carrying O2 (as a co-oximeter
 * reports it), so with CO it can never reach 100 %.
 */
export function setHaemoglobin(h: Haemoglobin): void {
  haemoglobin = h;
  O2_CAPACITY = (h.hb / 100) * BLOOD.hufner;
  p50Factor = STANDARD_P50 / h.p50;
  coCurve = h.coFraction > 0 ? buildCoCurve(h.coFraction) : null;
}

/** Severinghaus's curve at standard conditions. */
function severinghaus(po2: number): number {
  if (po2 <= 0) return 0;
  const x = po2 * po2 * po2 + 150 * po2;
  return x / (x + 23400);
}

function severinghausSlope(po2: number): number {
  if (po2 <= 0) return 150 / 23400;
  const x = po2 * po2 * po2 + 150 * po2;
  const dx = 3 * po2 * po2 + 150;
  return (23400 * dx) / ((x + 23400) * (x + 23400));
}

/** Inverse of Severinghaus's curve (Cardano: P³ + 150 P − q = 0, q = 23400 S/(1−S)). */
function severinghausInverse(saturation: number): number {
  if (saturation <= 0) return 0;
  const s = Math.min(saturation, 1 - 1e-12);
  const q = (23400 * s) / (1 - s);
  const d = Math.sqrt((q * q) / 4 + 125000); // (150/3)³ = 125 000
  return Math.cbrt(q / 2 + d) + Math.cbrt(q / 2 - d);
}

/** Grid of the CO curve: virtual PO2 from 0 to CO_MAX mmHg. */
const CO_STEP = 0.1;
const CO_MAX = 1000;

/**
 * O2 saturation (fraction of all Hb) with a fixed CO fraction f, by Haldane's rule that CO and O2
 * compete for the same sites (Roughton & Darling 1944): CO acts like extra O2 pressure X, so
 * Hb holds ligand on a fraction Y = S(P + X) of its sites, of which CO has X / (P + X). X is
 * whatever keeps the CO share at f, since COHb hardly changes during one circulation. The
 * remaining haemoglobin holds O2 more tightly: the curve shifts left as well as down.
 */
function buildCoCurve(f: number): Float64Array {
  const n = Math.round(CO_MAX / CO_STEP) + 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * CO_STEP;
    // CO share Y·X/(P+X) rises with X: bisect for X.
    let lo = 0;
    let hi = 1e6;
    for (let k = 0; k < 80; k++) {
      const x = (lo + hi) / 2;
      const y = severinghaus(p + x);
      if ((y * x) / (p + x) < f) lo = x;
      else hi = x;
    }
    const x = (lo + hi) / 2;
    out[i] = Math.max(0, severinghaus(p + x) - f);
  }
  return out;
}

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
 * fall in pH per mmHg PCO2, from arterial, femoral venous and right atrial
 * blood in one study (Calbet et al., Am J Physiol 2005, Table 2):
 * - pH falls 0.0039 per mmHg across the resting leg (7.41 → 7.38 for
 *   PCO2 38.9 → 46.6) and 0.0038 at maximal exercise (7.33 → 7.19 for
 *   34.9 → 72.2).
 * - The leg's CO2 output (O2 extraction × exchange ratio) over its PCO2 rise
 *   gives ≈ 0.0055 mL/mL/mmHg, at rest and at maximal exercise alike.
 * Both slopes include the Haldane effect: deoxygenated haemoglobin takes up
 * more CO2 and H+.
 */
export const CO2_CAPACITANCE = 0.0055;
export const PH_PER_MMHG_CO2 = 0.004;

export function conditionsFromChemistry(c: Chemistry): BloodConditions {
  const pco2 = STANDARD_CONDITIONS.pco2 + c.co2 / CO2_CAPACITANCE;
  return {
    pH: STANDARD_CONDITIONS.pH - PH_PER_MMHG_CO2 * (pco2 - STANDARD_CONDITIONS.pco2) - c.acid,
    pco2,
    temperature: STANDARD_CONDITIONS.temperature + c.heat,
  };
}

/**
 * Factor converting actual PO2 to the equivalent PO2 on the standard curve.
 * Coefficients: Severinghaus 1979 (pH 0.40 per unit, CO2 0.06 per log10
 * unit, temperature 0.024 per °C). It also carries any shift of the
 * haemoglobin's own standard P50 (2,3-DPG, fetal Hb).
 */
export function virtualPo2Factor(c: BloodConditions): number {
  return (
    p50Factor *
    Math.pow(10, 0.024 * (37 - c.temperature) + 0.4 * (c.pH - 7.4) + 0.06 * Math.log10(40 / c.pco2))
  );
}

/** Fractional saturation (0–1 of all Hb) against virtual PO2 (mmHg). */
export function saturationStandard(po2: number): number {
  if (!coCurve) return severinghaus(po2);
  if (po2 <= 0) return 0;
  const x = po2 / CO_STEP;
  const i = Math.floor(x);
  if (i >= coCurve.length - 1) return coCurve[coCurve.length - 1];
  return coCurve[i] + (coCurve[i + 1] - coCurve[i]) * (x - i);
}

/** d(S)/d(PO2) against virtual PO2, per mmHg. */
export function saturationSlopeStandard(po2: number): number {
  if (!coCurve) return severinghausSlope(po2);
  const i = Math.min(coCurve.length - 2, Math.max(0, Math.floor(po2 / CO_STEP)));
  return (coCurve[i + 1] - coCurve[i]) / CO_STEP;
}

/** Inverse of saturationStandard. */
export function po2Standard(saturation: number): number {
  if (!coCurve) return severinghausInverse(saturation);
  if (saturation <= 0) return 0;
  let lo = 0;
  let hi = coCurve.length - 1;
  if (saturation >= coCurve[hi]) return CO_MAX;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (coCurve[mid] < saturation) lo = mid;
    else hi = mid;
  }
  return (lo + (saturation - coCurve[lo]) / (coCurve[hi] - coCurve[lo])) * CO_STEP;
}

/** Saturation of normal adult blood (no CO, standard P50) under these conditions, whatever the current haemoglobin. */
export function normalSaturation(po2: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return severinghaus((po2 * virtualPo2Factor(c)) / p50Factor);
}

export function saturation(po2: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return saturationStandard(po2 * virtualPo2Factor(c));
}

export function po2FromSaturation(s: number, c: BloodConditions = STANDARD_CONDITIONS): number {
  return po2Standard(s) / virtualPo2Factor(c);
}

/** PO2 at which half the haemoglobin free of CO carries O2, under the given conditions. */
export function p50(c: BloodConditions = STANDARD_CONDITIONS): number {
  return po2FromSaturation(0.5 * (1 - haemoglobin.coFraction), c);
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
