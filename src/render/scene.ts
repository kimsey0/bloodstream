/** three.js scene: camera, touch/mouse controls, body, vessels and cells. */
import { BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene, Vector3, WebGLRenderer, type Mesh, type ShaderMaterial } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VesselPaths } from '../anatomy/paths';
import type { Circulation } from '../sim/circulation';
import { createBody } from './body';
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
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
    this.cells.material.uniforms.maxPx.value = 40 * this.renderer.getPixelRatio();
  }
}
