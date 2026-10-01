/**
 * The microscope view: one capillary bed at true scale (µm), with
 * biconcave red cells and O2 "dots" crossing the capillary wall.
 */
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { saturationColor, saturationColorLinear } from '../color/saturation';
import { saturation } from '../physiology/dissociation';
import type { MicroBed } from '../micro/beds';
import { ARTERIOLE_SPEED, VENULE_SPEED, type DotEvent, type MicroSim } from '../micro/microSim';
import { sampleLine, type MicroNetwork } from '../micro/network';
import { integratePo2 } from '../sim/oxygen';
import { FollowMarker } from './follow';
import { glassMaterial } from './materials';

/** Red cell radius, µm (Evans & Fung 1972). */
const RBC_RADIUS = 3.91;
const MAX_DOTS = 2500;
const UP = new Vector3(0, 1, 0);

/** Biconcave disc from the Evans–Fung thickness profile, axis along +Y. */
function rbcGeometry(): LatheGeometry {
  const R = RBC_RADIUS;
  const half = (r: number) => {
    const x = Math.min(1, r / R);
    return 0.5 * Math.sqrt(Math.max(0, 1 - x * x)) * (0.81 + 7.83 * x * x - 4.39 * x ** 4);
  };
  // From the bottom pole out to the rim and back to the top pole.
  const profile: Vector2[] = [];
  const n = 12;
  for (let i = 0; i <= 2 * n; i++) {
    const theta = -Math.PI / 2 + (i / (2 * n)) * Math.PI;
    const r = Math.max(0.001, R * Math.cos(theta));
    profile.push(new Vector2(r, Math.sign(theta) * Math.max(half(r), 0.04)));
  }
  return new LatheGeometry(profile, 16);
}

/** Tube with per-ring vertex colours (gamma-encoded) from colorAt(u), u ∈ [0, 1]. */
function colouredTube(points: Vector3[], radius: number, colorAt: (u: number) => [number, number, number], radial = 8): BufferGeometry {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const tubular = Math.min(160, Math.max(8, Math.round(curve.getLength() / 6)));
  const g = new TubeGeometry(curve, tubular, radius, radial, false);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i <= tubular; i++) {
    const c = colorAt(i / tubular);
    for (let j = 0; j <= radial; j++) colors.set(c, (i * (radial + 1) + j) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export interface MicroFollow {
  /** Position along the chosen route, or null when the followed cell is not in this patch. */
  route: number;
  s: number;
  saturation: number;
}

export class MicroScene {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly cells: InstancedMesh;
  private readonly followCell: Mesh;
  private readonly marker = new FollowMarker(1.5, 60);
  private readonly dots: Points;
  private readonly dotStart = new Float32Array(MAX_DOTS * 3);
  private readonly dotEnd = new Float32Array(MAX_DOTS * 3);
  private readonly dotAge = new Float32Array(MAX_DOTS).fill(1);
  private dotHead = 0;
  private readonly disposables: { dispose(): void }[] = [];
  private follow: MicroFollow | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    readonly bed: MicroBed,
    readonly net: MicroNetwork,
    readonly sim: MicroSim,
    satIn: number,
    satOut: number,
  ) {
    this.camera = new PerspectiveCamera(35, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.5, net.extent * 60);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 15;
    this.controls.maxDistance = net.extent * 8;
    this.controls.zoomToCursor = true;
    this.resetView();

    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 3);
    this.scene.add(new AmbientLight(0xffffff, 0.75), sun);

    const vessels = new Group();
    const col = (s: number) => saturationColor(s);
    const add = (geometry: BufferGeometry, material: Material, order: number) => {
      const m = new Mesh(geometry, material);
      m.renderOrder = order;
      vessels.add(m);
      this.disposables.push(geometry, material);
      return m;
    };
    const tubeMat = () => glassMaterial({ vertexColors: true, alphaCenter: 0.12, alphaEdge: 0.75, rimBoost: 0.1 });
    add(colouredTube(net.arteriole, net.artRadius, () => col(satIn), 12), tubeMat(), 2);
    add(colouredTube(net.venule, net.venRadius, () => col(satOut), 12), tubeMat(), 2);
    net.capillaries.forEach((pts, i) => {
      const T = sim.capTransit[i];
      add(
        colouredTube(pts, net.capRadius + 0.6, (u) => col(saturation(integratePo2(sim.params.po2In, u * T, sim.params.exchange)))),
        tubeMat(),
        2,
      );
    });
    this.scene.add(vessels);
    this.scene.add(this.buildContext());

    const disc = rbcGeometry();
    const mat = new MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    this.cells = new InstancedMesh(disc, mat, 6000);
    this.cells.instanceMatrix.setUsage(DynamicDrawUsage);
    this.cells.count = 0;
    this.cells.frustumCulled = false;
    this.scene.add(this.cells);
    this.followCell = new Mesh(disc, new MeshStandardMaterial({ roughness: 0.45, emissive: new Color(0x222222) }));
    this.followCell.visible = false;
    this.scene.add(this.followCell, this.marker.marker, this.marker.trail);
    this.disposables.push(disc, mat, this.followCell.material as Material);

    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(new Float32Array(MAX_DOTS * 3), 3).setUsage(DynamicDrawUsage));
    dg.setAttribute('alpha', new BufferAttribute(new Float32Array(MAX_DOTS), 1).setUsage(DynamicDrawUsage));
    this.dots = new Points(
      dg,
      new ShaderMaterial({
        uniforms: { scale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float alpha;
          uniform float scale;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = clamp(2.4 * scale / -mv.z, 2.0, 14.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord * 2.0 - 1.0);
            if (d > 1.0 || vAlpha <= 0.0) discard;
            gl_FragColor = vec4(vec3(0.85, 0.97, 1.0), vAlpha * (1.0 - d * d));
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 5;
    this.scene.add(this.dots);
    this.disposables.push(dg, this.dots.material as Material);
  }

  private buildContext(): Group {
    const g = new Group();
    const tint = this.bed.style === 'alveoli' ? '#9cc3e6' : this.bed.style === 'hairpin' ? '#d9b8a0' : this.bed.fiberLabel === 'tubules' ? '#c9b48f' : '#c98e8e';
    const mat = glassMaterial({ tint, alphaCenter: 0.03, alphaEdge: 0.22 });
    this.disposables.push(mat);
    for (const c of this.net.context) {
      let geo: BufferGeometry;
      if (c.kind === 'cylinder') {
        const len = c.from.distanceTo(c.to);
        geo = new CylinderGeometry(c.radius, c.radius, len, 24, 1, true);
        geo.applyQuaternion(new Quaternion().setFromUnitVectors(UP, c.to.clone().sub(c.from).normalize()));
        geo.translate(...(c.from.clone().add(c.to).multiplyScalar(0.5).toArray() as [number, number, number]));
      } else if (c.kind === 'sphere') {
        geo = new SphereGeometry(c.radius, 32, 20);
        geo.translate(c.center.x, c.center.y, c.center.z);
      } else {
        geo = new BoxGeometry(c.size.x, c.size.y, c.size.z);
        geo.translate(c.center.x, c.center.y, c.center.z);
      }
      const m = new Mesh(geo, mat);
      m.renderOrder = 1;
      g.add(m);
      this.disposables.push(geo);
    }
    return g;
  }

  resetView(): void {
    const c = this.net.center;
    // Fit the network's bounding box (seen roughly face-on) in both screen dimensions.
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const h = this.net.halfSize;
    const d = Math.max(h.y / t, h.x / (t * this.camera.aspect)) * 1.1 + h.z;
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(new Vector3(0.2, 0.3, 1).normalize().multiplyScalar(d));
    this.camera.lookAt(c);
    this.controls.update();
  }

  setActive(on: boolean): void {
    this.controls.enabled = on;
  }

  /** Followed cell position inside this patch (or null to hide it). */
  setFollow(f: MicroFollow | null): void {
    if ((f === null) !== (this.follow === null)) this.marker.clearTrail();
    this.follow = f;
    this.marker.show(f !== null);
    this.followCell.visible = f !== null;
  }

  /** Advance local cells by dt body seconds and the dot animation by wallDt real seconds. */
  update(dt: number, wallDt: number, speed: number): void {
    if (dt > 0) this.spawnDots(this.sim.step(dt), speed);
    this.drawCells();
    this.drawDots(wallDt, speed);
  }

  private spawnDots(events: DotEvent[], speed: number): void {
    const n = new Vector3();
    // Represent distance travelled by diffusion, not time: a dot covers ~12 µm whatever the playback speed.
    void speed;
    for (const e of events) {
      n.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const i = this.dotHead;
      this.dotHead = (this.dotHead + 1) % MAX_DOTS;
      const near = e.position.clone().addScaledVector(n, this.net.capRadius);
      const far = e.position.clone().addScaledVector(n, this.net.capRadius + 14);
      const [from, to] = e.direction > 0 ? [near, far] : [far, near];
      this.dotStart.set(from.toArray(), i * 3);
      this.dotEnd.set(to.toArray(), i * 3);
      this.dotAge[i] = 0;
    }
  }

  private drawDots(wallDt: number, speed: number): void {
    // Dots live ~0.15 s of body time, but at least 0.4 s and at most 1.5 s on screen.
    const life = Math.min(1.5, Math.max(0.4, 0.15 / Math.max(speed, 1e-3)));
    const pos = this.dots.geometry.getAttribute('position') as BufferAttribute;
    const alpha = this.dots.geometry.getAttribute('alpha') as BufferAttribute;
    const p = pos.array as Float32Array;
    const a = alpha.array as Float32Array;
    for (let i = 0; i < MAX_DOTS; i++) {
      if (this.dotAge[i] >= 1) {
        a[i] = 0;
        continue;
      }
      this.dotAge[i] = Math.min(1, this.dotAge[i] + wallDt / life);
      const t = this.dotAge[i];
      for (let d = 0; d < 3; d++) p[i * 3 + d] = this.dotStart[i * 3 + d] + (this.dotEnd[i * 3 + d] - this.dotStart[i * 3 + d]) * t;
      a[i] = Math.sin(Math.PI * t);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  private drawCells(): void {
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const tan = new Vector3();
    const axis = new Vector3();
    const scale = new Vector3();
    const color = new Color();
    const rc = this.net.capRadius;
    const squeeze = Math.min(1, (rc * 0.95) / RBC_RADIUS);
    let k = 0;
    const f = this.follow;
    for (const c of this.sim.cells) {
      const r = this.net.routes[c.route];
      if (f && c.route === f.route && Math.abs(c.s - f.s) < this.sim.spacing * 0.9) continue;
      sampleLine(r.line, c.s, pos, tan);
      const inCap = c.s >= r.capStart && c.s <= r.capEnd;
      if (inCap) {
        // Single file, disc face to the flow, folded to fit the lumen.
        q.setFromUnitVectors(UP, tan);
        scale.set(squeeze, Math.min(2.2, 1 / squeeze), squeeze);
      } else {
        const R = (c.s < r.capStart ? this.net.artRadius : this.net.venRadius) - RBC_RADIUS;
        const off = c.offset.clone().sub(tan.clone().multiplyScalar(c.offset.dot(tan)));
        pos.addScaledVector(off, R * 0.7);
        axis.copy(tan).addScaledVector(c.offset, c.tilt * 1.5).normalize();
        q.setFromUnitVectors(UP, axis);
        scale.set(1, 1, 1);
      }
      m.compose(pos, q, scale);
      this.cells.setMatrixAt(k, m);
      const [cr, cg, cb] = saturationColorLinear(saturation(c.po2));
      this.cells.setColorAt(k, color.setRGB(cr, cg, cb));
      if (++k >= this.cells.instanceMatrix.count) break;
    }
    this.cells.count = k;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;

    if (f) {
      const r = this.net.routes[f.route];
      sampleLine(r.line, f.s, pos, tan);
      const inCap = f.s >= r.capStart && f.s <= r.capEnd;
      this.followCell.position.copy(pos);
      this.followCell.quaternion.setFromUnitVectors(UP, tan);
      if (inCap) this.followCell.scale.set(squeeze, Math.min(2.2, 1 / squeeze), squeeze);
      else this.followCell.scale.set(1, 1, 1);
      const [cr, cg, cb] = saturationColorLinear(f.saturation);
      (this.followCell.material as MeshStandardMaterial).color.setRGB(cr, cg, cb);
      this.marker.update(pos, f.saturation);
    }
  }

  /** Map the followed cell's body-scale state to a position in this patch. */
  static routeFor(sim: MicroSim, capTransit: number): number {
    let best = 0;
    sim.capTransit.forEach((t, i) => {
      if (Math.abs(t - capTransit) < Math.abs(sim.capTransit[best] - capTransit)) best = i;
    });
    return best;
  }

  static arteriolePart(sim: MicroSim, route: number): number {
    return sim.net.routes[route].capStart / ARTERIOLE_SPEED;
  }

  static venulePart(sim: MicroSim, route: number): number {
    const r = sim.net.routes[route];
    return (r.line.length - r.capEnd) / VENULE_SPEED;
  }

  render(renderer: WebGLRenderer): void {
    const el = renderer.domElement;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const ratio = renderer.getPixelRatio();
    (this.dots.material as ShaderMaterial).uniforms.scale.value = el.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.marker.setPixelRatio(ratio);
    this.controls.update();
    renderer.render(this.scene, this.camera);
  }

  /** Screen pixels per 100 µm at the orbit target. */
  pixelsPer100um(cssHeight: number): number {
    const d = this.camera.position.distanceTo(this.controls.target);
    return (cssHeight / (2 * d * Math.tan((this.camera.fov * Math.PI) / 360))) * 100;
  }

  dispose(): void {
    this.controls.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
