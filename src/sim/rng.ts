/** Small seeded PRNG (mulberry32) so simulations and tests are reproducible. */
export class Rng {
  private state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal sample with the given arithmetic mean and coefficient of variation. */
  lognormal(mean: number, cv: number): number {
    if (cv <= 0) return mean;
    const sigma2 = Math.log(1 + cv * cv);
    return mean * Math.exp(Math.sqrt(sigma2) * this.normal() - sigma2 / 2);
  }
}
