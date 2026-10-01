/** App controller: wires the simulation worker, the 3D scene and the HUD together. */
import { mount } from 'svelte';
import { buildPaths } from '../anatomy/paths';
import { Circulation } from '../sim/circulation';
import type { FromWorker, ToWorker } from '../sim/protocol';
import SimWorker from '../sim/worker.ts?worker&inline';
import { BodyScene } from '../render/scene';
import Hud from '../ui/Hud.svelte';
import { ui } from '../ui/state.svelte';

const circ = new Circulation();
const paths = buildPaths(circ);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new BodyScene(canvas, circ, paths);

ui.cardiacOutput = circ.cardiacOutput;
ui.bloodVolume = circ.totalVolume;

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
  }
};

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
    onResetView: () => scene.resetView(),
  },
});
