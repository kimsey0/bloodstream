import { describe, expect, it } from 'vitest';
import { saturation } from '../src/physiology/dissociation';
import {
  adairDistribution,
  adairPo2,
  adairSaturation,
  HemoglobinMolecule,
  OFF_RATE,
} from '../src/physiology/hemoglobin';
import { Rng } from '../src/sim/rng';

describe('Adair equilibrium (Imai constants)', () => {
  it('agrees with the Severinghaus whole-blood curve within 3 % saturation', () => {
    for (let p = 5; p <= 150; p += 5) {
      expect(Math.abs(adairSaturation(p) - saturation(p))).toBeLessThan(0.03);
    }
  });

  it('is cooperative: at half saturation most molecules are empty or full', () => {
    const d = adairDistribution(adairPo2(0.5));
    // Independent sites would give a binomial distribution: 1/16 + 1/16 = 12.5 %.
    expect(d[0] + d[4]).toBeGreaterThan(0.5);
    expect(d[3]).toBeLessThan(0.1);
  });

  it('has off-rates in the measured T-state and R-state ranges', () => {
    expect(OFF_RATE[0]).toBeGreaterThan(1000);
    expect(OFF_RATE[3]).toBeGreaterThan(10);
    expect(OFF_RATE[3]).toBeLessThan(100);
  });
});

describe('single-molecule Markov chain', () => {
  it('time-averaged occupancy matches the cell saturation it is driven by', () => {
    for (const s of [0.3, 0.75, 0.97]) {
      const m = new HemoglobinMolecule(new Rng(3));
      const p = adairPo2(s);
      const dt = 0.001;
      let sum = 0;
      const steps = 200_000;
      for (let i = 0; i < steps; i++) {
        m.step(dt, p);
        sum += m.bound;
      }
      expect(sum / steps / 4).toBeCloseTo(s, 1);
      expect(m.sites.filter(Boolean).length).toBe(m.bound);
    }
  });

  it('fully oxygenated haemoglobin keeps all four O2 for tens of ms on average', () => {
    // Dwell time in state 4 is 1 / (4 · k_off,4).
    const dwell = 1 / (4 * OFF_RATE[3]);
    expect(dwell).toBeGreaterThan(0.002);
    expect(dwell).toBeLessThan(0.03);
  });
});
