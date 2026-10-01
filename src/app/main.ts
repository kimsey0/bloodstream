/** App controller: wires the simulation worker, the 3D scene and the HUD together. */
import { mount } from 'svelte';
import { buildPaths } from '../anatomy/paths';
import { Circulation } from '../sim/circulation';
import { microBedFor } from '../micro/beds';
import { MicroSim } from '../micro/microSim';
import { buildNetwork } from '../micro/network';
import { STANDARD_CONDITIONS } from '../physiology/dissociation';
import { HB_PER_RBC } from '../physiology/hemoglobin';
import type { ExchangeInfo, FollowInfo, FromWorker, ToWorker } from '../sim/protocol';
import { MicroScene } from '../render/microScene';
import SimWorker from '../sim/worker.ts?worker&inline';
import { BodyScene } from '../render/scene';
import Hud from '../ui/Hud.svelte';
import { history, ui } from '../ui/state.svelte';

const circ = new Circulation();
const paths = buildPaths(circ);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new BodyScene(canvas, circ, paths);

ui.cardiacOutput = circ.cardiacOutput;
ui.bloodVolume = circ.totalVolume;
ui.segmentNames = circ.segments.map((s) => s.name);
ui.segmentKinds = circ.segments.map((s) => s.kind);

const worker: Worker = new SimWorker();
const send = (msg: ToWorker, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);

// Fewer tracers on small screens / few cores.
const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency ?? 4) <= 4;
send({ type: 'init', cellCount: small ? 3000 : 8000, seed: 1, lut: paths.lut, radius: paths.radius });

let awaitingFrame = false;
let lastTick = performance.now();
let spare: { positions?: Float32Array; saturations?: Float32Array } = {};

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'ready') {
    scene.setSaturationProfiles(msg.profiles);
    ui.cellCount = msg.cellCount;
    ui.arterialSaturation = msg.arterialSaturation;
    ui.mixedVenousSaturation = msg.mixedVenousSaturation;
    ui.meanCirculationTime = msg.meanCirculationTime;
    for (const ex of msg.exchange) {
      exchange.set(ex.segment, ex);
      ui.bedSaturation[ex.segment] = [ex.saturationIn, ex.saturationOut];
    }
    ui.ready = true;
    lastTick = performance.now();
    requestTick();
  } else if (msg.type === 'frame') {
    awaitingFrame = false;
    scene.setCells(msg.positions, msg.saturations);
    ui.time = msg.time;
    spare = { positions: msg.positions, saturations: msg.saturations };
    if (msg.follow && wantFollow) {
      if (ui.follow?.cell !== msg.follow.cell) clearHistory();
      scene.setFollow(msg.follow.cell);
      ui.follow = msg.follow;
      ui.followBed = bedOf(msg.follow.segment);
      recordHistory(msg.time, msg.follow.saturation, msg.follow.speed);
    }
  }
};

const exchange = new Map<number, ExchangeInfo>();

/** Capillary segment index of the microcirculation a segment belongs to, or -1 for named vessels. */
function bedOf(segment: number): number {
  const id = circ.segments[segment].id;
  const dot = id.lastIndexOf('.');
  if (dot < 0) return -1;
  const cap = circ.byId.get(`${id.slice(0, dot)}.cap`);
  return cap?.exchange ? cap.index : -1;
}

// ---- Microscope view ------------------------------------------------------

let micro: MicroScene | null = null;
/** Route the followed cell takes through the open patch on its current visit. */
let microRoute = -1;

function openBed(capillary: number): void {
  const seg = circ.segments[capillary];
  const ex = exchange.get(capillary);
  if (!ex) return;
  closeBed();
  const bed = microBedFor(seg);
  const net = buildNetwork(bed, seg.length * 1000, seg.diameter * 1000);
  const sim = new MicroSim(net, {
    transit: seg.transit,
    transitCv: seg.transitCv ?? 0,
    hctRatio: seg.hct,
    exchange: { conductance: ex.conductance, targetPo2: ex.targetPo2, conditions: STANDARD_CONDITIONS },
    po2In: ex.po2In,
  });
  micro = new MicroScene(canvas, bed, net, sim, ex.saturationIn, ex.saturationOut);
  scene.controls.enabled = false;
  microRoute = -1;
  ui.pickerOpen = false;
  ui.view = 'micro';
  ui.micro = {
    capillary,
    label: bed.label,
    blurb: bed.blurb,
    lengthUm: seg.length * 1000,
    diameterUm: seg.diameter * 1000,
    transit: seg.transit,
    speedUm: (seg.length * 1000) / seg.transit,
    saturationIn: ex.saturationIn,
    saturationOut: ex.saturationOut,
    dotsPerPass: (Math.abs(ex.saturationIn - ex.saturationOut) * 4 * HB_PER_RBC) / 1e9,
    fiberLabel: bed.fiberLabel,
    lung: seg.exchange?.type === 'lung',
  };
}

function closeBed(): void {
  micro?.dispose();
  micro = null;
  scene.controls.enabled = true;
  ui.view = 'body';
  ui.micro = null;
}

/** Place the followed cell in the open patch while it is in the bed's arterioles, capillaries or venules. */
function mapFollowToMicro(m: MicroScene, f: FollowInfo | null): void {
  const cap = ui.micro!.capillary;
  if (!f) {
    ui.microFollow = 'none';
    m.setFollow(null);
    return;
  }
  const capSeg = circ.segments[cap];
  const inPred = capSeg.prevIndex.includes(f.segment);
  const inSucc = capSeg.nextIndex.includes(f.segment);
  const inCap = f.segment === cap;
  if (!inPred && !inCap && !inSucc) {
    microRoute = -1;
    ui.microFollow = bedOf(f.segment) === cap ? 'approaching' : 'elsewhere';
    m.setFollow(null);
    return;
  }
  if (microRoute < 0) microRoute = MicroScene.routeFor(m.sim, inCap ? f.segmentDuration : m.sim.params.transit);
  const r = m.net.routes[microRoute];
  let s: number | null = null;
  if (inPred) {
    const remaining = f.segmentDuration - f.segmentElapsed;
    const part = MicroScene.arteriolePart(m.sim, microRoute);
    if (remaining < part) s = r.capStart * (1 - remaining / part);
  } else if (inCap) {
    s = r.capStart + f.progress * (r.capEnd - r.capStart);
  } else {
    const part = MicroScene.venulePart(m.sim, microRoute);
    if (f.segmentElapsed < part) s = r.capEnd + (r.line.length - r.capEnd) * (f.segmentElapsed / part);
  }
  if (s === null) {
    ui.microFollow = inSucc ? 'elsewhere' : 'approaching';
    m.setFollow(null);
    if (inSucc) microRoute = -1;
    return;
  }
  ui.microFollow = 'here';
  m.setFollow({ route: microRoute, s, saturation: f.saturation });
}

/** False between "stop" and the worker acknowledging it, so stale frames don't restart following. */
let wantFollow = false;

function followCell(cell: number): void {
  wantFollow = true;
  send({ type: 'follow', cell });
}

function stopFollowing(): void {
  wantFollow = false;
  send({ type: 'follow', cell: null });
  ui.follow = null;
  ui.followBed = -1;
  scene.setFollow(null);
  clearHistory();
}

function clearHistory(): void {
  history.t.length = 0;
  history.s.length = 0;
  history.v.length = 0;
}

function recordHistory(t: number, s: number, v: number): void {
  const last = history.t.at(-1);
  if (last !== undefined && t <= last) return;
  history.t.push(t);
  history.s.push(s);
  history.v.push(v);
  // Keep ~2 minutes of body time, but never more than a few thousand samples.
  while (history.t.length > 4000 || (history.t.length && history.t[0] < t - 130)) {
    history.t.shift();
    history.s.shift();
    history.v.shift();
  }
}

// Tap (not drag) on the scene picks the nearest cell.
let down: { x: number; y: number; t: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 400;
  down = null;
  if (moved > 6 || !quick || !ui.ready) return;
  if (ui.view !== 'body') return;
  const cell = scene.pick(e.clientX, e.clientY);
  if (cell !== null) followCell(cell);
});

function requestTick(): void {
  if (awaitingFrame || !ui.ready) return;
  const now = performance.now();
  const wallDt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  awaitingFrame = true;
  const transfer = [spare.positions?.buffer, spare.saturations?.buffer].filter((b): b is ArrayBuffer => !!b);
  send({ type: 'tick', wallDt, ...spare }, transfer);
  spare = {};
}

/** Frame the body between the HUD's top bar and the dock, whatever height the dock has. */
function fitBodyView(): void {
  const dock = document.getElementById('dock');
  if (dock) scene.insets.bottom = canvas.clientHeight - dock.getBoundingClientRect().top + 12;
  scene.resetView();
}

let lastFrame = performance.now();
function loop(): void {
  requestTick();
  const now = performance.now();
  const wallDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (micro && ui.micro) {
    const dt = ui.paused || !ui.ready ? 0 : Math.min(0.1, wallDt * ui.speed);
    mapFollowToMicro(micro, ui.follow);
    micro.update(dt, wallDt, ui.speed);
    micro.render(scene.renderer);
    const px = micro.pixelsPer100um(canvas.clientHeight);
    if (Math.abs(px / ui.microScalePx - 1) > 0.01) ui.microScalePx = px;
  } else {
    scene.render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const hud = mount(Hud, {
  target: document.getElementById('hud')!,
  props: {
    onSpeed: (speed: number) => {
      ui.speed = speed;
      send({ type: 'control', speed });
    },
    onPause: (paused: boolean) => {
      ui.paused = paused;
      send({ type: 'control', paused });
    },
    onResetView: () => {
      if (ui.follow) stopFollowing();
      fitBodyView();
    },
    onFollowRandom: () => followCell(-1),
    onStopFollow: stopFollowing,
    onOpenBed: openBed,
    onBackToBody: closeBed,
    onMicroReset: () => micro?.resetView(),
    capillaryIndex: (id: string) => circ.get(id).index,
  },
});

void hud;
requestAnimationFrame(fitBodyView);
