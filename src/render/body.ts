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
import { glassMaterial } from './materials';

type V3 = [number, number, number];

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
  // Radius profile (x half-width) against height; depth is scaled separately.
  const profile: [number, number][] = [
    [0.1, 86], [12, 86.5], [16, 91], [15.5, 97], [13.5, 104], [13.8, 110], [15, 118],
    [16.5, 128], [17.5, 137], [17, 142], [14, 145.5], [7, 147.5], [0.1, 148],
  ];
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 40);
  g.scale(1, 1, 0.62);
  return g;
}

export function createBody(): Group {
  const group = new Group();
  const parts: BufferGeometry[] = [torso(), ellipsoid([0, 163, 0.5], [8, 11, 9.5]), limb([0, 145, -0.5], [0, 153, 0], 5)];
  for (const m of [1, -1]) {
    parts.push(
      limb([17 * m, 142, 0], [26.5 * m, 114, -1], 4.6),
      limb([26.5 * m, 114, -1], [32 * m, 87, 1.5], 3.6),
      ellipsoid([33.5 * m, 78, 2], [2.2, 6, 4]),
      limb([9 * m, 88, 0.5], [10 * m, 48, 0], 6.8),
      limb([10 * m, 48, 0], [9 * m, 8, -1], 4.8),
      ellipsoid([9 * m, 3.5, 4], [4, 3, 11]),
    );
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

const ORGANS: { name: string; center: V3; scale: V3; tint: string }[] = [
  { name: 'Left lung', center: [11, 130, 0], scale: [7, 12, 7.5], tint: '#d7a7b4' },
  { name: 'Right lung', center: [-11, 131, 0], scale: [7.5, 11.5, 7.5], tint: '#d7a7b4' },
  { name: 'Heart', center: [2, 127, 4.5], scale: [5, 6, 4.5], tint: '#e07a7a' },
  { name: 'Brain', center: [0, 164, -0.5], scale: [7, 6.5, 8.5], tint: '#e6c7cf' },
  { name: 'Liver', center: [-7, 114, 2], scale: [10, 5, 7], tint: '#a8665a' },
  { name: 'Stomach & spleen', center: [8, 113, 0], scale: [5, 4, 4.5], tint: '#d39a87' },
  { name: 'Intestines', center: [0, 97, 4], scale: [10, 7, 5], tint: '#d8b296' },
  { name: 'Left kidney', center: [6.5, 103, -6], scale: [2.6, 5, 2.6], tint: '#b0645f' },
  { name: 'Right kidney', center: [-6.5, 102, -6], scale: [2.6, 5, 2.6], tint: '#b0645f' },
];

function createOrgans(): Group {
  const g = new Group();
  for (const o of ORGANS) {
    const m = new Mesh(ellipsoid(o.center, o.scale, 20), glassMaterial({ tint: o.tint, alphaCenter: 0.02, alphaEdge: 0.2 }));
    m.name = o.name;
    m.renderOrder = 1;
    g.add(m);
  }
  return g;
}
