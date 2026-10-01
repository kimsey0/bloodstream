import { describe, expect, it } from 'vitest';
import { torsoRadius, TORSO_DEPTH } from '../src/anatomy/bodyShape';
import { buildPaths, LUT_SAMPLES, samplePath } from '../src/anatomy/paths';
import { Circulation } from '../src/sim/circulation';

const circ = new Circulation();
const paths = buildPaths(circ);
const strandsOf = (seg: number) => Array.from({ length: paths.pathCount[seg] }, (_, k) => paths.pathBase[seg] + k);

describe('3D vessel paths', () => {
  it('join every segment to each of its successors without a gap', () => {
    for (const s of circ.segments) {
      for (const j of s.nextIndex) {
        const sameBed = paths.bedOfSegment[s.index] >= 0 && paths.bedOfSegment[s.index] === paths.bedOfSegment[j];
        for (const a of strandsOf(s.index)) {
          // Within a bed a cell keeps its strand; across beds any strand may follow any other.
          const targets = sameBed ? [paths.pathBase[j] + (a - paths.pathBase[s.index])] : strandsOf(j);
          for (const b of targets) {
            const gap = paths.curves[a].getPoint(1).distanceTo(paths.curves[b].getPoint(0));
            expect(gap, `${s.id} → ${circ.segments[j].id}`).toBeLessThan(0.1);
          }
        }
      }
    }
  });

  it('give every segment of a bed the same number of strands', () => {
    for (const s of circ.segments) {
      for (const j of s.nextIndex) {
        if (paths.bedOfSegment[s.index] >= 0 && paths.bedOfSegment[s.index] === paths.bedOfSegment[j]) {
          expect(paths.pathCount[j]).toBe(paths.pathCount[s.index]);
        }
      }
    }
  });

  it('place skin capillaries just under the skin, spread over the region', () => {
    const cap = circ.get('trunk.skin.cap');
    const ys: number[] = [];
    for (const p of strandsOf(cap.index)) {
      const m = paths.curves[p].getPoint(0.5);
      ys.push(m.y);
      // Distance from the torso axis relative to the local torso radius (elliptical cross-section).
      const r = Math.hypot(m.x, m.z / TORSO_DEPTH) / torsoRadius(m.y);
      expect(r).toBeGreaterThan(0.85);
      expect(r).toBeLessThan(1.1);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(25);
  });

  it('stay inside a 175 cm body', () => {
    for (const c of paths.curves) {
      for (const p of c.getPoints(8)) {
        expect(p.y).toBeGreaterThan(-1);
        expect(p.y).toBeLessThan(176);
        expect(Math.abs(p.x)).toBeLessThan(40);
      }
    }
  });

  it('sample the lookup table at the curve ends', () => {
    const out = new Float32Array(3);
    const i = paths.pathBase[circ.get('aorta_thoracic').index];
    samplePath(paths.lut, paths.radius, i, 1, 0, 0, out, 0);
    expect(out[1]).toBeCloseTo(paths.curves[i].getPoint(1).y, 3);
    expect(paths.lut.length).toBe(paths.curves.length * LUT_SAMPLES * 9);
  });
});
