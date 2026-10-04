import { afterAll, describe, expect, it } from 'vitest';
import { NORMAL_HAEMOGLOBIN, p50, setHaemoglobin } from '../src/physiology/dissociation';
import { barometricPressure, NORMAL_SCENARIO, SCENARIO_PRESETS, scenarioActivity, type Scenario } from '../src/physiology/scenario';
import { activityState } from '../src/physiology/activity';
import { solveScenario } from '../src/sim/compensation';
import { O2SupplyError } from '../src/sim/oxygen';

const preset = (id: string): Scenario => SCENARIO_PRESETS.find((p) => p.id === id)!.scenario;
const thigh = 'leg_L.thigh.muscle.cap';

afterAll(() => setHaemoglobin(NORMAL_HAEMOGLOBIN));

describe('altitude', { timeout: 60_000 }, () => {
  it('follows the standard atmosphere: 760 mmHg at sea level, 253 on Everest (West 1996)', () => {
    expect(barometricPressure(0)).toBeCloseTo(760, -1);
    expect(barometricPressure(8848)).toBeGreaterThan(250);
    expect(barometricPressure(8848)).toBeLessThan(256);
  });

  it('gives an alveolar PO2 of ~35 mmHg on the summit at rest (West et al. 1983)', () => {
    setHaemoglobin(NORMAL_HAEMOGLOBIN);
    const a = scenarioActivity(activityState(0), preset('everest'));
    expect(a.alveolarPo2).toBeGreaterThan(30);
    expect(a.alveolarPo2).toBeLessThan(38);
    expect(a.arterialPco2).toBeCloseTo(7.5, 1);
  });

  it('desaturates arterial blood at 4,500 m but still allows walking', () => {
    const rest = solveScenario(0, preset('altitude'));
    expect(rest.steady.arterial.po2In).toBeGreaterThan(40);
    expect(rest.steady.arterial.po2In).toBeLessThan(56);
    expect(rest.steady.arterial.saturationIn).toBeGreaterThan(0.8);
    expect(rest.steady.arterial.saturationIn).toBeLessThan(0.92);
    expect(() => solveScenario(0.25, preset('altitude'))).not.toThrow();
  });
});

describe('haemoglobin', { timeout: 60_000 }, () => {
  it('in anaemia keeps arterial blood saturated but halves its O2, and raises cardiac output', () => {
    const st = solveScenario(0, preset('anaemia'));
    expect(st.steady.arterial.saturationIn).toBeGreaterThan(0.96);
    expect(st.steady.arterial.contentIn * 100).toBeLessThan(11.5);
    const rise = st.circ.cardiacOutput / activityState(0).cardiacOutput;
    expect(rise).toBeGreaterThan(1.1);
    expect(rise).toBeLessThan(1.6);
  });

  it('without compensation, anaemia leaves the heart short of O2 even at rest', () => {
    expect(() => solveScenario(0, { ...preset('anaemia'), compensate: false })).toThrow(O2SupplyError);
  });

  it('in anaemia lowers the maximal sustainable activity', () => {
    expect(() => solveScenario(0.25, preset('anaemia'))).not.toThrow();
    expect(() => solveScenario(1, preset('anaemia'))).toThrow(O2SupplyError);
  });

  it('with carbon monoxide shifts the remaining haemoglobin left (Roughton & Darling) and cuts O2 content', () => {
    setHaemoglobin({ ...NORMAL_HAEMOGLOBIN, coFraction: 0.3 });
    expect(p50()).toBeLessThan(21);
    setHaemoglobin({ ...NORMAL_HAEMOGLOBIN, coFraction: 0.5 });
    expect(p50()).toBeLessThan(16);
    const st = solveScenario(0, preset('co'));
    // Normal PO2, but only ~70 % of haemoglobin carries O2.
    expect(st.steady.arterial.po2In).toBeGreaterThan(85);
    expect(st.steady.arterial.saturationIn).toBeGreaterThan(0.65);
    expect(st.steady.arterial.saturationIn).toBeLessThan(0.7);
  });

  it('with low-affinity haemoglobin still reaches maximal exercise', () => {
    const st = solveScenario(1, preset('low-affinity'));
    expect(st.steady.exchange.get(st.circ.get(thigh).index)!.targetPo2).toBeGreaterThan(0);
  });
});

describe('compensation', { timeout: 60_000 }, () => {
  it('changes nothing for normal blood', () => {
    const plain = solveScenario(0, NORMAL_SCENARIO);
    const comp = solveScenario(0, { ...NORMAL_SCENARIO, compensate: true, hb: 15 + 1e-6 });
    expect(Math.abs(comp.circ.cardiacOutput / plain.circ.cardiacOutput - 1)).toBeLessThan(0.01);
  });
});
