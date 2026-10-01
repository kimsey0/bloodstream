/**
 * Procedural capillary networks for the microscope view, in micrometres.
 *
 * Each network has one terminal arteriole, N capillaries and one collecting
 * venule. Every capillary is fitted so its path length equals the modelled
 * capillary length of that bed. Every capillary also defines a "route"
 * (arteriole → capillary → venule) that local cells travel along.
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import { Rng } from '../sim/rng';
import type { MicroBed } from './beds';

export interface Polyline {
  /** n × 3 positions. */
  pts: Float32Array;
  /** Cumulative arc length at each point. */
  cum: Float32Array;
  length: number;
}

export interface MicroRoute {
  line: Polyline;
  /** Arc-length positions where the capillary starts and ends. */
  capStart: number;
  capEnd: number;
}

export type ContextShape =
  | { kind: 'cylinder'; from: Vector3; to: Vector3; radius: number }
  | { kind: 'sphere'; center: Vector3; radius: number }
  | { kind: 'slab'; center: Vector3; size: Vector3 };

export interface MicroNetwork {
  arteriole: Vector3[];
  venule: Vector3[];
  capillaries: Vector3[][];
  routes: MicroRoute[];
  context: ContextShape[];
  capRadius: number;
  artRadius: number;
  venRadius: number;
  center: Vector3;
  /** Radius of a sphere that contains the network. */
  extent: number;
  /** Half the bounding-box size along each axis. */
  halfSize: Vector3;
}

export const ARTERIOLE_RADIUS = 8;
export const VENULE_RADIUS = 11;

export function polyline(points: Vector3[]): Polyline {
  const pts = new Float32Array(points.length * 3);
  const cum = new Float32Array(points.length);
  let acc = 0;
  points.forEach((p, i) => {
    pts.set([p.x, p.y, p.z], i * 3);
    if (i > 0) acc += p.distanceTo(points[i - 1]);
    cum[i] = acc;
  });
  return { pts, cum, length: acc };
}

/** Position (and unit tangent) at arc length s. */
export function sampleLine(line: Polyline, s: number, out: Vector3, tangent?: Vector3): Vector3 {
  const { pts, cum } = line;
  const n = cum.length;
  const x = Math.min(Math.max(s, 0), line.length);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = (x - cum[lo]) / span;
  const a = lo * 3;
  const b = hi * 3;
  out.set(pts[a] + (pts[b] - pts[a]) * t, pts[a + 1] + (pts[b + 1] - pts[a + 1]) * t, pts[a + 2] + (pts[b + 2] - pts[a + 2]) * t);
  if (tangent) tangent.set(pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]).normalize();
  return out;
}

function straight(a: Vector3, b: Vector3, step = 4): Vector3[] {
  const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
  return Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
}

function smooth(ctrl: Vector3[], step = 3): Vector3[] {
  const curve = new CatmullRomCurve3(ctrl, false, 'centripetal');
  return curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / step)));
}

function arcLength(pts: Vector3[]): number {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) acc += pts[i].distanceTo(pts[i - 1]);
  return acc;
}

/** Find the parameter p so that the smoothed path made by gen(p) has length L. */
function fitLength(gen: (p: number) => Vector3[], L: number, lo: number, hi: number): Vector3[] {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (arcLength(smooth(gen(mid))) < L) lo = mid;
    else hi = mid;
  }
  return smooth(gen((lo + hi) / 2));
}

/** Smooth 1D noise: a few random sinusoids, deterministic per capillary. */
function noise(rng: Rng) {
  const waves = Array.from({ length: 3 }, (_, i) => ({ f: (i + 1) * (0.7 + rng.next()), ph: rng.next() * 6.283, a: 1 / (i + 1) }));
  return (t: number) => waves.reduce((acc, w) => acc + w.a * Math.sin(w.f * t * 6.283 + w.ph), 0) / 1.6;
}

interface Layout {
  arterialAxis: [Vector3, Vector3];
  venousAxis: [Vector3, Vector3];
  capillaries: Vector3[][];
  context: ContextShape[];
}

function fibers(bed: MicroBed, L: number, rc: number): Layout {
  const fr = bed.fiberRadius ?? 20;
  const pitch = 2 * fr + 2 * rc + 3;
  // Capillaries sit in the corners between fibres; pick a fibre grid with enough corners.
  let nz = 2;
  while ((nz - 1) * nz < bed.capillaries) nz++;
  const ny = nz + 1;
  const corners: [number, number][] = [];
  for (let i = 0; i < ny - 1; i++) for (let j = 0; j < nz - 1; j++) corners.push([(i + 0.5 - (ny - 1) / 2) * pitch, (j + 0.5 - (nz - 1) / 2) * pitch]);
  corners.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const chosen = corners.slice(0, bed.capillaries).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const margin = 18;
  let W = 0;
  const capillaries = chosen.map(([y, z], k) => {
    const n = noise(new Rng(100 + k));
    const gen = (w: number) => {
      const xa = -w / 2 - margin;
      const pts = [new Vector3(xa, y, 0), new Vector3(-w / 2, y, z)];
      for (let j = 1; j < 8; j++) {
        const x = -w / 2 + (w * j) / 8;
        pts.push(new Vector3(x, y + 1.5 * n(j / 8), z + 1.5 * n(j / 8 + 0.37)));
      }
      pts.push(new Vector3(w / 2, y, z), new Vector3(w / 2 + margin, y, 0));
      return pts;
    };
    const path = fitLength(gen, L, 10, L);
    W = Math.max(W, path.at(-1)!.x * 2 - 2 * margin);
    return path;
  });
  const yMax = Math.max(...chosen.map((c) => Math.abs(c[0]))) + pitch;
  const context: ContextShape[] = [];
  for (let i = 0; i < ny; i++) {
    for (let j = 0; j < nz; j++) {
      const y = (i - (ny - 1) / 2) * pitch;
      const z = (j - (nz - 1) / 2) * pitch;
      context.push({ kind: 'cylinder', from: new Vector3(-W / 2, y, z), to: new Vector3(W / 2, y, z), radius: fr });
    }
  }
  const xa = -W / 2 - margin;
  const xv = W / 2 + margin;
  return {
    arterialAxis: [new Vector3(xa, -yMax - 40, 0), new Vector3(xa, yMax, 0)],
    venousAxis: [new Vector3(xv, yMax, 0), new Vector3(xv, -yMax - 40, 0)],
    capillaries,
    context,
  };
}

function alveoli(bed: MicroBed, L: number, rc: number): Layout {
  const W = L * 0.6;
  const pitchY = 12;
  const H = (bed.capillaries - 1) * pitchY;
  const capillaries = Array.from({ length: bed.capillaries }, (_, k) => {
    const y0 = -H / 2 + k * pitchY;
    const ny = noise(new Rng(200 + k));
    const nz = noise(new Rng(300 + k));
    const gen = (a: number) => {
      const pts: Vector3[] = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        const env = Math.sin(Math.PI * t);
        pts.push(new Vector3(-W / 2 + W * t, y0 + a * env * ny(t), 2 * env * nz(t)));
      }
      return pts;
    };
    return fitLength(gen, L, 0, L);
  });
  // Air sacs on both sides of the capillary sheet.
  const R = 80;
  const context: ContextShape[] = [];
  for (const side of [-1, 1]) {
    for (let x = -W / 2; x <= W / 2 + 1; x += 2 * R + 10) {
      for (let y = -H / 2 - 20; y <= H / 2 + 21; y += 2 * R + 10) {
        context.push({ kind: 'sphere', center: new Vector3(x + side * 30, y, side * (R + rc + 1.5)), radius: R });
      }
    }
  }
  const yTop = H / 2 + 60;
  return {
    arterialAxis: [new Vector3(-W / 2, -H / 2 - 60, 0), new Vector3(-W / 2, yTop, 0)],
    venousAxis: [new Vector3(W / 2, yTop, 0), new Vector3(W / 2, -H / 2 - 60, 0)],
    capillaries,
    context,
  };
}

function tortuous(bed: MicroBed, L: number): Layout {
  const W = L * 0.45;
  const pitchY = 26;
  const H = (bed.capillaries - 1) * pitchY;
  const capillaries = Array.from({ length: bed.capillaries }, (_, k) => {
    const y0 = -H / 2 + k * pitchY;
    const ny = noise(new Rng(400 + k));
    const nz = noise(new Rng(500 + k));
    const gen = (a: number) => {
      const pts: Vector3[] = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        const env = Math.sin(Math.PI * t);
        pts.push(new Vector3(-W / 2 + W * t, y0 + a * env * ny(t), 1.3 * a * env * nz(t)));
      }
      return pts;
    };
    return fitLength(gen, L, 0, L);
  });
  return {
    arterialAxis: [new Vector3(-W / 2, -H / 2 - 60, 0), new Vector3(-W / 2, H / 2 + 40, 0)],
    venousAxis: [new Vector3(W / 2, H / 2 + 40, 0), new Vector3(W / 2, -H / 2 - 60, 0)],
    capillaries,
    context: [],
  };
}

function hairpin(bed: MicroBed, L: number): Layout {
  const pitchX = 45;
  const X = (bed.capillaries - 1) * pitchX;
  let top = 0;
  const capillaries = Array.from({ length: bed.capillaries }, (_, k) => {
    const x = -X / 2 + k * pitchX;
    const n = noise(new Rng(600 + k));
    const gen = (h: number) => [
      new Vector3(x - 6, 0, -12),
      new Vector3(x - 5 + 2 * n(0.2), h * 0.35, -6),
      new Vector3(x - 4 + 2 * n(0.4), h * 0.75, -3),
      new Vector3(x, h, 0),
      new Vector3(x + 4 + 2 * n(0.6), h * 0.75, 3),
      new Vector3(x + 5 + 2 * n(0.8), h * 0.35, 6),
      new Vector3(x + 6, 0, 12),
    ];
    const path = fitLength(gen, L, 5, L);
    top = Math.max(top, ...path.map((p) => p.y));
    return path;
  });
  return {
    arterialAxis: [new Vector3(-X / 2 - 60, 0, -12), new Vector3(X / 2 + 30, 0, -12)],
    venousAxis: [new Vector3(X / 2 + 30, 0, 12), new Vector3(-X / 2 - 60, 0, 12)],
    capillaries,
    context: [{ kind: 'slab', center: new Vector3(0, top + 30, 0), size: new Vector3(X + 120, 40, 90) }],
  };
}

/** Closest point to p on the infinite line through a, b. */
function projectOnAxis(p: Vector3, [a, b]: [Vector3, Vector3]): Vector3 {
  const d = b.clone().sub(a).normalize();
  return a.clone().addScaledVector(d, p.clone().sub(a).dot(d));
}

export function buildNetwork(bed: MicroBed, capillaryLengthUm: number, capillaryDiameterUm: number): MicroNetwork {
  const rc = capillaryDiameterUm / 2;
  const L = capillaryLengthUm;
  const layout =
    bed.style === 'fibers' ? fibers(bed, L, rc) : bed.style === 'alveoli' ? alveoli(bed, L, rc) : bed.style === 'hairpin' ? hairpin(bed, L) : tortuous(bed, L);

  const [aStart] = layout.arterialAxis;
  const [, vEnd] = layout.venousAxis;
  const routes = layout.capillaries.map((cap) => {
    // Join the capillary to the vessel axes where it meets them.
    const a = projectOnAxis(cap[0], layout.arterialAxis);
    const v = projectOnAxis(cap.at(-1)!, layout.venousAxis);
    const art = straight(aStart, a);
    const capPts = [a, ...cap, v];
    const ven = straight(v, vEnd);
    const all = [...art, ...capPts.slice(1), ...ven.slice(1)];
    const line = polyline(all);
    const capStart = arcLength(art) + a.distanceTo(cap[0]);
    const capEnd = capStart + arcLength(cap);
    return { line, capStart, capEnd };
  });

  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  for (const c of layout.capillaries) for (const p of c) {
    box.min.min(p);
    box.max.max(p);
  }
  for (const p of [...layout.arterialAxis, ...layout.venousAxis]) {
    box.min.min(p);
    box.max.max(p);
  }
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  return {
    arteriole: straight(layout.arterialAxis[0], layout.arterialAxis[1], 10),
    venule: straight(layout.venousAxis[0], layout.venousAxis[1], 10),
    capillaries: layout.capillaries,
    routes,
    context: layout.context,
    capRadius: rc,
    artRadius: ARTERIOLE_RADIUS,
    venRadius: VENULE_RADIUS,
    center,
    extent: box.max.distanceTo(box.min) / 2,
    halfSize: box.max.clone().sub(box.min).multiplyScalar(0.5),
  };
}
