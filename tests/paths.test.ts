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
            // A strand may branch off its feeding vessel, or join its draining vein, part-way along.
            const leave = paths.pathStart[b] >= 0 ? paths.curves[a].getPointAt(paths.pathStart[b]) : paths.curves[a].getPoint(1);
            const enter = paths.pathEnd[a] >= 0 ? paths.curves[b].getPointAt(paths.pathEnd[a]) : paths.curves[b].getPoint(0);
            const gap = leave.distanceTo(enter);
            expect(gap, `${s.id} → ${circ.segments[j].id}`).toBeLessThan(0.1);
          }
        }
      }
    }
  });

  it('branch off along the feeding artery in limbs, and from the hilum in organs', () => {
    const starts = (id: string) => strandsOf(circ.get(id).index).map((p) => paths.pathStart[p]);
    const thigh = starts('leg_L.thigh.muscle.art');
    expect(Math.max(...thigh) - Math.min(...thigh)).toBeGreaterThan(0.3);
    expect(new Set(starts('kidney_L.art'))).toEqual(new Set([1]));
    const ends = strandsOf(circ.get('kidney_L.ven').index).map((p) => paths.pathEnd[p]);
    expect(new Set(ends)).toEqual(new Set([0]));
  });

  it('share branches between strands, so each bed forms a tree', () => {
    const strands = strandsOf(circ.get('lung_L.art').index).map((p) => paths.curves[p].points);
    // Strands of one bed share their first branch points.
    const shared = strands.filter((pts) => strands.some((o) => o !== pts && o[1].distanceTo(pts[1]) < 1e-6 && o.at(-1)!.distanceTo(pts.at(-1)!) > 0.1));
    expect(shared.length).toBe(strands.length);
  });

  it('attach layout-only branches to the vessel they leave or join', () => {
    expect(paths.branches.length).toBeGreaterThan(20);
    const vessels = [
      ...circ.segments.filter((s) => paths.bedOfSegment[s.index] < 0).map((s) => paths.curves[paths.pathBase[s.index]]),
      ...paths.branches.map((b) => b.curve),
    ].map((c) => c.getSpacedPoints(400));
    for (const b of paths.branches) {
      const ends = [b.curve.getPoint(0), b.curve.getPoint(1)];
      const others = vessels.filter((_, i) => i !== vessels.length - paths.branches.length + paths.branches.indexOf(b));
      const gap = Math.min(...ends.flatMap((e) => others.map((pts) => Math.min(...pts.map((q) => q.distanceTo(e))))));
      expect(gap).toBeLessThan(0.3);
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
