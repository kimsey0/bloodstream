/**
 * Stylised translucent body and organ shells, built from primitives.
 *
 * The skin is drawn in two passes: a depth-only pass, then a colour pass with
 * an equal-depth test. Only the surface nearest the camera is tinted, so
 * overlapping limbs and the far side of the body don't stack into fog.
 */
import {
  CapsuleGeometry,
  EqualDepth,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HEAD, LIMBS, mirrorCapsule, mirrorEllipsoid, NECK, ORGANS, TORSO_DEPTH, TORSO_PROFILE, type V3 } from '../anatomy/bodyShape';
import { glassMaterial } from './materials';


function ellipsoid(center: V3, scale: V3, detail = 24): BufferGeometry {
  const g = new SphereGeometry(1, detail, Math.round(detail * 0.75));
  g.scale(...scale);
  g.translate(...center);
  return g;
}

function limb(from: V3, to: V3, radius: number): BufferGeometry {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const g = new CapsuleGeometry(radius, a.distanceTo(b), 6, 16);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(...(a.add(b).multiplyScalar(0.5).toArray() as V3));
  return g;
}

function torso(): BufferGeometry {
  const g = new LatheGeometry(TORSO_PROFILE.map(([r, y]) => new Vector2(r, y)), 40);
  g.scale(1, 1, TORSO_DEPTH);
  return g;
}

export function createBody(): Group {
  const group = new Group();
  const parts: BufferGeometry[] = [torso(), ellipsoid(HEAD.center, HEAD.scale), limb(NECK.from, NECK.to, NECK.radius)];
  for (const side of ['L', 'R'] as const) {
    for (const c of [LIMBS.upperArm, LIMBS.forearm, LIMBS.thigh, LIMBS.calf]) {
      const m = mirrorCapsule(c, side);
      parts.push(limb(m.from, m.to, m.radius));
    }
    for (const e of [LIMBS.hand, LIMBS.foot]) {
      const m = mirrorEllipsoid(e, side);
      parts.push(ellipsoid(m.center, m.scale));
    }
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());

  const depth = new Mesh(geometry, new MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
  depth.renderOrder = 10;
  // Draw with the transparent queue so it comes after the vessels.
  (depth.material as MeshBasicMaterial).transparent = true;
  const skin = new Mesh(geometry, glassMaterial({ tint: '#a9c4dc', alphaCenter: 0.025, alphaEdge: 0.34, rimBoost: 0.08 }));
  skin.material.depthFunc = EqualDepth;
  skin.renderOrder = 11;
  group.add(depth, skin);
  group.add(createOrgans());
  return group;
}

function createOrgans(): Group {
  const g = new Group();
  for (const o of ORGANS) {
    // Built at the origin and positioned, so organs (the heart) can be scaled about their centre.
    const m = new Mesh(ellipsoid([0, 0, 0], o.shape.scale, 20), glassMaterial({ tint: o.tint, alphaCenter: 0.02, alphaEdge: 0.2 }));
    m.name = o.name;
    m.position.set(...o.shape.center);
    m.renderOrder = 1;
    g.add(m);
  }
  return g;
}
