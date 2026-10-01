/** App controller: wires the simulation worker, the 3D scene and the HUD together. */
import { mount } from 'svelte';
import { buildPaths } from '../anatomy/paths';
import { Circulation } from '../sim/circulation';
import type { FromWorker, ToWorker } from '../sim/protocol';
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
      recordHistory(msg.time, msg.follow.saturation, msg.follow.speed);
    }
  }
};

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

function loop(): void {
  requestTick();
  scene.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

mount(Hud, {
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
      scene.resetView();
    },
    onFollowRandom: () => followCell(-1),
    onStopFollow: stopFollowing,
  },
});
