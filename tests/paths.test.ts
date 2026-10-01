import { describe, expect, it } from 'vitest';
import { buildPaths, LUT_SAMPLES, samplePath } from '../src/anatomy/paths';
import { Circulation } from '../src/sim/circulation';

const circ = new Circulation();
const paths = buildPaths(circ);

describe('3D vessel paths', () => {
  it('join every segment to each of its successors without a gap', () => {
    for (const s of circ.segments) {
      const end = paths.curves[s.index].getPoint(1);
      for (const j of s.nextIndex) {
        const start = paths.curves[j].getPoint(0);
        expect(end.distanceTo(start), `${s.id} → ${circ.segments[j].id}`).toBeLessThan(0.1);
      }
    }
  });

  it('stay inside a 175 cm body', () => {
    for (const c of paths.curves) {
      for (const p of c.getPoints(8)) {
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(175);
        expect(Math.abs(p.x)).toBeLessThan(40);
      }
    }
  });

  it('sample the lookup table at the curve ends', () => {
    const out = new Float32Array(3);
    const i = circ.get('aorta_thoracic').index;
    samplePath(paths.lut, paths.radius, i, 1, 0, 0, out, 0);
    const end = paths.curves[i].getPoint(1);
    expect(out[1]).toBeCloseTo(end.y, 3);
    expect(paths.lut.length).toBe(circ.segments.length * LUT_SAMPLES * 9);
  });
});
