/** three.js scene: camera, touch/mouse controls, body, vessels and cells. */
import { BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene, Vector3, WebGLRenderer, type Mesh, type ShaderMaterial } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VesselPaths } from '../anatomy/paths';
import type { Circulation } from '../sim/circulation';
import { createBody } from './body';
import { FollowMarker } from './follow';
import { cellMaterial, saturationTexture } from './materials';
import { colorVessels, createVessels } from './vessels';

const TARGET = new Vector3(0, 88, 0);

export class BodyScene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private readonly vessels: Mesh;
  private cells?: Points<BufferGeometry, ShaderMaterial>;
  private readonly colormap = saturationTexture();
  private readonly follow = new FollowMarker();
  private followCell: number | null = null;
  private readonly followPos = new Vector3();
  /** 0→1 while the camera flies in to a newly followed cell. */
  private flyIn = 1;
  private lastRender = performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    circ: Circulation,
    paths: VesselPaths,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new PerspectiveCamera(35, 1, 1, 3000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 900;
    this.controls.zoomToCursor = true;
    this.controls.target.copy(TARGET);

    this.scene.add(createBody());
    this.vessels = createVessels(circ, paths);
    this.scene.add(this.vessels);
    this.scene.add(this.follow.marker, this.follow.trail);

    this.resize();
    this.resetView();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** Screen space covered by HUD at the top and bottom, px; the body is framed between them. */
  insets = { top: 70, bottom: 150 };

  /** Frame the whole body for the current aspect ratio, between the HUD bars. */
  resetView(): void {
    const h = this.canvas.clientHeight || 1;
    const w = this.canvas.clientWidth || 1;
    const usable = Math.max(0.4, 1 - (this.insets.top + this.insets.bottom) / h);
    const halfH = 90;
    const halfW = 42;
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = Math.max(halfH / (t * usable), halfW / (t * (w / h))) * 1.04;
    // Shift the target so the body centre lands in the middle of the usable band.
    const worldPerPx = (2 * d * t) / h;
    const target = TARGET.clone();
    target.y -= ((this.insets.bottom - this.insets.top) / 2) * worldPerPx;
    this.controls.target.copy(target);
    this.camera.position.set(0, target.y + 8, d);
    this.camera.lookAt(target);
    this.controls.update();
  }

  setSaturationProfiles(profiles: Float32Array): void {
    colorVessels(this.vessels, profiles);
  }

  /** Create or update the tracer cell point cloud. */
  setCells(positions: Float32Array, saturations: Float32Array): void {
    if (!this.cells || this.cells.geometry.getAttribute('position').count !== saturations.length) {
      if (this.cells) {
        this.scene.remove(this.cells);
        this.cells.geometry.dispose();
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(positions.length), 3));
      g.setAttribute('saturation', new BufferAttribute(new Float32Array(saturations.length), 1));
      this.cells = new Points(g, cellMaterial(this.colormap));
      this.cells.frustumCulled = false;
      this.cells.renderOrder = 0;
      this.scene.add(this.cells);
      this.updateProjection();
    }
    const pos = this.cells.geometry.getAttribute('position') as BufferAttribute;
    const sat = this.cells.geometry.getAttribute('saturation') as BufferAttribute;
    (pos.array as Float32Array).set(positions);
    (sat.array as Float32Array).set(saturations);
    pos.needsUpdate = true;
    sat.needsUpdate = true;
    if (this.followCell !== null && this.followCell < saturations.length) {
      const i = this.followCell * 3;
      this.followPos.set(positions[i], positions[i + 1], positions[i + 2]);
      this.follow.update(this.followPos, saturations[this.followCell]);
    }
  }

  /** Start (cell index) or stop (null) following a cell with the camera. */
  setFollow(cell: number | null): void {
    if (cell === this.followCell) return;
    this.followCell = cell;
    this.follow.show(cell !== null);
    this.follow.clearTrail();
    this.flyIn = cell === null ? 1 : 0;
  }

  /** Index of the cell drawn nearest to a screen point (CSS px), or null if none within reach. */
  pick(clientX: number, clientY: number, maxDistPx = 28): number | null {
    if (!this.cells) return null;
    const rect = this.canvas.getBoundingClientRect();
    const arr = this.cells.geometry.getAttribute('position').array as Float32Array;
    const m = this.camera.projectionMatrix.clone().multiply(this.camera.matrixWorldInverse).elements;
    let best: number | null = null;
    let bestD = maxDistPx * maxDistPx;
    let bestDepth = Infinity;
    for (let i = 0; i < arr.length / 3; i++) {
      const x = arr[i * 3];
      const y = arr[i * 3 + 1];
      const z = arr[i * 3 + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 0) continue;
      const sx = rect.left + ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * rect.width;
      const sy = rect.top + (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w + 1) * 0.5) * rect.height;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      // Prefer nearer cells when several are under the finger.
      if (d < bestD || (d < bestD * 1.5 && w < bestDepth)) {
        bestD = Math.min(d, bestD);
        bestDepth = w;
        best = i;
      }
    }
    return best;
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    this.lastRender = now;
    if (this.followCell !== null) this.trackCamera(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Keep the followed cell at the orbit centre; on a new follow, fly in to ~30 cm. */
  private trackCamera(dt: number): void {
    const target = this.controls.target;
    if (this.flyIn < 1) {
      this.flyIn = Math.min(1, this.flyIn + dt / 1.2);
      const k = 1 - Math.pow(1 - this.flyIn, 3);
      const offset = this.camera.position.clone().sub(target);
      const dist = offset.length();
      const wanted = Math.min(dist, 45);
      offset.setLength(dist + (wanted - dist) * k);
      target.lerp(this.followPos, k);
      this.camera.position.copy(target).add(offset);
    } else {
      const delta = this.followPos.clone().sub(target);
      target.add(delta);
      this.camera.position.add(delta);
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateProjection();
  }

  /** Pixels per world unit at distance 1, for sizing point sprites. */
  private updateProjection(): void {
    if (!this.cells) return;
    const h = this.renderer.domElement.height;
    this.cells.material.uniforms.projScale.value = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.cells.material.uniforms.minPx.value = 2.2 * this.renderer.getPixelRatio();
    this.cells.material.uniforms.maxPx.value = 16 * this.renderer.getPixelRatio();
    this.follow.setPixelRatio(this.renderer.getPixelRatio());
  }
}
