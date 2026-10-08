/**
 * A single haemoglobin tetramer (α2β2) with four haem O2 binding sites.
 *
 * Equilibrium: Adair's stepwise scheme with Imai's intrinsic (per-site)
 * constants for human blood at 37 °C, pH 7.4, PCO2 40 mmHg:
 *   k1 = 0.0037, k2 = 0.047, k3 = 0.012, k4 = 1.1 mmHg⁻¹
 * (Imai K. Allosteric Effects in Haemoglobin, 1982; as tabulated in
 * Zoological Science 18:905, 2001). The 4th O2 binds ~300× more strongly
 * than the 1st: cooperativity.
 *
 * Kinetics: on-rates per free site are chosen inside the measured T-state
 * (5–11 µM⁻¹s⁻¹) and R-state (30–80 µM⁻¹s⁻¹) ranges (Gibson; Unzai et al.
 * JBC 1998). Off-rates are then fixed by k_off = k_on / k_i so the chain
 * reproduces the Adair equilibrium exactly. They come out at ~3000 s⁻¹ for
 * the first O2 (T-state, measured 1800–3700 s⁻¹) and ~38 s⁻¹ for the last
 * (R-state, measured 16–32 s⁻¹).
 *
 * Cooperative binding happens in milliseconds. Uptake by whole red cells is
 * still not instantaneous: Roughton and Forster split the lung's diffusing
 * capacity into the alveolar membrane and uptake by the red cells in the
 * capillaries, and both resist O2 transfer. The model lumps them into DLO2.
 */
import { BLOOD } from './dissociation';
import type { Rng } from '../sim/rng';

/** Intrinsic Adair constants, per mmHg, for steps 1..4. */
export const ADAIR_K = [0.0037, 0.047, 0.012, 1.1] as const;

/** Assumed microscopic on-rates per free site, µM⁻¹ s⁻¹, for steps 1..4. */
export const ON_RATE_MICROMOLAR = [8, 10, 15, 30] as const;

/** On-rate per free site per mmHg PO2, s⁻¹ mmHg⁻¹. */
export const ON_RATE = ON_RATE_MICROMOLAR.map((k) => k * BLOOD.solubilityMicromolar);
/** Off-rate per bound site, s⁻¹. */
export const OFF_RATE = ON_RATE.map((k, i) => k / ADAIR_K[i]);

/** Binomial-weighted statistical factors for intrinsic Adair constants. */
const BINOM = [1, 4, 6, 4, 1];

/**
 * Probability that a tetramer has 0..4 O2 bound at the given PO2 (Adair
 * equilibrium). Over a cell's ~270 million Hb molecules this is also the
 * fraction of molecules in each state.
 */
export function adairDistribution(po2: number): number[] {
  const w = [1];
  let prod = 1;
  for (let i = 0; i < 4; i++) {
    prod *= ADAIR_K[i] * po2;
    w.push(BINOM[i + 1] * prod);
  }
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}

/** Fractional saturation predicted by Adair's equation. */
export function adairSaturation(po2: number): number {
  const d = adairDistribution(po2);
  return (d[1] + 2 * d[2] + 3 * d[3] + 4 * d[4]) / 4;
}

/** Inverse of adairSaturation, by bisection. */
export function adairPo2(saturation: number): number {
  let lo = 0;
  let hi = 2000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (adairSaturation(mid) < saturation) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Number of Hb tetramers in one red blood cell (MCH ≈ 30 pg / 64.5 kDa). */
export const HB_PER_RBC = 2.7e8;

/**
 * One tetramer simulated as a continuous-time Markov chain over 0..4 bound
 * O2 (Gillespie algorithm), driven by an effective PO2.
 *
 * Drive it with `adairPo2(cellSaturation)` rather than the raw plasma PO2.
 * Its long-run occupancy then equals the cell's saturation from the
 * Severinghaus curve, including any Bohr shift.
 */
export class HemoglobinMolecule {
  /** Number of O2 bound, 0..4. */
  bound: number;
  /** Which of the four sites (α1, β1, α2, β2) are occupied. */
  readonly sites: boolean[] = [false, false, false, false];

  constructor(
    private readonly rng: Rng,
    initialBound = 0,
  ) {
    this.bound = 0;
    for (let i = 0; i < initialBound; i++) this.bind();
  }

  /** Advance by dt seconds at a constant effective PO2. Returns transitions made. */
  step(dt: number, po2: number): number {
    let t = 0;
    let transitions = 0;
    for (;;) {
      const n = this.bound;
      const up = n < 4 ? (4 - n) * ON_RATE[n] * po2 : 0;
      const down = n > 0 ? n * OFF_RATE[n - 1] : 0;
      const total = up + down;
      if (total <= 0) return transitions;
      t += -Math.log(1 - this.rng.next()) / total;
      if (t > dt) return transitions;
      if (this.rng.next() * total < up) this.bind();
      else this.release();
      transitions++;
    }
  }

  private bind(): void {
    const free = this.sites.flatMap((b, i) => (b ? [] : [i]));
    this.sites[free[Math.floor(this.rng.next() * free.length)]] = true;
    this.bound++;
  }

  private release(): void {
    const taken = this.sites.flatMap((b, i) => (b ? [i] : []));
    this.sites[taken[Math.floor(this.rng.next() * taken.length)]] = false;
    this.bound--;
  }
}
