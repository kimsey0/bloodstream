import { describe, expect, it } from 'vitest';
import { activityState, arterialChemistry, vqSpread } from '../src/physiology/activity';
import { conditionsFromChemistry, CO2_CAPACITANCE, po2FromContent } from '../src/physiology/dissociation';
import { NORMAL_SCENARIO } from '../src/physiology/scenario';
import { Circulation } from '../src/sim/circulation';
import { solveScenario } from '../src/sim/compensation';
import { solveLungUnits, solveSteadyState, transitQuadrature } from '../src/sim/oxygen';

const gap = (st: { circ: Circulation; steady: ReturnType<typeof solveSteadyState> }) => st.circ.activity.alveolarPo2 - st.steady.arterial.po2In;
const atSeaLevel = (level: number) => {
  const circ = new Circulation({ activity: activityState(level) });
  return { circ, steady: solveSteadyState(circ) };
};

describe('ventilation–perfusion mismatch', () => {
  it('uses the measured spread of V/Q ratios: logSD 0.35 at rest, rising with exercise and altitude', () => {
    // Wagner et al. 1986, Table 3 and p. 264.
    expect(vqSpread(250)).toBeCloseTo(0.35, 6);
    expect(vqSpread(4000)).toBeCloseTo(0.535, 3); // "logSD_Q at 4 l/min would be 0.54"
    expect(vqSpread(2000, 523)).toBeGreaterThan(vqSpread(2000, 760));
    expect(vqSpread(2000, 429)).toBeGreaterThan(vqSpread(2000, 523));
  });

  it('lowers arterial PO2 by mismatch alone as Wagner et al. 1974 calculated: ~5, 9 and 14 mmHg for logSD 0.3, 0.4, 0.5', () => {
    const circ = new Circulation();
    const ss = solveSteadyState(circ);
    const lung = circ.get('lung_L.cap');
    const venous = ss.segments[lung.index];
    const rest = activityState(0);
    const chem = { co2: (venous.conditionsIn.pco2 - 40) * CO2_CAPACITANCE, acid: 0, heat: 0 };
    const arterial = conditionsFromChemistry(arterialChemistry(rest));
    // No diffusion limitation: a huge diffusing capacity isolates the effect of mismatch.
    const mismatch = (sd: number) => {
      const units = solveLungUnits(venous.contentIn, chem, { ...rest, vqSpread: sd }, 1e3, transitQuadrature(lung.transit, lung.transitCv ?? 0));
      const content = units.contentOut.reduce((a, c, j) => a + c * units.weights[j], 0);
      return rest.alveolarPo2 - po2FromContent(content, arterial);
    };
    // Relative to a uniform lung with the same blood and ventilation.
    const uniform = mismatch(0);
    for (const [sd, expected] of [[0.3, 5], [0.4, 9], [0.5, 14]]) {
      expect(mismatch(sd) - uniform, `logSD ${sd}`).toBeGreaterThan(expected * 0.7);
      expect(mismatch(sd) - uniform, `logSD ${sd}`).toBeLessThan(expected * 1.3);
    }
  });

  it('matches the alveolar–arterial PO2 difference in exercise at sea level (Wagner et al. 1986, Table 2)', () => {
    // Table 2, interpolated to the model's O2 uptake: ~8 mmHg at 0.9 L/min, ~11.5 at 2.0, ~22 at 3.25 (SD 3–7).
    for (const [level, expected] of [[0.25, 8], [0.6, 11.5], [1, 22]]) {
      const g = gap(atSeaLevel(level));
      expect(g, `level ${level}`).toBeGreaterThan(expected - 5);
      expect(g, `level ${level}`).toBeLessThan(expected + 5);
    }
  });

  it('widens the difference faster at 3,050 m (PB 523), where diffusion limitation sets in (Wagner et al. 1986, Table 2)', () => {
    // Table 2 at 10,000 ft, interpolated: ~8 mmHg at 0.9 L/min and ~18 at 2.0 L/min. Their subjects
    // were not acclimatized (arterial PCO2 ~33 vs ~27 here), which hardly changes the difference.
    const s = { ...NORMAL_SCENARIO, altitude: 3048 };
    const walk = gap(solveScenario(0.25, s));
    const jog = gap(solveScenario(0.6, s));
    expect(walk).toBeGreaterThan(4);
    expect(walk).toBeLessThan(13);
    expect(jog).toBeGreaterThan(13);
    expect(jog).toBeLessThan(23);
  });

  it('keeps acclimatized lowlanders near their measured SaO2 when walking at 3,700 m (Brutsaert et al. 2000, Table 4: 88.9 %)', () => {
    const st = solveScenario(0.25, { ...NORMAL_SCENARIO, altitude: 3700, hb: 17.6 });
    expect(st.steady.arterial.saturationIn).toBeGreaterThan(0.86);
    expect(st.steady.arterial.saturationIn).toBeLessThan(0.92);
  });

  it('sends each tracer cell in the lungs through one V/Q unit, whose gas sets its target', () => {
    const circ = new Circulation();
    const ss = solveSteadyState(circ);
    const units = ss.lungUnits.get(circ.get('lung_L.cap').index)!;
    const targets = units.models.map((m) => m.targetPo2);
    // Low-V/Q units have low alveolar PO2, high-V/Q units high.
    for (let j = 1; j < targets.length; j++) expect(targets[j]).toBeGreaterThan(targets[j - 1]);
    expect(targets[0]).toBeLessThan(80);
    expect(targets.at(-1)!).toBeGreaterThan(110);
  });
});
