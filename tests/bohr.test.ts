import { describe, expect, it } from 'vitest';
import { activityState } from '../src/physiology/activity';
import { p50, po2FromContent, STANDARD_CONDITIONS } from '../src/physiology/dissociation';
import { Circulation } from '../src/sim/circulation';
import { solveSteadyState } from '../src/sim/oxygen';

const rest = new Circulation();
const restSs = solveSteadyState(rest);
const max = new Circulation({ activity: activityState(1) });
const maxSs = solveSteadyState(max);
const seg = (c: Circulation, ss: typeof restSs, id: string) => ss.segments[c.get(id).index];

describe('CO2 and blood chemistry at rest', () => {
  it('gives mixed venous blood PCO2 ≈ 45 mmHg and pH ≈ 7.37 (Guyton & Hall)', () => {
    const mv = restSs.mixedVenous.conditionsIn;
    expect(mv.pco2).toBeGreaterThan(44);
    expect(mv.pco2).toBeLessThan(47);
    expect(mv.pH).toBeGreaterThan(7.34);
    expect(mv.pH).toBeLessThan(7.38);
  });

  it('returns blood to arterial chemistry in the lungs', () => {
    const art = restSs.arterial.conditionsIn;
    // Bronchial venous blood joins the pulmonary veins, so arterial PCO2 is a fraction above 40.
    expect(art.pco2).toBeGreaterThan(40);
    expect(art.pco2).toBeLessThan(40.5);
    const lung = seg(rest, restSs, 'lung_L.cap');
    expect(lung.conditionsOut.pco2).toBeCloseTo(40, 1);
  });

  it('adds most CO2 where most O2 is taken: heart far more than kidney', () => {
    const cs = seg(rest, restSs, 'coronary_sinus').conditionsIn.pco2;
    const renal = seg(rest, restSs, 'renal_vein_L').conditionsIn.pco2;
    expect(cs).toBeGreaterThan(50);
    expect(renal).toBeLessThan(43);
  });
});

describe('Bohr effect along capillaries', () => {
  it('builds up as working muscle unloads O2, instead of jumping at the inlet', () => {
    const cap = max.get('leg_L.thigh.muscle.cap');
    const o = maxSs.segments[cap.index];
    expect(p50(o.conditionsOut) - p50(o.conditionsIn)).toBeGreaterThan(8);
    // A cell's PO2 is continuous from the feeding arterioles into the capillary.
    const upstream = maxSs.segments[cap.prevIndex[0]];
    expect(Math.abs(o.po2In - upstream.po2Out)).toBeLessThan(0.5);
  });

  it('keeps capillary PO2 higher for the same O2 extraction, which sustains diffusion', () => {
    const o = seg(max, maxSs, 'leg_L.thigh.muscle.cap');
    const unshifted = po2FromContent(o.contentOut, maxSs.arterial.conditionsIn);
    expect(o.po2Out - unshifted).toBeGreaterThan(3);
  });

  it('reverses in the lungs as CO2 leaves, raising haemoglobin affinity for loading', () => {
    for (const [c, ss] of [[rest, restSs], [max, maxSs]] as const) {
      const lung = seg(c, ss, 'lung_R.cap');
      expect(p50(lung.conditionsIn)).toBeGreaterThan(p50(lung.conditionsOut) + 1);
    }
  });

  it('is absent from standard arterial blood at rest', () => {
    expect(p50(restSs.arterial.conditionsIn)).toBeCloseTo(p50(STANDARD_CONDITIONS), 0);
  });
});
