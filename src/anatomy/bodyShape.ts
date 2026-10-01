/**
 * The stylised body's shape (cm, same frame as layout.ts), shared by the
 * translucent body mesh and the placement of capillary beds in tissue, so
 * that skin capillaries really sit under the drawn skin.
 */

export type V3 = [number, number, number];

export interface Capsule {
  from: V3;
  to: V3;
  radius: number;
}

export interface Ellipsoid {
  center: V3;
  scale: V3;
}

/** Torso radius (x half-width) against height; depth is this × TORSO_DEPTH. */
export const TORSO_PROFILE: [number, number][] = [
  [0.1, 86], [12, 86.5], [16, 91], [15.5, 97], [13.5, 104], [13.8, 110], [15, 118],
  [16.5, 128], [17.5, 137], [17, 142], [14, 145.5], [7, 147.5], [0.1, 148],
];
export const TORSO_DEPTH = 0.62;

export const HEAD: Ellipsoid = { center: [0, 163, 0.5], scale: [8, 11, 9.5] };
export const NECK: Capsule = { from: [0, 145, -0.5], to: [0, 153, 0], radius: 5 };

/** Limbs for one side; x is given for the LEFT side (mirror for right). */
export const LIMBS = {
  upperArm: { from: [17, 142, 0], to: [26.5, 114, -1], radius: 4.6 } as Capsule,
  forearm: { from: [26.5, 114, -1], to: [32, 87, 1.5], radius: 3.6 } as Capsule,
  hand: { center: [33.5, 78, 2], scale: [2.2, 6, 4] } as Ellipsoid,
  thigh: { from: [9, 88, 0.5], to: [10, 48, 0], radius: 6.8 } as Capsule,
  calf: { from: [10, 48, 0], to: [9, 8, -1], radius: 4.8 } as Capsule,
  foot: { center: [9, 3.5, 4], scale: [4, 3, 11] } as Ellipsoid,
};

export const ORGANS: { name: string; key: string; shape: Ellipsoid; tint: string }[] = [
  { name: 'Left lung', key: 'lung_L', shape: { center: [11, 130, 0], scale: [7, 12, 7.5] }, tint: '#d7a7b4' },
  { name: 'Right lung', key: 'lung_R', shape: { center: [-11, 131, 0], scale: [7.5, 11.5, 7.5] }, tint: '#d7a7b4' },
  { name: 'Heart', key: 'heart', shape: { center: [2, 127, 4.5], scale: [5, 6, 4.5] }, tint: '#e07a7a' },
  { name: 'Brain', key: 'brain', shape: { center: [0, 164, -0.5], scale: [7, 6.5, 8.5] }, tint: '#e6c7cf' },
  { name: 'Liver', key: 'liver', shape: { center: [-7, 114, 2], scale: [10, 5, 7] }, tint: '#a8665a' },
  { name: 'Stomach & spleen', key: 'spleen_stomach', shape: { center: [8, 113, 0], scale: [5, 4, 4.5] }, tint: '#d39a87' },
  { name: 'Intestines', key: 'intestine', shape: { center: [0, 97, 4], scale: [10, 7, 5] }, tint: '#d8b296' },
  { name: 'Left kidney', key: 'kidney_L', shape: { center: [6.5, 103, -6], scale: [2.6, 5, 2.6] }, tint: '#b0645f' },
  { name: 'Right kidney', key: 'kidney_R', shape: { center: [-6.5, 102, -6], scale: [2.6, 5, 2.6] }, tint: '#b0645f' },
];

export const mirror = (p: V3, side: 'L' | 'R'): V3 => (side === 'L' ? p : [-p[0], p[1], p[2]]);
export const mirrorCapsule = (c: Capsule, side: 'L' | 'R'): Capsule => ({ ...c, from: mirror(c.from, side), to: mirror(c.to, side) });
export const mirrorEllipsoid = (e: Ellipsoid, side: 'L' | 'R'): Ellipsoid => ({ ...e, center: mirror(e.center, side) });

/** Torso half-width at height y (cm). */
export function torsoRadius(y: number): number {
  const p = TORSO_PROFILE;
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][1]) {
      const t = (y - p[i - 1][1]) / (p[i][1] - p[i - 1][1]);
      return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
    }
  }
  return p[p.length - 1][0];
}
