/**
 * The vascular tree, coloured by steady-state saturation along each vessel.
 *
 * Named vessels are glass tubes (one merged mesh). The many strands of the
 * organ microcirculations are thin lines (one merged line set), which keeps
 * phones fast and reads like a fine vascular mesh.
 */
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, TubeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VesselPaths } from '../anatomy/paths';
import { saturationColor, saturationColorLinear } from '../color/saturation';
import type { Circulation } from '../sim/circulation';
import { PROFILE_SAMPLES } from '../sim/protocol';
import { glassMaterial } from './materials';

/** Points per microcirculation strand line. */
const STRAND_POINTS = 12;

interface TubePart {
  segment: number;
  tubular: number;
  radial: number;
  count: number;
}

export interface Vessels {
  group: Group;
  tubes: Mesh;
  strands: LineSegments;
  tubeParts: TubePart[];
  /** Segment of each strand line, in drawing order. */
  strandSegments: number[];
}

export function createVessels(circ: Circulation, paths: VesselPaths): Vessels {
  const tubeGeos: BufferGeometry[] = [];
  const tubeParts: TubePart[] = [];
  const strandSegments: number[] = [];
  const strandPos: number[] = [];
  paths.curves.forEach((curve, p) => {
    const segment = paths.pathSegment[p];
    if (paths.bedOfSegment[segment] < 0) {
      const tubular = Math.max(4, Math.min(64, Math.round(curve.getLength() * 1.2)));
      const radial = paths.radius[p] > 0.5 ? 12 : 6;
      const g = new TubeGeometry(curve, tubular, paths.radius[p], radial, false);
      g.setAttribute('color', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3));
      tubeGeos.push(g);
      tubeParts.push({ segment, tubular, radial, count: g.getAttribute('position').count });
    } else {
      const pts = curve.getSpacedPoints(STRAND_POINTS - 1);
      for (let i = 0; i < STRAND_POINTS - 1; i++) strandPos.push(...pts[i].toArray(), ...pts[i + 1].toArray());
      strandSegments.push(segment);
    }
  });
  void circ;

  const tubeGeometry = mergeGeometries(tubeGeos, false);
  tubeGeos.forEach((g) => g.dispose());
  const tubes = new Mesh(tubeGeometry, glassMaterial({ vertexColors: true, alphaCenter: 0.18, alphaEdge: 0.85, rimBoost: 0.12 }));
  tubes.renderOrder = 2;

  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(new Float32Array(strandPos), 3));
  sg.setAttribute('color', new BufferAttribute(new Float32Array(strandPos.length), 3));
  const strands = new LineSegments(sg, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }));
  strands.renderOrder = 2;

  const group = new Group();
  group.add(tubes, strands);
  return { group, tubes, strands, tubeParts, strandSegments };
}

/** Saturation at fraction f along segment `segment`, from the per-segment profiles. */
function profileAt(profiles: Float32Array, segment: number, f: number): number {
  const x = Math.min(Math.max(f, 0), 1) * (PROFILE_SAMPLES - 1);
  const k = Math.min(Math.floor(x), PROFILE_SAMPLES - 2);
  const t = x - k;
  const base = segment * PROFILE_SAMPLES;
  return profiles[base + k] * (1 - t) + profiles[base + k + 1] * t;
}

/** Colour every vessel along its length from per-segment saturation profiles. */
export function colorVessels(v: Vessels, profiles: Float32Array): void {
  // Tubes: gamma-encoded colours for the glass shader.
  const color = v.tubes.geometry.getAttribute('color') as BufferAttribute;
  const arr = color.array as Float32Array;
  let offset = 0;
  for (const part of v.tubeParts) {
    // TubeGeometry vertices: (tubular + 1) rings of (radial + 1) vertices.
    for (let i = 0; i <= part.tubular; i++) {
      const [r, g, b] = saturationColor(profileAt(profiles, part.segment, i / part.tubular));
      for (let j = 0; j <= part.radial; j++) arr.set([r, g, b], (offset + i * (part.radial + 1) + j) * 3);
    }
    offset += part.count;
  }
  color.needsUpdate = true;

  // Strand lines: linear colours for the built-in line material.
  const sc = v.strands.geometry.getAttribute('color') as BufferAttribute;
  const sa = sc.array as Float32Array;
  const perStrand = (STRAND_POINTS - 1) * 2;
  v.strandSegments.forEach((segment, n) => {
    for (let i = 0; i < STRAND_POINTS - 1; i++) {
      for (const [end, f] of [
        [0, i / (STRAND_POINTS - 1)],
        [1, (i + 1) / (STRAND_POINTS - 1)],
      ]) {
        sa.set(saturationColorLinear(profileAt(profiles, segment, f)), (n * perStrand + i * 2 + end) * 3);
      }
    }
  });
  sc.needsUpdate = true;
}
