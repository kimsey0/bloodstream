import { describe, expect, it } from 'vitest';
import {
  COLOR_SCALES,
  deltaEOk,
  linearSrgbToOklab,
  saturationColorLinear,
  simulateCvd,
  type ColorScale,
  type Cvd,
} from '../src/color/saturation';

const visions: (Cvd | 'normal')[] = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const seen = (s: number, v: Cvd | 'normal', scale: ColorScale) => {
  const c = saturationColorLinear(s, scale);
  return v === 'normal' ? c : simulateCvd(c, v);
};

describe.each(COLOR_SCALES)('%s saturation colour scale', (scale) => {
  it('increases monotonically in lightness, so it also reads in greyscale', () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const L = linearSrgbToOklab(saturationColorLinear(s, scale))[0];
      expect(L).toBeGreaterThan(prev);
      prev = L;
    }
  });

  it('keeps the five haemoglobin steps distinguishable under every colour-vision type', () => {
    for (const v of visions) {
      for (let n = 0; n < 4; n++) {
        expect(deltaEOk(seen(n / 4, v, scale), seen((n + 1) / 4, v, scale)), `${v} ${n}→${n + 1}`).toBeGreaterThan(0.06);
      }
    }
  });

  it('separates arterial (97 %) from mixed venous (73 %) blood for common deficiencies', () => {
    for (const v of visions) {
      expect(deltaEOk(seen(0.97, v, scale), seen(0.73, v, scale)), v).toBeGreaterThan(0.08);
    }
  });
});

describe('blue-red scale', () => {
  it('is red when saturated and blue when desaturated', () => {
    const [r1, , b1] = saturationColorLinear(1, 'blue-red');
    const [r0, , b0] = saturationColorLinear(0, 'blue-red');
    expect(r1).toBeGreaterThan(b1 * 3);
    expect(b0).toBeGreaterThan(r0 * 2);
  });
});

describe('natural scale', () => {
  it('is red at every saturation, as real blood is', () => {
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const [r, g, b] = saturationColorLinear(s, 'natural');
      expect(r, `${s}`).toBeGreaterThan(2 * g);
      expect(r, `${s}`).toBeGreaterThan(2 * b);
    }
  });

  it('is bright scarlet when saturated and dark when desaturated', () => {
    const L = (s: number) => linearSrgbToOklab(saturationColorLinear(s, 'natural'))[0];
    expect(L(1)).toBeGreaterThan(0.6);
    expect(L(0.2)).toBeLessThan(0.32);
  });

  it('is no darker than the blue-red scale, so desaturated cells stay visible on the dark background', () => {
    const L = (scale: ColorScale) => linearSrgbToOklab(saturationColorLinear(0, scale))[0];
    expect(L('natural')).toBeGreaterThanOrEqual(L('blue-red') - 1e-6);
  });
});
