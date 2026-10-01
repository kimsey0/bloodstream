import { describe, expect, it } from 'vitest';
import {
  deltaEOk,
  linearSrgbToOklab,
  saturationColorLinear,
  simulateCvd,
  type Cvd,
} from '../src/color/saturation';

const visions: (Cvd | 'normal')[] = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const seen = (s: number, v: Cvd | 'normal') => {
  const c = saturationColorLinear(s);
  return v === 'normal' ? c : simulateCvd(c, v);
};

describe('saturation colour scale', () => {
  it('increases monotonically in lightness, so it also reads in greyscale', () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const L = linearSrgbToOklab(saturationColorLinear(s))[0];
      expect(L).toBeGreaterThan(prev);
      prev = L;
    }
  });

  it('keeps the five haemoglobin steps distinguishable under every colour-vision type', () => {
    for (const v of visions) {
      for (let n = 0; n < 4; n++) {
        expect(deltaEOk(seen(n / 4, v), seen((n + 1) / 4, v)), `${v} ${n}→${n + 1}`).toBeGreaterThan(0.06);
      }
    }
  });

  it('separates arterial (97 %) from mixed venous (73 %) blood for common deficiencies', () => {
    for (const v of visions) {
      expect(deltaEOk(seen(0.97, v), seen(0.73, v)), v).toBeGreaterThan(0.08);
    }
  });

  it('is red when saturated and blue when desaturated', () => {
    const [r1, , b1] = saturationColorLinear(1);
    const [r0, , b0] = saturationColorLinear(0);
    expect(r1).toBeGreaterThan(b1 * 3);
    expect(b0).toBeGreaterThan(r0 * 2);
  });
});
