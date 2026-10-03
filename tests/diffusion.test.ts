import { describe, expect, it } from 'vitest';
import { activityState } from '../src/physiology/activity';
import { DIFFUSION, myoglobinSaturation, TISSUES } from '../src/physiology/params';
import { Circulation } from '../src/sim/circulation';
import { meanCapillaryPo2, solveSteadyState, transitQuadrature } from '../src/sim/oxygen';

const states = [0, 0.6, 1].map((l) => {
  const circ = new Circulation({ activity: activityState(l) });
  return { circ, ss: solveSteadyState(circ) };
});
const [rest, jog, max] = states;
const bed = (st: (typeof states)[number], id: string) => st.ss.exchange.get(st.circ.get(id).index)!;
const THIGH = 'leg_L.thigh.muscle.cap';

describe('tissue O2 diffusion', () => {
  it('holds every tissue at its measured resting PO2 at rest', () => {
    for (const s of rest.circ.segments) {
      if (s.exchange?.type !== 'tissue') continue;
      expect(bed(rest, s.id).targetPo2, s.id).toBeCloseTo(TISSUES[s.tissue!].tissuePo2, 6);
    }
  });

  it('draws working-muscle cells down to ~3 mmHg at maximal exercise (Richardson 1995: 3.1 ± 0.3)', () => {
    const t = bed(max, THIGH).targetPo2;
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(4);
  });

  it('reaches that low intracellular PO2 already at moderate work, as measured from ~50 % of max', () => {
    expect(bed(jog, THIGH).targetPo2).toBeLessThan(6);
  });

  it('half-desaturates myoglobin in working muscle and leaves it ~90 % saturated at rest', () => {
    // Richardson 2006: 9 ± 1 % deoxymyoglobin at rest; Richardson 1995: 51 ± 3 % at maximal exercise.
    expect(myoglobinSaturation(bed(rest, THIGH).targetPo2)).toBeGreaterThan(0.88);
    expect(myoglobinSaturation(bed(rest, THIGH).targetPo2)).toBeLessThan(0.94);
    expect(myoglobinSaturation(bed(max, THIGH).targetPo2)).toBeGreaterThan(0.4);
    expect(myoglobinSaturation(bed(max, THIGH).targetPo2)).toBeLessThan(0.6);
  });

  it('raises working-muscle diffusing capacity ~30-fold, to ~13 mL/min/mmHg per kg (Richardson 1995: 14)', () => {
    const b = bed(max, THIGH);
    expect(b.diffusingCapacity / b.restDiffusingCapacity).toBeGreaterThan(15);
    expect(b.diffusingCapacity / b.restDiffusingCapacity).toBeLessThan(40);
    const kg = DIFFUSION.muscleMass * (max.circ.get(THIGH).share ?? 0);
    expect(b.diffusingCapacity / kg).toBeGreaterThan(8);
    expect(b.diffusingCapacity / kg).toBeLessThan(16);
  });

  it('keeps mean capillary PO2 in working muscle near 30–40 mmHg (Richardson 1995: 37.5; Calbet 2005: 34)', () => {
    const s = max.circ.get(THIGH);
    const mc = meanCapillaryPo2(bed(max, THIGH), max.ss.segments[s.index].contentIn, transitQuadrature(s.transit, s.transitCv ?? 0));
    expect(mc).toBeGreaterThan(27);
    expect(mc).toBeLessThan(40);
  });

  it('lowers tissue PO2 where exercise cuts the blood supply, but not in the brain', () => {
    for (const id of ['kidney_L.cap', 'liver.cap']) {
      expect(bed(max, id).diffusingCapacity).toBeCloseTo(bed(rest, id).diffusingCapacity, 9);
      expect(bed(max, id).targetPo2, id).toBeLessThan(bed(rest, id).targetPo2 - 5);
    }
    expect(bed(max, 'brain_L.cap').targetPo2).toBeGreaterThanOrEqual(bed(rest, 'brain_L.cap').targetPo2);
  });
});
