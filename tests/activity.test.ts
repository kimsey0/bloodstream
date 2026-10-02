import { describe, expect, it } from 'vitest';
import { activityState } from '../src/physiology/activity';
import { Circulation } from '../src/sim/circulation';
import { solveSteadyState } from '../src/sim/oxygen';

const levels = [0, 0.25, 0.6, 1].map((l) => {
  const a = activityState(l);
  const circ = new Circulation({ activity: a });
  return { a, circ, ss: solveSteadyState(circ) };
});
const max = levels[3];

describe('activity levels', () => {
  it('raise cardiac output from 5 to 22 L/min and heart rate from 70 to 185', () => {
    expect(levels.map((l) => Math.round(l.circ.cardiacOutput * 0.06))).toEqual([5, 9, 16, 22]);
    expect(levels.map((l) => l.a.heartRate)).toEqual([70, 100, 145, 185]);
    for (const { circ } of levels) expect(circ.returnFlow()).toBeCloseTo(circ.cardiacOutput, 6);
  });

  it('take up exactly the whole-body VO2 in the lungs (Fick)', () => {
    for (const { a, circ, ss } of levels) {
      const uptake = ['lung_L.cap', 'lung_R.cap'].reduce((acc, id) => {
        const o = ss.segments[circ.get(id).index];
        return acc + (o.contentOut - o.contentIn) * circ.get(id).flow * 60;
      }, 0);
      expect(uptake / a.vo2).toBeCloseTo(1, 3);
    }
  });

  it('send ~85 % of cardiac output to muscle at maximal exercise, mostly to the legs', () => {
    const muscle = max.circ.segments.filter((s) => s.tissue === 'muscle' && s.exchange).reduce((acc, s) => acc + s.flow, 0);
    expect(muscle / max.circ.cardiacOutput).toBeGreaterThan(0.8);
    const legs = max.circ.segments.filter((s) => s.tissue === 'muscle' && s.exchange && s.region.startsWith('leg_')).reduce((acc, s) => acc + s.flow, 0);
    expect(legs / muscle).toBeGreaterThan(0.7);
    // Kidneys fall to roughly a quarter of resting flow.
    const kid = (c: Circulation) => c.get('kidney_L.cap').flow;
    expect(kid(max.circ) / kid(levels[0].circ)).toBeLessThan(0.35);
  });

  it('keeps arterial blood saturated while venous saturation falls', () => {
    // At maximal work arterial SO2 dips to ~94–96 %: a widening alveolar–arterial gap, plus
    // warm, acidic blood (Dempsey & Wagner 1999).
    for (const { ss } of levels) expect(ss.arterial.saturationIn).toBeGreaterThan(0.93);
    const mv = levels.map((l) => l.ss.mixedVenous.saturationIn);
    for (let i = 1; i < mv.length; i++) expect(mv[i]).toBeLessThan(mv[i - 1]);
    // Mixed venous ~20–30 % and femoral venous ~10–25 % at maximal exercise.
    expect(mv[3]).toBeGreaterThan(0.18);
    expect(mv[3]).toBeLessThan(0.32);
    const thigh = max.ss.segments[max.circ.get('leg_L.thigh.muscle.cap').index].saturationOut;
    expect(thigh).toBeGreaterThan(0.08);
    expect(thigh).toBeLessThan(0.25);
  });

  it('shortens pulmonary capillary transit to ~0.35–0.45 s at maximal exercise despite recruitment', () => {
    const t = max.circ.get('lung_L.cap').transit;
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThan(0.45);
  });

  it('makes working-muscle venous blood hot, acidic and high in CO2 at maximal exercise', () => {
    const femoral = max.ss.segments[max.circ.get('femoral_vein_L').index].conditionsIn;
    expect(femoral.pco2).toBeGreaterThan(50);
    expect(femoral.pco2).toBeLessThan(70);
    expect(femoral.pH).toBeGreaterThan(7.0);
    expect(femoral.pH).toBeLessThan(7.2);
    expect(femoral.temperature).toBeGreaterThan(39);
    // Arterial blood: hyperventilation lowers PCO2, lactate lowers pH, and the body warms.
    const art = max.ss.arterial.conditionsIn;
    expect(art.pco2).toBeLessThan(36);
    expect(art.pH).toBeGreaterThan(7.25);
    expect(art.pH).toBeLessThan(7.35);
    expect(art.temperature).toBeGreaterThan(38);
    // The brain makes no lactate and little heat: only CO2 changes its blood.
    const brain = max.ss.exchange.get(max.circ.get('brain_L.cap').index)!;
    expect(brain.conditionsOut.temperature).toBeCloseTo(art.temperature, 6);
  });

  it('cuts mean circulation time to ~13 s at maximal exercise', () => {
    expect(max.circ.meanRbcCirculationTime).toBeGreaterThan(10);
    expect(max.circ.meanRbcCirculationTime).toBeLessThan(16);
  });
});

describe('switching activity during a simulation', () => {
  it('keeps every cell and settles to the new circulation rate', async () => {
    const { Simulation } = await import('../src/sim/simulation');
    const sim = new Simulation({ cellCount: 2000, seed: 21 });
    for (let i = 0; i < 200; i++) sim.step(0.05);
    sim.setState(max.circ, max.ss, max.a.heartRate);
    const lv = sim.circulation.root.index;
    let entries = 0;
    sim.addListener((e) => {
      if (e.to === lv) entries++;
    });
    for (let i = 0; i < 300 / 0.02; i++) sim.step(0.02);
    const meanLap = (sim.count * 300) / entries;
    expect(Math.abs(meanLap / max.circ.meanRbcCirculationTime - 1)).toBeLessThan(0.08);
    for (let c = 0; c < sim.count; c++) expect(sim.saturation(c)).toBeGreaterThanOrEqual(0);
  });
});
