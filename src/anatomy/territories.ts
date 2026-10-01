/**
 * Where each organ bed's capillaries actually are in the stylised body.
 *
 * Every lumped microcirculation is drawn as several "strands" (arterioles →
 * capillary loop → venules). This module places each strand's capillary
 * loop in that tissue's territory: just under the skin surface for skin,
 * through the volume for muscle, near the bone for "other" tissue, inside
 * the organ for organs.
 */
import { Vector3 } from 'three';
import { Rng } from '../sim/rng';
import {
  HEAD,
  LIMBS,
  mirrorCapsule,
  mirrorEllipsoid,
  ORGANS,
  TORSO_DEPTH,
  torsoRadius,
  type Capsule,
  type Ellipsoid,
} from './bodyShape';

/** Radial depth band as a fraction of the shape's radius (0 = axis/centre, 1 = surface). */
type Band = [number, number];
const SKIN: Band = [0.93, 0.98];
const MUSCLE: Band = [0.35, 0.85];
const DEEP: Band = [0.05, 0.35];
const ORGAN: Band = [0.1, 0.85];

type Sampler = (rng: Rng) => Vector3;

function inCapsules(caps: Capsule[], band: Band): Sampler {
  const lengths = caps.map((c) => new Vector3(...c.from).distanceTo(new Vector3(...c.to)));
  const total = lengths.reduce((a, b) => a + b, 0);
  return (rng) => {
    // Pick a capsule in proportion to its length, then a point in the band around its axis.
    let u = rng.next() * total;
    let k = 0;
    while (k < caps.length - 1 && u > lengths[k]) u -= lengths[k++];
    const c = caps[k];
    const a = new Vector3(...c.from);
    const b = new Vector3(...c.to);
    const axis = b.clone().sub(a).normalize();
    const n1 = new Vector3(0, 0, 1).cross(axis).normalize();
    if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
    const n2 = axis.clone().cross(n1);
    const t = 0.08 + 0.84 * rng.next();
    const theta = rng.next() * 2 * Math.PI;
    const r = c.radius * (band[0] + (band[1] - band[0]) * rng.next());
    return a.lerp(b, t).addScaledVector(n1, Math.cos(theta) * r).addScaledVector(n2, Math.sin(theta) * r);
  };
}

function inEllipsoid(e: Ellipsoid, band: Band, side?: 1 | -1): Sampler {
  return (rng) => {
    const z = 2 * rng.next() - 1;
    const phi = rng.next() * 2 * Math.PI;
    const s = Math.sqrt(1 - z * z);
    let dx = s * Math.cos(phi);
    if (side !== undefined) dx = side * Math.abs(dx);
    const r = band[0] + (band[1] - band[0]) * rng.next();
    return new Vector3(e.center[0] + dx * r * e.scale[0], e.center[1] + s * Math.sin(phi) * r * e.scale[1], e.center[2] + z * r * e.scale[2]);
  };
}

/**
 * Inside the torso between heights y0..y1, within a radial band. `side` keeps x on one side,
 * `back` keeps z negative (posterior).
 */
function inTorso(y0: number, y1: number, band: Band, opts: { side?: 1 | -1; back?: boolean } = {}): Sampler {
  return (rng) => {
    const y = y0 + (y1 - y0) * rng.next();
    let theta = rng.next() * 2 * Math.PI;
    let c = Math.cos(theta);
    let sn = Math.sin(theta);
    if (opts.side !== undefined) c = opts.side * Math.abs(c);
    if (opts.back) sn = -Math.abs(sn);
    theta = Math.atan2(sn, c);
    const r = torsoRadius(y) * (band[0] + (band[1] - band[0]) * rng.next());
    return new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r * TORSO_DEPTH);
  };
}

const organ = (key: string) => ORGANS.find((o) => o.key === key)!.shape;

/** Sampler and number of strands for a bed prefix (e.g. "leg_L.thigh.skin"). */
export function territory(bed: string): { sample: Sampler; strands: number } {
  const side = bed.match(/_(L|R)\b/)?.[1] as 'L' | 'R' | undefined;
  const sgn = side === 'R' ? -1 : 1;
  const tissue = bed.split('.').at(-1)!;
  const band = tissue === 'skin' ? SKIN : tissue === 'muscle' ? MUSCLE : DEEP;
  const strands = tissue === 'skin' ? 16 : tissue === 'muscle' ? 14 : 8;

  if (bed.startsWith('arm_') && side) {
    if (bed.includes('.hand.')) return { sample: inEllipsoid(mirrorEllipsoid(LIMBS.hand, side), tissue === 'skin' ? SKIN : [0.1, 0.6]), strands: 8 };
    return { sample: inCapsules([mirrorCapsule(LIMBS.upperArm, side), mirrorCapsule(LIMBS.forearm, side)], band), strands };
  }
  if (bed.startsWith('leg_') && side) {
    if (bed.includes('.foot.')) return { sample: inEllipsoid(mirrorEllipsoid(LIMBS.foot, side), tissue === 'skin' ? SKIN : [0.1, 0.6]), strands: 8 };
    const cap = bed.includes('.thigh.') ? LIMBS.thigh : LIMBS.calf;
    return { sample: inCapsules([mirrorCapsule(cap, side)], band), strands };
  }
  if (bed.startsWith('head_skin_')) return { sample: inEllipsoid(HEAD, SKIN, sgn), strands: 12 };
  if (bed.startsWith('brain_')) return { sample: inEllipsoid(organ('brain'), ORGAN, sgn), strands: 12 };
  if (bed.startsWith('heart_')) return { sample: inEllipsoid(organ('heart'), [0.55, 0.95], sgn), strands: 10 };
  if (bed.startsWith('lung_')) return { sample: inEllipsoid(organ(bed), ORGAN), strands: 18 };
  if (bed.startsWith('kidney_')) return { sample: inEllipsoid(organ(bed), [0.2, 0.9]), strands: 10 };
  if (bed === 'liver' || bed === 'spleen_stomach' || bed === 'intestine') return { sample: inEllipsoid(organ(bed), ORGAN), strands: 12 };
  if (bed === 'bronchial') return { sample: inEllipsoid({ center: [-4, 131, -1], scale: [6, 6, 4] }, ORGAN), strands: 4 };
  if (bed === 'trunk.skin') return { sample: inTorso(92, 145, SKIN), strands: 28 };
  if (bed === 'trunk.muscle') return { sample: inTorso(95, 142, [0.82, 0.93]), strands: 20 };
  if (bed === 'trunk.other') return { sample: inTorso(95, 140, [0.05, 0.4], { back: true }), strands: 10 };
  if (bed.startsWith('pelvis_') && tissue === 'muscle') return { sample: inTorso(85, 96, [0.6, 0.92], { side: sgn, back: true }), strands: 10 };
  if (bed.startsWith('pelvis_')) return { sample: inTorso(85, 98, [0.05, 0.5], { side: sgn }), strands: 8 };
  throw new Error(`No territory for bed ${bed}`);
}
