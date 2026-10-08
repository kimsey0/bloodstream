import { beforeAll, describe, expect, it } from 'vitest';
import { REST, TISSUES } from '../src/physiology/params';
import { Simulation } from '../src/sim/simulation';
import { CellTracker, CirculationRecorder } from '../src/sim/tracking';

const CELLS = 3000;
const DURATION = 600;
const DT = 0.05;

let sim: Simulation;
let rec: CirculationRecorder;
let lvEntries = 0;
/** O2 content lost in exchanging arterioles, summed over cell passages (mL/mL). */
let arteriolarLoss = 0;
const aorta: number[] = [];
const pulmonaryArtery: number[] = [];

beforeAll(() => {
  sim = new Simulation({ cellCount: CELLS, seed: 11 });
  rec = new CirculationRecorder(sim);
  const lv = sim.circulation.root.index;
  // Arterioles that feed a capillary bed exchange O2 too; track what cells lose there.
  const exchanging = (k: number) => sim.circulation.segments[k].kind === 'arteriole' && sim.steady.exchange.has(k);
  const entered = new Float64Array(CELLS).fill(NaN);
  sim.addListener((e) => {
    if (e.to === lv) lvEntries++;
    if (exchanging(e.from) && !Number.isNaN(entered[e.cell])) arteriolarLoss += entered[e.cell] - e.content;
    entered[e.cell] = exchanging(e.to) ? e.content : NaN;
  });
  const asc = sim.circulation.get('aorta_asc').index;
  const pt = sim.circulation.get('pulm_trunk').index;
  for (let i = 0; i < DURATION / DT; i++) {
    sim.step(DT);
    if (i % 100 === 0) {
      for (let c = 0; c < sim.count; c++) {
        if (sim.segment[c] === asc) aorta.push(sim.saturation(c));
        if (sim.segment[c] === pt) pulmonaryArtery.push(sim.saturation(c));
      }
    }
  }
});

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('tracer red cells', () => {
  it('return to the heart at the rate set by volume and cardiac output', () => {
    const rate = lvEntries / CELLS / DURATION;
    expect(1 / rate).toBeCloseTo(sim.circulation.meanRbcCirculationTime, -0.5);
    expect(Math.abs(1 / rate / sim.circulation.meanRbcCirculationTime - 1)).toBeLessThan(0.03);
  });

  it('visit tissues in proportion to their blood flow', () => {
    const lungVisits = rec.visits.filter((v) => sim.circulation.segments[v.segment].exchange?.type === 'lung').length;
    for (const [tissue, t] of Object.entries(TISSUES)) {
      if (tissue === 'liver') continue; // most liver blood arrives via the gut
      const n = rec.visits.filter((v) => {
        const s = sim.circulation.segments[v.segment];
        return s.exchange?.type === 'tissue' && s.tissue === tissue;
      }).length;
      // Lung visits ≈ (1 − bronchial fraction) of all circuits.
      const fraction = (n / lungVisits) * (1 - TISSUES.bronchial.flowFraction);
      expect(Math.abs(fraction / t.flowFraction - 1), tissue).toBeLessThan(0.15);
    }
  });

  it('take different times depending on route: heart shortest, legs longest', () => {
    const lapsVia = (pred: (b: string) => boolean) => rec.laps.filter((l) => l.beds.some(pred)).map((l) => l.duration);
    const coronary = median(lapsVia((b) => b.startsWith('heart_')));
    const brain = median(lapsVia((b) => b.startsWith('brain_')));
    const kidney = median(lapsVia((b) => b.startsWith('kidney_')));
    const foot = median(lapsVia((b) => b.includes('.lower.')));
    expect(coronary).toBeLessThan(brain);
    expect(brain).toBeLessThan(foot);
    expect(kidney).toBeLessThan(foot);
    expect(coronary).toBeGreaterThan(8);
    expect(coronary).toBeLessThan(25);
    expect(foot).toBeGreaterThan(60);
  });

  it('spend ~0.75 s in a pulmonary capillary', () => {
    const lung = rec.visits.filter((v) => sim.circulation.segments[v.segment].exchange?.type === 'lung');
    expect(mean(lung.map((v) => v.transit))).toBeCloseTo(0.75, 1);
  });

  it('reproduce arterial and mixed venous saturations', () => {
    expect(mean(aorta)).toBeGreaterThan(0.965);
    expect(mean(aorta)).toBeLessThan(0.98);
    expect(mean(pulmonaryArtery)).toBeGreaterThan(0.7);
    expect(mean(pulmonaryArtery)).toBeLessThan(0.78);
  });

  it('collectively consume ~250 mL O2/min, in arterioles and capillaries, and load the same amount in the lungs', () => {
    // Each capillary visit represents CO / (circuit rate × cells) of blood.
    const bloodPerVisit = (REST.cardiacOutput * DURATION) / lvEntries; // mL per LV passage
    const sum = (pred: (type: string) => boolean) =>
      rec.visits
        .filter((v) => pred(sim.circulation.segments[v.segment].exchange!.type))
        .reduce((a, v) => a + CirculationRecorder.contentChange(v), 0);
    const tissueVo2 = ((arteriolarLoss - sum((t) => t === 'tissue')) * bloodPerVisit * 60) / DURATION;
    const lungUptake = (sum((t) => t === 'lung') * bloodPerVisit * 60) / DURATION;
    expect(Math.abs(tissueVo2 / REST.vo2 - 1)).toBeLessThan(0.08);
    expect(Math.abs(lungUptake / REST.vo2 - 1)).toBeLessThan(0.08);
  });
});

describe('following one cell', () => {
  it('logs its route, laps, and drives a single haemoglobin molecule', () => {
    const s = new Simulation({ cellCount: 50, seed: 5 });
    const tracker = new CellTracker(s, 0);
    for (let i = 0; i < 300 / 0.01; i++) {
      s.step(0.01);
      tracker.stepMolecule(0.01);
    }
    expect(tracker.lapTimes.length).toBeGreaterThan(1);
    // Every completed circuit passes at least one systemic capillary bed.
    for (const lap of tracker.laps) expect(lap.via.length).toBeGreaterThan(0);
    expect(tracker.route.length).toBeGreaterThan(20);
    for (let i = 1; i < tracker.route.length; i++) {
      expect(tracker.route[i].enter).toBeCloseTo(tracker.route[i - 1].exit!, 9);
    }
    expect(tracker.molecule.bound).toBeGreaterThanOrEqual(0);
    expect(tracker.molecule.bound).toBeLessThanOrEqual(4);
    const dist = tracker.hemoglobinDistribution;
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

describe('speed along lumped arterioles and venules', () => {
  it('slows through arterioles and speeds up through venules, with mean transit unchanged', () => {
    const s = new Simulation({ cellCount: 4000, seed: 3 });
    const ven = s.circulation.get('leg_L.thigh.muscle.ven');
    const art = s.circulation.get('leg_L.thigh.muscle.art');
    for (let c = 0; c < s.count; c++) {
      const seg = s.circulation.segments[s.segment[c]];
      if (seg !== ven && seg !== art) continue;
      const t = s.progress(c);
      const mean = seg.length / s.duration[c];
      if (seg === ven) expect(s.speed(c) / mean).toBeCloseTo(0.25 + 1.5 * t, 6);
      else expect(s.speed(c) / mean).toBeCloseTo(1.75 - 1.5 * t, 6);
      expect(s.positionFraction(c)).toBeGreaterThanOrEqual(0);
      expect(s.positionFraction(c)).toBeLessThanOrEqual(1);
    }
    // Venules start at measured venular RBC speeds (~0.2–4 mm/s) and end at small-vein speeds.
    const meanVen = ven.length / ven.transit;
    expect(meanVen * 0.25).toBeGreaterThan(0.2);
    expect(meanVen * 0.25).toBeLessThan(4);
    expect(meanVen * 1.75).toBeGreaterThan(5);
  });
});

describe('route choice', () => {
  it('decides each cell’s next segment as it enters the current one', () => {
    const s = new Simulation({ cellCount: 500, seed: 5 });
    const planned = Int32Array.from(s.next);
    let checked = 0;
    s.addListener((e) => {
      expect(e.to).toBe(planned[e.cell]);
      expect(s.circulation.segments[e.to].nextIndex).toContain(s.next[e.cell]);
      planned[e.cell] = s.next[e.cell];
      checked++;
    });
    for (let i = 0; i < 100; i++) s.step(0.05);
    expect(checked).toBeGreaterThan(500);
  });
});
