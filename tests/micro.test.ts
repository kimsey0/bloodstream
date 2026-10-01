import { describe, expect, it } from 'vitest';
import { saturation } from '../src/physiology/dissociation';
import { MICRO_BEDS, microBedFor } from '../src/micro/beds';
import { MicroSim, MOLECULES_PER_DOT } from '../src/micro/microSim';
import { buildNetwork } from '../src/micro/network';
import { Circulation } from '../src/sim/circulation';
import { solveSteadyState } from '../src/sim/oxygen';

const circ = new Circulation();
const ss = solveSteadyState(circ);

function setup(capId: string) {
  const seg = circ.get(capId);
  const bed = microBedFor(seg);
  const net = buildNetwork(bed, seg.length * 1000, seg.diameter * 1000);
  const sim = new MicroSim(net, {
    transit: seg.transit,
    transitCv: seg.transitCv ?? 0,
    hctRatio: seg.hct,
    exchange: ss.exchange.get(seg.index)!,
    po2In: ss.segments[seg.index].po2In,
  });
  return { seg, net, sim };
}

describe('microscope capillary networks', () => {
  it('fit every capillary to the modelled capillary length', () => {
    for (const b of MICRO_BEDS) {
      const seg = circ.get(b.capillary);
      const net = buildNetwork(b, seg.length * 1000, seg.diameter * 1000);
      expect(net.routes.length).toBe(b.capillaries);
      for (const r of net.routes) {
        expect(Math.abs((r.capEnd - r.capStart) / (seg.length * 1000) - 1), b.label).toBeLessThan(0.03);
      }
    }
  });

  it('can describe every exchanging capillary bed', () => {
    for (const s of circ.segments.filter((x) => x.exchange)) expect(microBedFor(s).capillaries).toBeGreaterThan(0);
  });
});

describe('local cells', () => {
  it('cross the capillaries in the modelled mean transit time', () => {
    const { seg, sim } = setup('leg_L.thigh.muscle.cap');
    const mean = sim.capTransit.reduce((a, b) => a + b, 0) / sim.capTransit.length;
    expect(mean).toBeCloseTo(seg.transit, 1);
  });

  it('leave with the same saturation as the body-scale model', () => {
    for (const id of ['lung_R.cap', 'heart_L.cap', 'kidney_L.cap']) {
      const { seg, sim } = setup(id);
      // Every capillary carries the same cell flux, so the plain mean over capillaries is the outlet mean.
      const outs = sim.capTransit.map((_, i) => sim.cells.find((c) => c.route === i && c.s > sim.net.routes[i].capEnd)?.po2);
      const sats = outs.filter((p): p is number => p !== undefined).map((p) => saturation(p));
      const mean = sats.reduce((a, b) => a + b, 0) / sats.length;
      expect(Math.abs(mean - ss.segments[seg.index].saturationOut), id).toBeLessThan(0.02);
    }
  });

  it('emit one O2 dot per 10⁹ molecules transferred', () => {
    const { seg, sim } = setup('heart_L.cap');
    const o = ss.segments[seg.index];
    let dots = 0;
    const T = 20;
    for (let t = 0; t < T; t += 0.02) {
      dots += sim.step(0.02).length;
    }
    // Cells crossing during the run ≈ spawn rate × T (equal flux per capillary at the mean speed).
    const meanSpeed = sim.capSpeed.reduce((a, b) => a + b, 0) / sim.capSpeed.length;
    const crossings = (sim.capSpeed.length * meanSpeed * T) / sim.spacing;
    const expected = (crossings * (o.saturationIn - o.saturationOut) * 4 * 2.7e8) / MOLECULES_PER_DOT;
    expect(Math.abs(dots / expected - 1)).toBeLessThan(0.15);
  });
});
