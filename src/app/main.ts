/** App controller: wires the simulation worker, the 3D scene and the HUD together. */
import { mount } from 'svelte';
import { COLOR_SCALES, setColorScale, type ColorScale } from '../color/saturation';
import { setHaemoglobin, virtualPo2Factor } from '../physiology/dissociation';
import type { Scenario } from '../physiology/scenario';
import { myoglobinSaturation } from '../physiology/params';
import { meanCapillaryPo2, transitQuadrature } from '../sim/oxygen';
import { BED_CENTERS } from '../anatomy/layout';
import { buildPaths } from '../anatomy/paths';
import { activityState } from '../physiology/activity';
import { Circulation } from '../sim/circulation';
import { microBedFor } from '../micro/beds';
import { ARTERIOLE_SPEED, MicroSim, VENULE_SPEED } from '../micro/microSim';
import { buildNetwork } from '../micro/network';
import { HB_PER_RBC } from '../physiology/hemoglobin';
import type { ExchangeInfo, FollowInfo, FromWorker, ToWorker } from '../sim/protocol';
import { MicroScene } from '../render/microScene';
import SimWorker from '../sim/worker.ts?worker&inline';
import { BodyScene } from '../render/scene';
import Hud from '../ui/Hud.svelte';
import { history, ui } from '../ui/state.svelte';

// Restore the saved colour scale before anything is coloured.
try {
  const saved = localStorage.getItem('bloodstream.colorScale') as ColorScale | null;
  if (saved && COLOR_SCALES.includes(saved)) {
    setColorScale(saved);
    ui.colorScale = saved;
  }
} catch {
  // Storage blocked: keep the default.
}

const circ = new Circulation();
const paths = buildPaths(circ);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = new BodyScene(canvas, circ, paths);

ui.cardiacOutput = circ.cardiacOutput;
ui.bloodVolume = circ.totalVolume;
ui.segmentNames = circ.segments.map((s) => s.name);
ui.segmentKinds = circ.segments.map((s) => s.kind);
ui.segmentRegions = circ.segments.map((s) => s.region);

const worker: Worker = new SimWorker();
const send = (msg: ToWorker, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);

// Fewer tracers on small screens / few cores.
const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency ?? 4) <= 4;
send({ type: 'init', cellCount: small ? 3000 : 8000, seed: 1, lut: paths.lut, radius: paths.radius, pathBase: paths.pathBase, pathCount: paths.pathCount, bedOfSegment: paths.bedOfSegment, pathStart: paths.pathStart, pathEnd: paths.pathEnd });

let awaitingFrame = false;
let lastTick = performance.now();
let spare: { positions?: Float32Array; saturations?: Float32Array } = {};

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === 'ready' || msg.type === 'state') {
    scene.setSaturationProfiles(msg.profiles);
    ui.cellCount = msg.cellCount;
    ui.arterialSaturation = msg.arterialSaturation;
    ui.mixedVenousSaturation = msg.mixedVenousSaturation;
    ui.arterialPo2 = msg.arterialPo2;
    ui.mixedVenousPo2 = msg.mixedVenousPo2;
    ui.arterialConditions = msg.arterialConditions;
    ui.mixedVenousConditions = msg.mixedVenousConditions;
    ui.meanCirculationTime = msg.meanCirculationTime;
    ui.activity = msg.activity;
    ui.cardiacOutput = msg.activity.cardiacOutput;
    transitNow = msg.transits;
    setHaemoglobin(msg.scenario);
    ui.scenario = msg.scenario;
    ui.scenarioPending = null;
    ui.demandedCardiacOutput = msg.demandedCardiacOutput;
    for (const ex of msg.exchange) {
      exchange.set(ex.segment, ex);
      ui.bedSaturation[ex.segment] = [ex.saturationIn, ex.saturationOut];
    }
    if (msg.type === 'state') {
      ui.activityPending = null;
      // Rebuild an open microscope view with the new flows and O2 use.
      if (ui.micro) openBed(ui.micro.capillary, { keepFollow: true });
      return;
    }
    ui.ready = true;
    try {
      ui.hintOpen = localStorage.getItem('bloodstream.hintSeen') !== '1';
    } catch {
      ui.hintOpen = true;
    }
    lastTick = performance.now();
    requestTick();
  } else if (msg.type === 'rejected') {
    // Beyond this body's limits: the previous state stays.
    ui.activityPending = null;
    ui.scenarioPending = null;
    const seg = circ.byId.get(msg.segment);
    ui.limit = {
      level: msg.level,
      organ: (seg?.name ?? msg.segment).replace(/: .*$/, ''),
      label: activityState(msg.level).label,
    };
  } else if (msg.type === 'frame') {
    awaitingFrame = false;
    framesReceived++;
    if (ui.view === 'body' && msg.positionsValid) scene.setCells(msg.positions, msg.saturations);
    ui.time = msg.time;
    ui.beatPhase = msg.beatPhase;
    ui.systole = msg.systole;
    scene.setBeat(msg.beatPhase, msg.systole);
    spare = { positions: msg.positions, saturations: msg.saturations };
    if (msg.follow && wantFollow) {
      if (ui.follow?.cell !== msg.follow.cell) clearHistory();
      scene.setFollow(msg.follow.cell);
      ui.follow = msg.follow;
      ui.followBed = bedOf(msg.follow.segment);
      recordHistory(msg.time, msg.follow);
    }
  }
};

const exchange = new Map<number, ExchangeInfo>();
/** Mean red-cell transit of every segment in the current state, s (flows change with activity and scenario). */
let transitNow: ArrayLike<number> = Float32Array.from(circ.segments, (s) => s.transit);

function setActivity(level: number): void {
  ui.activityPending = level;
  ui.limit = null;
  send({ type: 'activity', level, scenario: { ...ui.scenario } });
}

function setScenario(scenario: Scenario): void {
  ui.scenarioPending = scenario;
  ui.limit = null;
  send({ type: 'activity', level: ui.activity.level, scenario });
}

/** Organ bed centres for tap-to-zoom, with the capillary segment each one opens. */
const bedCaps: number[] = [];
const bedPoints = new Float32Array(
  Object.entries(BED_CENTERS).flatMap(([prefix, p]) => {
    const cap = circ.byId.get(`${prefix}.cap`);
    if (!cap?.exchange) return [];
    bedCaps.push(cap.index);
    return p;
  }),
);

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
/** Route of a microscope cell the user just tapped, applied once the worker reports the new followed cell. */
let adoptedRoute: { route: number; afterTick: number } | null = null;
/** Ticks sent / frames received; they pair one-to-one, so a frame's number says which tick it answers. */
let ticksSent = 0;
let framesReceived = 0;

/** Follow the microscope cell under a tap: a body-scale tracer takes over its exact place. */
function adoptMicroCell(m: MicroScene, clientX: number, clientY: number): boolean {
  const c = m.pickCell(clientX, clientY, canvas.getBoundingClientRect());
  if (!c || !ui.micro) return false;
  const capSeg = circ.segments[ui.micro.capillary];
  const r = m.net.routes[c.route];
  let segment: number;
  let elapsed: number;
  let duration: number;
  if (c.s < r.capStart) {
    // Still in the terminal arteriole: the end of the bed's feeding segment.
    segment = capSeg.prevIndex[0];
    const remaining = (r.capStart - c.s) / ARTERIOLE_SPEED;
    duration = Math.max(transitNow[segment], remaining * 1.01);
    elapsed = duration - remaining;
  } else if (c.s <= r.capEnd) {
    segment = capSeg.index;
    duration = m.sim.capTransit[c.route];
    elapsed = ((c.s - r.capStart) / (r.capEnd - r.capStart)) * duration;
  } else {
    // In the collecting venule: the start of the bed's draining segment.
    segment = capSeg.nextIndex[0];
    elapsed = (c.s - r.capEnd) / VENULE_SPEED;
    duration = Math.max(transitNow[segment], elapsed * 1.5);
  }
  adoptedRoute = { route: c.route, afterTick: ticksSent };
  wantFollow = true;
  send({ type: 'adopt', segment, elapsed, duration, content: c.content });
  return true;
}

function chooseColorScale(scale: ColorScale): void {
  if (scale === ui.colorScale) return;
  setColorScale(scale);
  ui.colorScale = scale;
  try {
    localStorage.setItem('bloodstream.colorScale', scale);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  scene.recolor();
  // The microscope colours its vessels when built; rebuild it in place.
  if (ui.micro) openBed(ui.micro.capillary, { keepFollow: true });
}

function openBed(capillary: number, opts: { keepFollow?: boolean } = {}): void {
  const seg = circ.segments[capillary];
  const transit = transitNow[capillary];
  const keepRoute = opts.keepFollow ? microRoute : -1;
  // Keep the camera when rebuilding the same bed.
  const view = micro && ui.micro?.capillary === capillary ? { pos: micro.camera.position.clone(), target: micro.controls.target.clone() } : null;
  const ex = exchange.get(capillary);
  if (!ex) return;
  closeBed();
  const bed = microBedFor(seg);
  const net = buildNetwork(bed, seg.length * 1000, seg.diameter * 1000);
  const sim = new MicroSim(net, {
    transit,
    transitCv: seg.transitCv ?? 0,
    hctRatio: seg.hct,
    exchange: ex.model,
    contentIn: ex.contentIn,
  });
  micro = new MicroScene(canvas, bed, net, sim, ex.saturationIn, ex.saturationOut);
  scene.controls.enabled = false;
  microRoute = keepRoute;
  if (view) {
    micro.camera.position.copy(view.pos);
    micro.controls.target.copy(view.target);
    micro.controls.update();
  }
  ui.pickerOpen = false;
  ui.tapMenu = null;
  ui.view = 'micro';
  ui.micro = {
    capillary,
    label: bed.label,
    blurb: bed.blurb,
    lengthUm: seg.length * 1000,
    diameterUm: seg.diameter * 1000,
    transit,
    speedUm: (seg.length * 1000) / transit,
    saturationIn: ex.saturationIn,
    saturationOut: ex.saturationOut,
    dotsPerPass: (Math.abs(ex.saturationIn - ex.saturationOut) * 4 * HB_PER_RBC) / 1e9,
    fiberLabel: bed.fiberLabel,
    lung: seg.exchange?.type === 'lung',
    targetPo2: ex.model.targetPo2,
    meanCapillaryPo2: meanCapillaryPo2(ex.model, ex.contentIn, transitQuadrature(transit, seg.transitCv ?? 0)),
    diffusingCapacity: ex.model.diffusingCapacity,
    restDiffusingCapacity: ex.model.restDiffusingCapacity,
    myoglobin: seg.tissue === 'muscle' || seg.tissue === 'heart' ? myoglobinSaturation(ex.model.targetPo2) : null,
  };
}

function dismissHint(): void {
  ui.hintOpen = false;
  try {
    localStorage.setItem('bloodstream.hintSeen', '1');
  } catch {
    // Storage unavailable: the hint simply shows again next time.
  }
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
  // Frames answering ticks sent after the adopt message already reflect the new cell.
  if (adoptedRoute && framesReceived > adoptedRoute.afterTick) {
    microRoute = adoptedRoute.route;
    adoptedRoute = null;
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
  history.p.length = 0;
  history.c.length = 0;
  history.f.length = 0;
}

function recordHistory(t: number, f: FollowInfo): void {
  const last = history.t.at(-1);
  if (last !== undefined && t <= last) return;
  history.t.push(t);
  history.s.push(f.saturation);
  history.v.push(f.speed);
  history.p.push(f.po2);
  history.c.push(f.content);
  history.f.push(virtualPo2Factor(f.conditions));
  // Keep ~2 minutes of body time, but never more than a few thousand samples.
  while (history.t.length > 4000 || (history.t.length && history.t[0] < t - 130)) {
    history.t.shift();
    history.s.shift();
    history.v.shift();
    history.p.shift();
    history.c.shift();
    history.f.shift();
  }
}

// Tap (not drag) on the scene: near an organ, offer to zoom in or follow; elsewhere, follow the nearest cell.
let down: { x: number; y: number; t: number; menuWasOpen: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), menuWasOpen: !!ui.tapMenu } : null;
  ui.tapMenu = null;
  if (ui.hintOpen) dismissHint();
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 400;
  const wasOpen = down.menuWasOpen;
  down = null;
  if (wasOpen) return;
  if (moved > 6 || !quick || !ui.ready) return;
  if (ui.view === 'micro') {
    if (micro) adoptMicroCell(micro, e.clientX, e.clientY);
    return;
  }
  const cell = scene.pick(e.clientX, e.clientY);
  const bed = scene.nearestOnScreen(bedPoints, e.clientX, e.clientY, 36);
  if (bed !== null) ui.tapMenu = { x: e.clientX, y: e.clientY, cell, bed: bedCaps[bed] };
  else if (cell !== null) followCell(cell);
});

function requestTick(): void {
  if (awaitingFrame || !ui.ready) return;
  const now = performance.now();
  const wallDt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  awaitingFrame = true;
  const transfer = [spare.positions?.buffer, spare.saturations?.buffer].filter((b): b is ArrayBuffer => !!b);
  ticksSent++;
  send({ type: 'tick', wallDt, skipPositions: ui.view !== 'body', ...spare }, transfer);
  spare = {};
}

/** Frame the body between the HUD's top bar and the dock, whatever height the dock has. */
function fitBodyView(): void {
  const dock = document.getElementById('dock');
  if (dock) scene.insets.bottom = canvas.clientHeight - dock.getBoundingClientRect().top + 12;
  scene.resetView();
}

/**
 * Adaptive quality: if frames take longer than ~24 ms (under ~40 fps) for a sustained stretch,
 * lower the drawing resolution a notch. Never raise it again, to avoid oscillating.
 */
const PIXEL_RATIO_STEPS = [2, 1.5, 1.25, 1];
let ratioStep = 0;
let frameAvg = 16;
let slowFrames = 0;
function adaptQuality(frameMs: number): void {
  if (!ui.ready || document.hidden || frameMs > 250) return;
  frameAvg += (frameMs - frameAvg) * 0.05;
  slowFrames = frameAvg > 24 ? slowFrames + 1 : 0;
  if (slowFrames > 90 && ratioStep < PIXEL_RATIO_STEPS.length - 1 && window.devicePixelRatio > PIXEL_RATIO_STEPS[ratioStep + 1]) {
    ratioStep++;
    scene.setMaxPixelRatio(PIXEL_RATIO_STEPS[ratioStep]);
    slowFrames = 0;
    frameAvg = 16;
  }
}

let lastFrame = performance.now();
function loop(): void {
  requestTick();
  const now = performance.now();
  adaptQuality(now - lastFrame);
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
    onActivity: setActivity,
    onScenario: setScenario,
    onStopFollow: stopFollowing,
    onOpenBed: openBed,
    onFollowCell: (cell: number) => {
      ui.tapMenu = null;
      followCell(cell);
    },
    onDismissHint: dismissHint,
    onColorScale: chooseColorScale,
    allBeds: () => bedCaps.slice(),
    onBackToBody: closeBed,
    onMicroReset: () => micro?.resetView(),
    capillaryIndex: (id: string) => circ.get(id).index,
  },
});

void hud;
requestAnimationFrame(fitBodyView);

// Sheets sit just above the dock, whose height changes with screen width.
const dockEl = document.getElementById('dock');
if (dockEl) {
  const setDockSpace = () =>
    document.documentElement.style.setProperty('--dock-space', `${Math.round(window.innerHeight - dockEl.getBoundingClientRect().top)}px`);
  new ResizeObserver(setDockSpace).observe(dockEl);
  window.addEventListener('resize', setDockSpace);
  setDockSpace();
}
