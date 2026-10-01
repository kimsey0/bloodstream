/**
 * Turns the stylised layout into one smooth 3D curve per circulation
 * segment, joined end to start so that a cell moving from one segment to the
 * next never jumps. Also bakes an arc-length lookup table (positions and
 * frames) that the simulation worker uses to place cells without three.js.
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Circulation, Segment } from '../sim/circulation';
import { Rng } from '../sim/rng';
import { BED_CENTERS, VESSEL_POINTS } from './layout';
import { territory } from './territories';
import { LUT_SAMPLES, LUT_STRIDE } from './lut';

export { LUT_SAMPLES, LUT_STRIDE, samplePath } from './lut';

export interface VesselPaths {
  /** One curve per drawn path. Named vessels have one path; each organ bed's segments have one per strand. */
  curves: CatmullRomCurve3[];
  /** Path → segment index. */
  pathSegment: Int32Array;
  /** Segment → index of its first path. */
  pathBase: Int32Array;
  /** Segment → number of paths (strands). */
  pathCount: Int32Array;
  /** Segment → organ bed id (strands are shared within a bed), or -1 for named vessels. */
  bedOfSegment: Int32Array;
  /** Visual tube radius per path, cm. */
  radius: Float32Array;
  /** paths × LUT_SAMPLES × LUT_STRIDE. */
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

/** Where a strand of each microcirculation part ends, around the strand's capillary anchor P. */
const PART_ORDER = ['art', 'portal', 'glom', 'eff', 'cap', 'ven'] as const;

export function buildPaths(circ: Circulation): VesselPaths {
  const segs = circ.segments;
  const isNamed = (s: Segment) => VESSEL_POINTS[s.id] !== undefined;
  // Own points: real layout for named vessels; a single "hub" near the bed centre for lumped ones,
  // which is where a bed's venules meet a draining vein that has no other inflow.
  const own: Vector3[][] = segs.map((s) => {
    const named = VESSEL_POINTS[s.id];
    if (named) return named.map((p) => new Vector3(...p));
    if (s.kind === 'artery' || s.kind === 'vein' || s.kind === 'chamber') throw new Error(`No layout for ${s.id}`);
    return lumpedPoints(s);
  });

  const bend = (pts: Vector3[], key: string) => {
    const dedup = pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > 0.05);
    if (dedup.length === 1) dedup.push(dedup[0].clone().add(new Vector3(0, 0.05, 0)));
    // Long straight connections get a gentle bend so they read as vessels.
    if (dedup.length === 2 && dedup[0].distanceTo(dedup[1]) > 3) {
      const mid = dedup[0].clone().lerp(dedup[1], 0.5);
      const dir = dedup[1].clone().sub(dedup[0]);
      const b = hashVector(key, 3).cross(dir).normalize().multiplyScalar(Math.min(2, dir.length() * 0.08));
      dedup.splice(1, 0, mid.add(b));
    }
    return dedup;
  };

  // Named vessels: joined end to start with their neighbours.
  const namedPath = new Map<number, Vector3[]>();
  for (const s of segs.filter(isNamed)) {
    const pts = [...own[s.index]];
    if (s.prevIndex.length === 1) pts.unshift(own[s.prevIndex[0]].at(-1)!.clone());
    if (s.nextIndex.length === 1 && segs[s.nextIndex[0]].prevIndex.length > 1) pts.push(own[s.nextIndex[0]][0].clone());
    namedPath.set(s.index, bend(pts, s.id));
  }

  // Organ beds: several strands, each with its capillary loop placed in the tissue's territory.
  const bedIds = new Map<string, number>();
  const bedOfSegment = new Int32Array(segs.length).fill(-1);
  const strands = new Map<string, { anchors: Vector3[]; t: Vector3[]; w: Vector3[]; scale: number }>();
  for (const s of segs) {
    if (isNamed(s)) continue;
    const { bed } = bedOf(s.id);
    if (!bedIds.has(bed)) {
      bedIds.set(bed, bedIds.size);
      const terr = territory(bed);
      const rng = new Rng(hashSeed(bed));
      const anchors = Array.from({ length: terr.strands }, () => terr.sample(rng));
      strands.set(bed, {
        anchors,
        t: anchors.map((_, k) => hashVector(`${bed}#${k}`, 5)),
        w: anchors.map((_, k) => hashVector(`${bed}#${k}`, 6)),
        scale: s.circuit === 'pulmonary' ? 0.8 : 0.45,
      });
    }
    bedOfSegment[s.index] = bedIds.get(bed)!;
  }
  /** End point of strand k of a lumped part. */
  const strandEnd = (s: Segment, k: number): Vector3 => {
    const { bed, part } = bedOf(s.id);
    const st = strands.get(bed)!;
    const P = st.anchors[k];
    const t = st.t[k].clone().multiplyScalar(st.scale);
    const w = st.w[k].clone().multiplyScalar(st.scale);
    switch (part) {
      case 'art':
      case 'portal':
        return P.clone().add(t);
      case 'glom':
        return P.clone().addScaledVector(t, 0.5).addScaledVector(w, 0.5);
      case 'eff':
        return P.clone().addScaledVector(w, 0.6);
      case 'cap':
        return P.clone().sub(t);
      default: {
        // Venules: to the draining vein's start, or to the bed hub if that vein drains only this bed.
        const drain = segs[s.nextIndex[0]];
        if (!isNamed(drain)) throw new Error(`${s.id} drains into another microcirculation`);
        return drain.prevIndex.length > 1 ? own[drain.index][0].clone() : own[s.index].at(-1)!.clone();
      }
    }
  };
  const strandStart = (s: Segment, k: number): Vector3 => {
    const pred = segs[s.prevIndex[0]];
    if (isNamed(pred)) {
      if (s.prevIndex.length > 1) throw new Error(`${s.id}: lumped confluence of named vessels`);
      return namedPath.get(pred.index)!.at(-1)!.clone();
    }
    if (bedOf(pred.id).bed !== bedOf(s.id).bed) throw new Error(`${s.id} is fed by another microcirculation`);
    return strandEnd(pred, k);
  };

  const curves: CatmullRomCurve3[] = [];
  const pathSegment: number[] = [];
  const radius: number[] = [];
  const pathBase = new Int32Array(segs.length);
  const pathCount = new Int32Array(segs.length);
  for (const s of segs) {
    pathBase[s.index] = curves.length;
    if (isNamed(s)) {
      curves.push(new CatmullRomCurve3(namedPath.get(s.index)!, false, 'centripetal'));
      pathSegment.push(s.index);
      radius.push(tubeRadius(s));
      pathCount[s.index] = 1;
      continue;
    }
    const { bed, part } = bedOf(s.id);
    if (!(PART_ORDER as readonly string[]).includes(part)) throw new Error(`Unknown microcirculation part ${s.id}`);
    const st = strands.get(bed)!;
    for (let k = 0; k < st.anchors.length; k++) {
      const a = strandStart(s, k);
      const b = strandEnd(s, k);
      const pts =
        part === 'cap'
          ? [a, st.anchors[k].clone().addScaledVector(st.w[k], st.scale * 0.7), b]
          : bend([a, b], `${s.id}#${k}`);
      curves.push(new CatmullRomCurve3(pts, false, 'centripetal'));
      pathSegment.push(s.index);
      radius.push(tubeRadius(s));
    }
    pathCount[s.index] = st.anchors.length;
  }

  const lut = new Float32Array(curves.length * LUT_SAMPLES * LUT_STRIDE);
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
  return {
    curves,
    pathSegment: new Int32Array(pathSegment),
    pathBase,
    pathCount,
    bedOfSegment,
    radius: new Float32Array(radius),
    lut,
  };
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
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
