/** One merged tube mesh for the whole vascular tree, vertex-coloured by steady-state saturation. */
import { BufferAttribute, Mesh, TubeGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VesselPaths } from '../anatomy/paths';
import { saturationColor } from '../color/saturation';
import type { Circulation } from '../sim/circulation';
import { PROFILE_SAMPLES } from '../sim/protocol';
import { glassMaterial } from './materials';

export function createVessels(circ: Circulation, paths: VesselPaths): Mesh {
  const parts: BufferGeometry[] = circ.segments.map((_, i) => {
    const curve = paths.curves[i];
    const len = curve.getLength();
    const tubular = Math.max(4, Math.min(64, Math.round(len * 1.2)));
    const radial = paths.radius[i] > 0.5 ? 12 : 6;
    const g = new TubeGeometry(curve, tubular, paths.radius[i], radial, false);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.userData = { segment: i, tubular, radial };
    return g;
  });
  const geometry = mergeGeometries(parts, false);
  geometry.userData.parts = parts.map((g) => ({ ...g.userData, count: g.getAttribute('position').count }));
  parts.forEach((g) => g.dispose());
  const mesh = new Mesh(geometry, glassMaterial({ vertexColors: true, alphaCenter: 0.18, alphaEdge: 0.85, rimBoost: 0.12 }));
  mesh.renderOrder = 2;
  return mesh;
}

/** Colour each tube along its length from per-segment saturation profiles. */
export function colorVessels(mesh: Mesh, profiles: Float32Array): void {
  const color = mesh.geometry.getAttribute('color') as BufferAttribute;
  const arr = color.array as Float32Array;
  let offset = 0;
  for (const part of mesh.geometry.userData.parts as { segment: number; tubular: number; radial: number; count: number }[]) {
    // TubeGeometry vertices: (tubular + 1) rings of (radial + 1) vertices.
    for (let i = 0; i <= part.tubular; i++) {
      const f = (i / part.tubular) * (PROFILE_SAMPLES - 1);
      const k = Math.min(Math.floor(f), PROFILE_SAMPLES - 2);
      const t = f - k;
      const base = part.segment * PROFILE_SAMPLES;
      const s = profiles[base + k] * (1 - t) + profiles[base + k + 1] * t;
      const [r, g, b] = saturationColor(s);
      for (let j = 0; j <= part.radial; j++) {
        const v = (offset + i * (part.radial + 1) + j) * 3;
        arr[v] = r;
        arr[v + 1] = g;
        arr[v + 2] = b;
      }
    }
    offset += part.count;
  }
  color.needsUpdate = true;
}
