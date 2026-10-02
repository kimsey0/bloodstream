/**
 * Turns the stylised layout into one smooth 3D curve per circulation
 * segment, joined so that a cell moving from one segment to the next never
 * jumps. Also bakes an arc-length lookup table (positions and frames) that
 * the simulation worker uses to place cells without three.js.
 *
 * Organ beds are drawn as several strands. Each strand's arterioles are a
 * chain from a branch point on the feeding artery (or one of its layout-only
 * side branches) through shared branch points to its capillary loop, so a
 * bed's strands form a tree; its venules form a second tree into the
 * draining vein. A strand can leave its artery part-way along: the worker
 * then moves a cell bound for it only that far along the artery (see
 * `pathStart`/`pathEnd`).
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Circulation, Segment } from '../sim/circulation';
import { Rng } from '../sim/rng';
import { BRANCHES, VESSEL_POINTS } from './layout';
import { territory, type Branching } from './territories';
import { LUT_SAMPLES, LUT_STRIDE } from './lut';

export { LUT_SAMPLES, LUT_STRIDE, samplePath } from './lut';

/** A layout-only branch vessel, drawn as a tube coloured like the named vessel it leaves or joins. */
export interface BranchTube {
  curve: CatmullRomCurve3;
  radius: number;
  /** Named vessel whose blood colours it, and the fraction along that vessel's profile. */
  segment: number;
  at: number;
}

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
  /** Path → fraction along the feeding named vessel's path where it branches off, or -1. */
  pathStart: Float32Array;
  /** Path → fraction along the draining named vessel's path where it joins, or -1. */
  pathEnd: Float32Array;
  /** Visual tube radius per path, cm. */
  radius: Float32Array;
  /** paths × LUT_SAMPLES × LUT_STRIDE. */
  lut: Float32Array;
  branches: BranchTube[];
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

const PART_ORDER = ['art', 'portal', 'glom', 'eff', 'cap', 'ven'] as const;

/** Points closer than this are merged, cm. */
const MIN_GAP = 0.05;
/** Samples per vessel for nearest-point searches. */
const TRUNK_SAMPLES = 128;
/** How far from a branch point towards its leaves the next branch point sits. */
const NODE_STEP = 0.5;
/** How much a branch keeps the heading of the vessel it leaves, so branches leave at acute angles. */
const HEADING = 0.3;
/** Spacing of points copied from a vessel into a strand that runs along it, cm. */
const ALONG_STEP = 2.5;
/** Default tube radius of layout-only branches, cm. */
const BRANCH_RADIUS = 0.16;

/** A vessel that strands can branch from: a named vessel, or a layout branch hanging off one. */
interface Trunk {
  id: string;
  curve: CatmullRomCurve3;
  samples: Vector3[];
  /** The vessel a layout branch leaves (artery) or joins (vein), and where along it. */
  parent?: Trunk;
  attach: number;
  /** True for layout branches that carry blood away from their parent (arteries). */
  outward: boolean;
}

function makeTrunk(id: string, pts: Vector3[], parent?: Trunk, attach = 0, outward = true): Trunk {
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const samples = Array.from({ length: TRUNK_SAMPLES + 1 }, (_, i) => curve.getPointAt(i / TRUNK_SAMPLES));
  return { id, curve, samples, parent, attach, outward };
}

/** Fraction along a trunk of its point nearest p, within [lo, hi]. */
function nearest(t: Trunk, p: Vector3, lo = 0, hi = 1): { s: number; d: number } {
  let best = { s: lo, d: Infinity };
  for (let i = Math.ceil(lo * TRUNK_SAMPLES); i <= Math.floor(hi * TRUNK_SAMPLES); i++) {
    const d = t.samples[i].distanceToSquared(p);
    if (d < best.d) best = { s: i / TRUNK_SAMPLES, d };
  }
  if (best.d === Infinity) best = { s: lo, d: t.curve.getPointAt(lo).distanceToSquared(p) };
  return best;
}

/** Points along a curve from fraction a to b, about ALONG_STEP apart. */
function along(curve: CatmullRomCurve3, a: number, b: number): Vector3[] {
  const n = Math.max(1, Math.ceil((Math.abs(b - a) * curve.getLength()) / ALONG_STEP));
  return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(a + ((b - a) * i) / n));
}

/** The named vessel a trunk ultimately leaves or joins. */
const rootOf = (t: Trunk): Trunk => (t.parent ? rootOf(t.parent) : t);

/**
 * Route between the named vessel and point s on a trunk, ordered from the named vessel to the
 * trunk, with the fraction along the named vessel where it starts.
 */
function route(t: Trunk, s: number): { pts: Vector3[]; at: number } {
  if (!t.parent) return { pts: [t.curve.getPointAt(s)], at: s };
  const up = route(t.parent, t.attach);
  // Arteries are walked from where they leave their parent; veins back from where they join it.
  const own = t.outward ? along(t.curve, 0, s) : along(t.curve, 1, s);
  return { pts: [...up.pts, ...own.slice(1)], at: up.at };
}

function centroid(pts: Vector3[]): Vector3 {
  return pts.reduce((a, p) => a.add(p), new Vector3()).divideScalar(pts.length);
}

/** Split leaves in two halves along their widest axis. */
function bisect(idx: number[], leaves: Vector3[]): [number[], number[]] {
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const i of idx) {
    lo.min(leaves[i]);
    hi.max(leaves[i]);
  }
  const ext = hi.sub(lo);
  const axis = ext.x >= ext.y && ext.x >= ext.z ? 'x' : ext.y >= ext.z ? 'y' : 'z';
  const sorted = [...idx].sort((a, b) => leaves[a][axis] - leaves[b][axis]);
  const h = Math.ceil(sorted.length / 2);
  return [sorted.slice(0, h), sorted.slice(h)];
}

/**
 * Binary tree from `chain`'s last point to the leaves: each branch point sits part-way towards
 * the centroid of the leaves below it (nudged along the current `heading`), so strands share
 * their first stretches.
 */
function grow(chain: Vector3[], heading: Vector3, idx: number[], leaves: Vector3[], out: Vector3[][], surface?: (p: Vector3) => Vector3): void {
  if (idx.length === 1) {
    out[idx[0]] = chain;
    return;
  }
  const from = chain.at(-1)!;
  const c = centroid(idx.map((i) => leaves[i]));
  let node = from.clone().lerp(c, NODE_STEP).addScaledVector(heading, from.distanceTo(c) * HEADING);
  if (surface) node = surface(node);
  const next = node.clone().sub(from).normalize();
  for (const half of bisect(idx, leaves)) grow([...chain, node], next, half, leaves, out, surface);
}

interface Group {
  trunk: Trunk;
  s: number;
  members: number[];
}

/**
 * Chains from the named vessel to each leaf (excluding the leaf), and where each leaves the
 * named vessel. Leaves are grouped by where they lie along the candidate trunks; each group
 * gets one branch, which then divides.
 */
function chains(leaves: Vector3[], trunks: Trunk[], br: Branching, artery: boolean, key: string): { pts: Vector3[][]; at: number[] } {
  const n = leaves.length;
  const out: Vector3[][] = new Array(n);
  const at = new Array<number>(n);
  const end = artery ? 1 : 0;
  // Layout branches are only worth taking once clear of the vessel they leave or join.
  const range = (t: Trunk): [number, number] => (br.hilum ? [end, end] : !t.parent ? [0, 1] : t.outward ? [0.15, 1] : [0, 0.85]);
  const size = br.hilum ? n : (br.groupSize ?? 4);

  const groups: Group[] = [];
  if (br.arcade) {
    // Fan around the bed's centre, so neighbouring groups can be joined in arcades.
    const c = centroid(leaves);
    const angle = (i: number) => Math.atan2(leaves[i].y - c.y, leaves[i].x - c.x);
    const order = leaves.map((_, i) => i).sort((a, b) => angle(a) - angle(b));
    for (let g = 0; g < Math.ceil(n / size); g++) {
      const members = order.slice(Math.round((g * n) / Math.ceil(n / size)), Math.round(((g + 1) * n) / Math.ceil(n / size)));
      const cm = centroid(members.map((i) => leaves[i]));
      let best: Group & { d: number } = { trunk: trunks[0], s: 0, members, d: Infinity };
      for (const t of trunks) {
        const q = nearest(t, cm, ...range(t));
        if (q.d < best.d) best = { trunk: t, s: q.s, members, d: q.d };
      }
      groups.push(best);
    }
  } else {
    const buckets = new Map<Trunk, { i: number; s: number }[]>();
    leaves.forEach((p, i) => {
      let best = { t: trunks[0], s: 0, d: Infinity };
      for (const t of trunks) {
        const q = nearest(t, p, ...range(t));
        if (q.d < best.d) best = { t, ...q };
      }
      if (!buckets.has(best.t)) buckets.set(best.t, []);
      buckets.get(best.t)!.push({ i, s: best.s });
    });
    for (const [trunk, list] of buckets) {
      list.sort((a, b) => a.s - b.s);
      const k = Math.ceil(list.length / size);
      for (let g = 0; g < k; g++) {
        const part = list.slice(Math.round((g * list.length) / k), Math.round(((g + 1) * list.length) / k));
        const s = part.reduce((a, x) => a + x.s, 0) / part.length;
        groups.push({ trunk, s, members: part.map((x) => x.i) });
      }
    }
  }

  const roots = groups.map((g) => {
    const r = route(g.trunk, g.s);
    if (!r.pts.length) throw new Error(`Empty route for ${key}`);
    for (const i of g.members) at[i] = r.at;
    return r.pts;
  });

  if (br.arcade) {
    // Each group's branch ends in an arcade node; arcs run half-way to the neighbouring
    // groups' nodes (meeting theirs, forming loops), and straight vessels leave the arcs.
    const nodes = groups.map((g, k) => roots[k].at(-1)!.clone().lerp(centroid(g.members.map((i) => leaves[i])), 0.55));
    groups.forEach((g, k) => {
      const sides: [number[], number[]] = [[], []];
      const dist = (i: number, h: number) => (h >= 0 && h < groups.length ? leaves[i].distanceTo(nodes[h]) : Infinity);
      // Leaves nearer the previous group's node arc towards it, the others towards the next one.
      for (const i of g.members) sides[dist(i, k - 1) < dist(i, k + 1) ? 0 : 1].push(i);
      sides.forEach((list, side) => {
        const h = side === 0 ? k - 1 : k + 1;
        // Leaves furthest from the neighbour leave the arc first.
        list.sort((a, b) => dist(b, h) - dist(a, h));
        list.forEach((i, r) => {
          const pts = [...roots[k], nodes[k]];
          if (h >= 0 && h < groups.length) {
            const mid = nodes[k].clone().lerp(nodes[h], 0.5);
            pts.push(nodes[k].clone().lerp(mid, (r + 1) / list.length));
          }
          pts.push(pts.at(-1)!.clone().lerp(leaves[i], 0.5));
          out[i] = pts;
        });
      });
    });
  } else {
    groups.forEach((g, k) => {
      // Downstream along an artery; upstream along a vein (its tributaries point back up it).
      const r = roots[k];
      const heading =
        r.length > 1 ? r.at(-1)!.clone().sub(r.at(-2)!).normalize() : g.trunk.curve.getTangentAt(g.s).multiplyScalar(artery ? 1 : -1);
      grow(r, heading, g.members, leaves, out, br.surface);
    });
  }
  return { pts: out, at };
}

function dedup(pts: Vector3[]): Vector3[] {
  const d = pts.filter((p, k) => k === 0 || p.distanceTo(pts[k - 1]) > MIN_GAP);
  if (d.length === 1) d.push(d[0].clone().add(new Vector3(0, MIN_GAP, 0)));
  return d;
}

export function buildPaths(circ: Circulation): VesselPaths {
  const segs = circ.segments;
  const isNamed = (s: Segment) => VESSEL_POINTS[s.id] !== undefined;
  for (const s of segs) {
    if (!isNamed(s) && (s.kind === 'artery' || s.kind === 'vein' || s.kind === 'chamber')) throw new Error(`No layout for ${s.id}`);
  }
  const own = (s: Segment) => VESSEL_POINTS[s.id].map((p) => new Vector3(...p));

  const bend = (pts: Vector3[], key: string) => {
    const d = dedup(pts);
    // Long straight connections get a gentle bend so they read as vessels.
    if (d.length === 2 && d[0].distanceTo(d[1]) > 3) {
      const mid = d[0].clone().lerp(d[1], 0.5);
      const dir = d[1].clone().sub(d[0]);
      const b = hashVector(key, 3).cross(dir).normalize().multiplyScalar(Math.min(2, dir.length() * 0.08));
      d.splice(1, 0, mid.add(b));
    }
    return d;
  };

  // Named vessels: joined end to start with named neighbours. Organ beds join them anywhere along.
  const named = new Map<string, Trunk>();
  for (const s of segs.filter(isNamed)) {
    const pts = own(s);
    if (s.prevIndex.length === 1 && isNamed(segs[s.prevIndex[0]])) pts.unshift(own(segs[s.prevIndex[0]]).at(-1)!);
    const next = segs[s.nextIndex[0]];
    if (s.nextIndex.length === 1 && isNamed(next) && next.prevIndex.length > 1) pts.push(own(next)[0]);
    named.set(s.id, makeTrunk(s.id, bend(pts, s.id)));
  }

  // Layout-only branches, attached to their parents.
  const branchTrunks = new Map<string, Trunk>();
  const trunkOf = (id: string): Trunk => {
    const t = named.get(id) ?? branchTrunks.get(id);
    if (t) return t;
    const b = BRANCHES[id];
    if (!b) throw new Error(`Unknown vessel ${id}`);
    const outward = b.from !== undefined;
    const parent = trunkOf((b.from ?? b.into)!);
    const pts = b.points.map((p) => new Vector3(...p));
    const { s } = nearest(parent, outward ? pts[0] : pts.at(-1)!);
    const joint = parent.curve.getPointAt(s);
    const made = makeTrunk(id, dedup(outward ? [joint, ...pts] : [...pts, joint]), parent, s, outward);
    branchTrunks.set(id, made);
    return made;
  };
  for (const id of Object.keys(BRANCHES)) trunkOf(id);

  // Organ beds: strands with their capillary loops placed in the tissue's territory.
  const bedIds = new Map<string, number>();
  const bedOfSegment = new Int32Array(segs.length).fill(-1);
  const strands = new Map<string, { anchors: Vector3[]; t: Vector3[]; w: Vector3[]; scale: number; branching: Branching }>();
  for (const s of segs) {
    if (isNamed(s)) continue;
    const { bed, part } = bedOf(s.id);
    if (!(PART_ORDER as readonly string[]).includes(part)) throw new Error(`Unknown microcirculation part ${s.id}`);
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
        branching: terr.branching,
      });
    }
    bedOfSegment[s.index] = bedIds.get(bed)!;
  }

  /** End point of strand k of a lumped part that ends inside its bed. */
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
      default:
        throw new Error(`${s.id} does not end inside its bed`);
    }
  };

  /** Trunks a bed may branch from that lead back to the named vessel `via`. */
  const candidates = (ids: string[] | undefined, via: Segment): Trunk[] => {
    const all = (ids ?? [via.id]).map(trunkOf).filter((t) => rootOf(t).id === via.id);
    if (!all.length) throw new Error(`No branch vessel of ${via.id} listed`);
    return all;
  };

  const curves: CatmullRomCurve3[] = [];
  const pathSegment: number[] = [];
  const radius: number[] = [];
  const pathStart: number[] = [];
  const pathEnd: number[] = [];
  const pathBase = new Int32Array(segs.length);
  const pathCount = new Int32Array(segs.length);
  const add = (pts: Vector3[], s: Segment, start = -1, end = -1) => {
    curves.push(new CatmullRomCurve3(pts, false, 'centripetal'));
    pathSegment.push(s.index);
    radius.push(tubeRadius(s));
    pathStart.push(start);
    pathEnd.push(end);
  };
  for (const s of segs) {
    pathBase[s.index] = curves.length;
    if (isNamed(s)) {
      add(named.get(s.id)!.curve.points, s);
      pathCount[s.index] = 1;
      continue;
    }
    const { bed, part } = bedOf(s.id);
    const st = strands.get(bed)!;
    const n = st.anchors.length;
    const pred = segs[s.prevIndex[0]];
    const next = segs[s.nextIndex[0]];
    if (s.nextIndex.length !== 1) throw new Error(`${s.id}: lumped branch`);
    const dive = (leaf: Vector3) => (st.branching.surface ? [st.branching.surface(leaf), leaf] : [leaf]);
    if (isNamed(pred)) {
      // Arteriole tree from the feeding vessel.
      if (s.prevIndex.length > 1) throw new Error(`${s.id}: lumped confluence of named vessels`);
      const leaves = st.anchors.map((_, k) => strandEnd(s, k));
      const c = chains(leaves, candidates(st.branching.arteries, pred), st.branching, true, s.id);
      for (let k = 0; k < n; k++) add(dedup([...c.pts[k], ...dive(leaves[k])]), s, c.at[k]);
    } else if (isNamed(next)) {
      // Venule tree into the draining vein.
      if (bedOf(pred.id).bed !== bed) throw new Error(`${s.id} is fed by another microcirculation`);
      const leaves = st.anchors.map((_, k) => strandEnd(pred, k));
      const c = chains(leaves, candidates(st.branching.veins, next), st.branching, false, s.id);
      for (let k = 0; k < n; k++) add(dedup([...dive(leaves[k]).reverse(), ...[...c.pts[k]].reverse()]), s, -1, c.at[k]);
    } else {
      if (bedOf(pred.id).bed !== bed || bedOf(next.id).bed !== bed) throw new Error(`${s.id} is fed by another microcirculation`);
      for (let k = 0; k < n; k++) {
        const a = strandEnd(pred, k);
        const b = strandEnd(s, k);
        add(part === 'cap' ? dedup([a, st.anchors[k].clone().addScaledVector(st.w[k], st.scale * 0.7), b]) : bend([a, b], `${s.id}#${k}`), s);
      }
    }
    pathCount[s.index] = n;
  }

  const branches: BranchTube[] = [...branchTrunks.values()].map((t) => {
    const root = rootOf(t);
    return {
      curve: t.curve,
      radius: BRANCHES[t.id].radius ?? BRANCH_RADIUS,
      segment: circ.get(root.id).index,
      at: route(t, 0).at,
    };
  });

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
    pathStart: new Float32Array(pathStart),
    pathEnd: new Float32Array(pathEnd),
    radius: new Float32Array(radius),
    lut,
    branches,
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
