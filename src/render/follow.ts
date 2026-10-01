/** Visuals for the followed cell: a screen-space ring marker and a saturation-coloured trail. */
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Points, ShaderMaterial, Vector3 } from 'three';
import { saturationColorLinear } from '../color/saturation';

const TRAIL_POINTS = 600;
/** Minimum spacing between trail points, cm. */
const TRAIL_STEP = 0.25;

export class FollowMarker {
  readonly marker: Points;
  readonly trail: Line;
  private readonly trailPos = new Float32Array(TRAIL_POINTS * 3);
  private readonly trailCol = new Float32Array(TRAIL_POINTS * 3);
  private count = 0;
  private readonly last = new Vector3(Infinity, 0, 0);

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    this.marker = new Points(
      g,
      new ShaderMaterial({
        uniforms: { size: { value: 30 } },
        vertexShader: /* glsl */ `
          uniform float size;
          void main() {
            gl_PointSize = size;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          void main() {
            float d = length(gl_PointCoord * 2.0 - 1.0);
            float ring = smoothstep(0.72, 0.8, d) * (1.0 - smoothstep(0.9, 1.0, d));
            if (ring < 0.02) discard;
            gl_FragColor = vec4(vec3(1.0), ring);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 20;
    this.marker.visible = false;

    const tg = new BufferGeometry();
    tg.setAttribute('position', new BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new BufferAttribute(this.trailCol, 3));
    tg.setDrawRange(0, 0);
    this.trail = new Line(tg, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 19;
    this.trail.visible = false;
  }

  setPixelRatio(ratio: number): void {
    (this.marker.material as ShaderMaterial).uniforms.size.value = 30 * ratio;
  }

  show(on: boolean): void {
    this.marker.visible = on;
    this.trail.visible = on;
    if (!on) this.clearTrail();
  }

  clearTrail(): void {
    this.count = 0;
    this.last.set(Infinity, 0, 0);
    this.trail.geometry.setDrawRange(0, 0);
  }

  update(p: Vector3, saturation: number): void {
    const mp = this.marker.geometry.getAttribute('position') as BufferAttribute;
    mp.setXYZ(0, p.x, p.y, p.z);
    mp.needsUpdate = true;
    // A long jump means a new cell or a reset; start a fresh trail.
    if (this.last.x !== Infinity && p.distanceTo(this.last) > 25) this.clearTrail();
    if (p.distanceTo(this.last) < TRAIL_STEP && this.count > 0) return;
    if (this.count === TRAIL_POINTS) {
      this.trailPos.copyWithin(0, 3);
      this.trailCol.copyWithin(0, 3);
      this.count--;
    }
    const [r, g, b] = saturationColorLinear(saturation);
    this.trailPos.set([p.x, p.y, p.z], this.count * 3);
    this.trailCol.set([r, g, b], this.count * 3);
    this.count++;
    this.last.copy(p);
    const geo = this.trail.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;
    geo.setDrawRange(0, this.count);
  }
}
