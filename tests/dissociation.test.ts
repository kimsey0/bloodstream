import { describe, expect, it } from 'vitest';
import {
  o2Content,
  o2ContentSlope,
  p50,
  po2FromContent,
  po2FromSaturation,
  saturation,
  O2_CAPACITY,
} from '../src/physiology/dissociation';

describe('O2 dissociation curve (Severinghaus 1979)', () => {
  it('has the standard human P50 of 26.8 mmHg', () => {
    expect(p50()).toBeCloseTo(26.8, 0);
  });

  it('matches reference points of the standard curve', () => {
    // Standard curve: 40 mmHg → 75 %, 60 → ~90 %, 100 → 97.5 %.
    expect(saturation(40)).toBeCloseTo(0.75, 2);
    expect(saturation(60)).toBeGreaterThan(0.89);
    expect(saturation(60)).toBeLessThan(0.92);
    expect(saturation(100)).toBeCloseTo(0.975, 2);
  });

  it('inverts exactly', () => {
    for (const s of [0.05, 0.3, 0.5, 0.75, 0.9, 0.97, 0.995]) {
      expect(saturation(po2FromSaturation(s))).toBeCloseTo(s, 10);
    }
    for (const p of [10, 40, 100, 300]) {
      expect(po2FromContent(o2Content(p))).toBeCloseTo(p, 6);
    }
  });

  it('shifts right with acidosis, hypercapnia and fever (Bohr effect)', () => {
    const exercise = { pH: 7.2, pco2: 60, temperature: 39 };
    expect(p50(exercise)).toBeGreaterThan(33);
    expect(p50({ pH: 7.6, pco2: 25, temperature: 37 })).toBeLessThan(23);
  });

  it('gives ~20 mL O2/dL capacity and a correct slope', () => {
    expect(O2_CAPACITY * 100).toBeCloseTo(20.1, 1);
    const p = 35;
    const numeric = (o2Content(p + 1e-4) - o2Content(p - 1e-4)) / 2e-4;
    expect(o2ContentSlope(p)).toBeCloseTo(numeric, 8);
  });
});
