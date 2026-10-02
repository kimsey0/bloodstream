/**
 * Where each organ bed's capillaries actually are in the stylised body, and
 * how its vessels branch to reach them.
 *
 * Every lumped microcirculation is drawn as several "strands" (arterioles →
 * capillary loop → venules). This module places each strand's capillary
 * loop in that tissue's territory: just under the skin surface for skin,
 * through the volume for muscle, near the bone for "other" tissue, inside
 * the organ for organs. It also says which vessels the bed's arteriole and
 * venule trees branch from (see paths.ts):
 *
 * - Limbs, trunk wall, face: branches leave along the feeding artery and its
 *   layout-only side branches, and join the draining veins along their length.
 * - Lungs, kidneys, liver, spleen: one tree from the hilum.
 * - Brain, heart: arteries run over the organ's surface, then dive in.
 * - Intestines: looped arcades, then straight vessels to the gut wall.
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
type Surface = (p: Vector3) => Vector3;

/** How a bed's arteriole and venule strands branch from the named vessels. */
export interface Branching {
  /** Vessels the arteriole trees may leave from: named vessels and layout branches (default: the feeding artery). */
  arteries?: string[];
  /** Vessels the venule trees may join (default: the draining vein). */
  veins?: string[];
  /** One tree from the end of the feeding artery and one into the start of the draining vein. */
  hilum?: boolean;
  /** Intestinal arcades: neighbouring branches joined in loops, then straight vessels outwards. */
  arcade?: boolean;
  /** Keep branch points on this surface; strands then dive in to their capillaries. */
  surface?: Surface;
  /** Strands per branch leaving a vessel (default 4). */
  groupSize?: number;
}

export interface Territory {
  sample: Sampler;
  strands: number;
  branching: Branching;
}

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

/** Radial projection onto an ellipsoid scaled by k (1 = its surface). */
function ellipsoidSurface(e: Ellipsoid, k = 1): Surface {
  const c = new Vector3(...e.center);
  const sc = new Vector3(...e.scale);
  return (p) => {
    const d = p.clone().sub(c).divide(sc);
    const len = d.length() || 1;
    return d.multiplyScalar(k / len).multiply(sc).add(c);
  };
}

/** Projection onto the torso wall at fraction k of its radius, keeping height and direction. */
function torsoSurface(k: number): Surface {
  return (p) => {
    const theta = Math.atan2(p.z / TORSO_DEPTH, p.x);
    const r = torsoRadius(p.y) * k;
    return new Vector3(Math.cos(theta) * r, p.y, Math.sin(theta) * r * TORSO_DEPTH);
  };
}

/** Sampler, number of strands and branching for a bed prefix (e.g. "leg_L.thigh.skin"). */
export function territory(bed: string): Territory {
  const side = bed.match(/_(L|R)\b/)?.[1] as 'L' | 'R' | undefined;
  const sgn = side === 'R' ? -1 : 1;
  const tissue = bed.split('.').at(-1)!;
  const skin = tissue === 'skin';
  const band = skin ? SKIN : tissue === 'muscle' ? MUSCLE : DEEP;
  const strands = skin ? 20 : tissue === 'muscle' ? 20 : 12;
  const t = (sample: Sampler, n: number, branching: Branching = {}): Territory => ({ sample, strands: n, branching });

  if (bed.startsWith('arm_') && side) {
    if (bed.includes('.hand.')) return t(inEllipsoid(mirrorEllipsoid(LIMBS.hand, side), skin ? SKIN : [0.1, 0.6]), 8);
    return t(inCapsules([mirrorCapsule(LIMBS.upperArm, side), mirrorCapsule(LIMBS.forearm, side)], band), strands, {
      arteries: [`brachial_${side}`, `profunda_brachii_${side}`],
      veins: skin ? [`cephalic_vein_${side}`] : undefined,
    });
  }
  if (bed.startsWith('leg_') && side) {
    if (bed.includes('.foot.')) return t(inEllipsoid(mirrorEllipsoid(LIMBS.foot, side), skin ? SKIN : [0.1, 0.6]), 8);
    if (bed.includes('.thigh.')) {
      return t(inCapsules([mirrorCapsule(LIMBS.thigh, side)], band), strands, {
        arteries: [`femoral_${side}`, `profunda_femoris_${side}`],
        veins: skin ? [`great_saphenous_${side}`] : undefined,
      });
    }
    return t(inCapsules([mirrorCapsule(LIMBS.calf, side)], band), strands, {
      arteries: [`lower_leg_artery_${side}`, `anterior_tibial_${side}`, `fibular_${side}`],
      veins: skin ? [`small_saphenous_${side}`, `lower_leg_vein_${side}`] : undefined,
    });
  }
  if (bed.startsWith('head_skin_') && side) {
    return t(inEllipsoid(HEAD, SKIN, sgn), 16, {
      arteries: [`external_carotid_${side}`, `facial_artery_${side}`],
      veins: [`jugular_${side}`, `facial_vein_${side}`],
      surface: ellipsoidSurface(HEAD, 0.9),
    });
  }
  if (bed.startsWith('brain_') && side) {
    return t(inEllipsoid(organ('brain'), [0.3, 0.9], sgn), 18, {
      arteries: [`mca_${side}`, `aca_${side}`, `pca_${side}`],
      veins: [`sagittal_sinus_${side}`, `transverse_sinus_${side}`],
      surface: ellipsoidSurface(organ('brain')),
      groupSize: 3,
    });
  }
  if (bed.startsWith('heart_')) {
    const left = bed === 'heart_L';
    return t(inEllipsoid(organ('heart'), [0.55, 0.95], sgn), 14, {
      arteries: left ? ['coronary_L', 'lad', 'circumflex'] : ['coronary_R', 'posterior_descending'],
      veins: left ? ['great_cardiac_vein', 'coronary_sinus'] : ['middle_cardiac_vein', 'coronary_sinus'],
      surface: ellipsoidSurface(organ('heart')),
      groupSize: 3,
    });
  }
  if (bed.startsWith('lung_')) return t(inEllipsoid(organ(bed), ORGAN), 24, { hilum: true });
  // Glomeruli and peritubular capillaries are in the cortex.
  if (bed.startsWith('kidney_')) return t(inEllipsoid(organ(bed), [0.55, 0.92]), 16, { hilum: true });
  if (bed === 'liver') return t(inEllipsoid(organ(bed), ORGAN), 20, { hilum: true });
  if (bed === 'spleen_stomach') return t(inEllipsoid(organ(bed), ORGAN), 14, { hilum: true });
  if (bed === 'intestine') {
    return t(inEllipsoid(organ(bed), ORGAN), 24, {
      arteries: ['sma', 'mesenteric_arteries'],
      veins: ['smv', 'mesenteric_veins'],
      arcade: true,
      groupSize: 3,
    });
  }
  if (bed === 'bronchial') return t(inEllipsoid({ center: [-4, 131, -1], scale: [6, 6, 4] }, ORGAN), 4);
  const wall: Branching = { arteries: ['aorta_thoracic', 'lumbar_arteries'], veins: ['azygos', 'ascending_lumbar_vein'] };
  if (bed === 'trunk.skin') return t(inTorso(92, 145, SKIN), 28, { ...wall, surface: torsoSurface(0.88) });
  if (bed === 'trunk.muscle') return t(inTorso(95, 142, [0.82, 0.93]), 20, { ...wall, surface: torsoSurface(0.85) });
  if (bed === 'trunk.other') return t(inTorso(95, 140, [0.05, 0.4], { back: true }), 10, wall);
  if (bed.startsWith('pelvis_') && side && tissue === 'muscle') {
    return t(inTorso(85, 96, [0.6, 0.92], { side: sgn, back: true }), 10, { arteries: [`int_iliac_${side}`, `gluteal_artery_${side}`] });
  }
  if (bed.startsWith('pelvis_')) return t(inTorso(85, 98, [0.05, 0.5], { side: sgn }), 8);
  throw new Error(`No territory for bed ${bed}`);
}
