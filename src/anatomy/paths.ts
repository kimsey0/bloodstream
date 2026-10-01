/**
 * Turns the stylised layout into one smooth 3D curve per circulation
 * segment, joined end to start so that a cell moving from one segment to the
 * next never jumps. Also bakes an arc-length lookup table (positions and
 * frames) that the simulation worker uses to place cells without three.js.
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Circulation, Segment } from '../sim/circulation';
import { BED_CENTERS, VESSEL_POINTS } from './layout';
import { LUT_SAMPLES, LUT_STRIDE } from './lut';

export { LUT_SAMPLES, LUT_STRIDE, samplePath } from './lut';

export interface VesselPaths {
  curves: CatmullRomCurve3[];
  /** Visual tube radius per segment, cm. */
  radius: Float32Array;
  /** segments × LUT_SAMPLES × LUT_STRIDE. */
  lut: Float32Array;
}

/** Deterministic pseudo-random unit vector from a string. */
function hashVector(key: string, salt: number): Vector3 {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const r = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const z = 2 * r() - 1;
  const t = 2 * Math.PI * r();
  const s = Math.sqrt(1 - z * z);
  return new Vector3(s * Math.cos(t), s * Math.sin(t), z);
}

function bedOf(id: string): { bed: string; part: string } {
  const i = id.lastIndexOf('.');
  return { bed: id.slice(0, i), part: id.slice(i + 1) };
}

/** Own control points of a lumped (microcirculation) segment. */
function lumpedPoints(s: Segment): Vector3[] {
  const { bed, part } = bedOf(s.id);
  const c = BED_CENTERS[bed];
  if (!c) throw new Error(`No bed centre for ${s.id}`);
  const center = new Vector3(...c);
  const scale = s.circuit === 'pulmonary' ? 2.5 : 1.2;
  const u = hashVector(bed, 1).multiplyScalar(scale);
  const w = hashVector(bed, 2).multiplyScalar(scale);
  const at = (...vs: [Vector3, number][]) => vs.reduce((p, [v, k]) => p.addScaledVector(v, k), center.clone());
  switch (part) {
    case 'art':
      return [at([u, 1])];
    case 'portal':
      return [at([u, 0.6], [w, -0.8])];
    case 'glom':
      return [at([u, 1], [w, 0.6]), at([u, 0.4], [w, 1])];
    case 'eff':
      return [at([w, 0.5])];
    case 'cap':
      return [at([w, 0.5]), at([u, -1])];
    case 'ven':
      return [at([u, -1.3], [w, -0.2]), at([u, -1.9], [w, -0.5])];
    default:
      throw new Error(`Unknown microcirculation part ${s.id}`);
  }
}

export function buildPaths(circ: Circulation): VesselPaths {
  const segs = circ.segments;
  const own: Vector3[][] = segs.map((s) => {
    const named = VESSEL_POINTS[s.id];
    if (named) return named.map((p) => new Vector3(...p));
    if (s.kind === 'artery' || s.kind === 'vein' || s.kind === 'chamber') throw new Error(`No layout for ${s.id}`);
    return lumpedPoints(s);
  });

  const paths = segs.map((s, i) => {
    const pts = [...own[i]];
    // A segment with a single predecessor starts where that predecessor's own points end.
    if (s.prevIndex.length === 1) pts.unshift(own[s.prevIndex[0]].at(-1)!.clone());
    // A segment feeding a confluence ends at the confluence's first point.
    if (s.nextIndex.length === 1 && segs[s.nextIndex[0]].prevIndex.length > 1) pts.push(own[s.nextIndex[0]][0].clone());
    const dedup = pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > 0.05);
    if (dedup.length < 2) throw new Error(`Degenerate path for ${s.id}`);
    // Long straight connections get a gentle bend so lumped vessels read as vessels.
    if (dedup.length === 2 && dedup[0].distanceTo(dedup[1]) > 3) {
      const mid = dedup[0].clone().lerp(dedup[1], 0.5);
      const dir = dedup[1].clone().sub(dedup[0]);
      const bend = hashVector(s.id, 3).cross(dir).normalize().multiplyScalar(Math.min(2, dir.length() * 0.08));
      dedup.splice(1, 0, mid.add(bend));
    }
    return dedup;
  });

  const curves = paths.map((p) => new CatmullRomCurve3(p, false, 'centripetal'));
  const radius = new Float32Array(segs.map((s) => tubeRadius(s)));
  const lut = new Float32Array(segs.length * LUT_SAMPLES * LUT_STRIDE);
  const pt = new Vector3();
  curves.forEach((curve, i) => {
    const frames = curve.computeFrenetFrames(LUT_SAMPLES - 1, false);
    for (let k = 0; k < LUT_SAMPLES; k++) {
      curve.getPointAt(k / (LUT_SAMPLES - 1), pt);
      const o = (i * LUT_SAMPLES + k) * LUT_STRIDE;
      lut.set([pt.x, pt.y, pt.z], o);
      const n = frames.normals[k];
      const b = frames.binormals[k];
      lut.set([n.x, n.y, n.z, b.x, b.y, b.z], o + 3);
    }
  });
  return { curves, radius, lut };
}

function tubeRadius(s: Segment): number {
  switch (s.kind) {
    case 'chamber':
      return 1.4;
    case 'artery':
    case 'vein':
      return Math.max(0.15, s.diameter / 20);
    case 'arteriole':
      return 0.1;
    case 'capillary':
      return 0.07;
    case 'venule':
      return 0.13;
  }
}
