import { describe, expect, it } from 'vitest';
import { REST, TISSUES } from '../src/physiology/params';
import { Circulation } from '../src/sim/circulation';

const circ = new Circulation();
const seg = (id: string) => circ.get(id);
const groupVolume = (pred: (s: (typeof circ.segments)[number]) => boolean) =>
  circ.segments.filter(pred).reduce((a, s) => a + s.volume, 0) / circ.totalVolume;

describe('circulation graph', () => {
  it('conserves flow at every segment', () => {
    for (const s of circ.segments) {
      if (s === circ.root) continue;
      const inflow = s.prevIndex.reduce((a, i) => {
        const p = circ.segments[i];
        const k = p.nextIndex.indexOf(s.index);
        return a + p.flow * (p.nextCumulative[k] - (k > 0 ? p.nextCumulative[k - 1] : 0));
      }, 0);
      expect(inflow, s.id).toBeCloseTo(s.flow, 9);
    }
    expect(circ.returnFlow()).toBeCloseTo(REST.cardiacOutput, 9);
  });

  it('has a total blood volume of about 5 L', () => {
    expect(circ.totalVolume).toBeGreaterThan(4600);
    expect(circ.totalVolume).toBeLessThan(5400);
  });

  it('distributes blood volume as in Guyton (veins 64 %, pulmonary 9 %, heart 7 %, arteries + microvessels 20 %)', () => {
    const veins = groupVolume((s) => s.circuit === 'systemic' && (s.kind === 'vein' || s.kind === 'venule'));
    const pulmonary = groupVolume((s) => s.circuit === 'pulmonary' && s.kind !== 'chamber');
    const heart = groupVolume((s) => s.kind === 'chamber');
    const arterial = groupVolume((s) => s.circuit === 'systemic' && ['artery', 'arteriole', 'capillary'].includes(s.kind));
    expect(veins).toBeCloseTo(0.64, 1);
    expect(pulmonary).toBeCloseTo(0.09, 1);
    expect(heart).toBeCloseTo(0.07, 1);
    expect(arterial).toBeCloseTo(0.2, 1);
  });

  it('delivers each tissue its share of cardiac output', () => {
    for (const [tissue, t] of Object.entries(TISSUES)) {
      const flow = circ.segments
        .filter((s) => s.kind === 'arteriole' && s.tissue === tissue && s.supply !== undefined)
        .reduce((a, s) => a + s.flow, 0);
      expect(flow / REST.cardiacOutput, tissue).toBeCloseTo(t.flowFraction, 6);
    }
    // The liver also receives all portal blood: ~25 % of cardiac output in total.
    expect(seg('liver.cap').flow / REST.cardiacOutput).toBeCloseTo(0.255, 3);
  });

  it('perfuses the hands and feet', () => {
    for (const side of ['L', 'R']) {
      for (const id of [`arm_${side}.hand.skin.cap`, `leg_${side}.foot.skin.cap`]) {
        // Resting hand or foot skin flow is tens of mL/min.
        expect(seg(id).flow * 60, id).toBeGreaterThan(5);
      }
    }
  });

  it('gives realistic mean velocities', () => {
    const cms = (id: string) => seg(id).velocity / 10;
    // Time-averaged aortic velocity ~10–25 cm/s (peak systolic ~100 cm/s).
    expect(cms('aorta_asc')).toBeGreaterThan(10);
    expect(cms('aorta_asc')).toBeLessThan(25);
    // Venae cavae ~5–20 cm/s.
    expect(cms('svc')).toBeGreaterThan(5);
    expect(cms('ivc_thoracic')).toBeLessThan(25);
    // Capillaries ~0.2–1.5 mm/s.
    for (const s of circ.segments.filter((x) => x.kind === 'capillary')) {
      expect(s.velocity, s.id).toBeGreaterThan(0.2);
      expect(s.velocity, s.id).toBeLessThan(1.5);
    }
  });

  it('has a pulmonary capillary transit of ~0.75 s and capillary blood volume of ~70 mL', () => {
    expect(seg('lung_L.cap').transit).toBeCloseTo(0.75, 2);
    const vc = seg('lung_L.cap').volume + seg('lung_R.cap').volume;
    expect(vc).toBeGreaterThan(60);
    expect(vc).toBeLessThan(90);
  });

  it('gives a mean red-cell circulation time just under volume / cardiac output (Fåhraeus effect)', () => {
    const plasmaTime = circ.totalVolume / REST.cardiacOutput;
    expect(plasmaTime).toBeCloseTo(60, -1);
    // Whole-body / large-vessel haematocrit ratio ("F-cell ratio") is ~0.9.
    const fcell = circ.meanRbcCirculationTime / plasmaTime;
    expect(fcell).toBeGreaterThan(0.85);
    expect(fcell).toBeLessThan(0.97);
  });
});
