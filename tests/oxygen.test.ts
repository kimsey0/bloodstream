import { describe, expect, it } from 'vitest';
import { o2Content, saturation } from '../src/physiology/dissociation';
import { REST } from '../src/physiology/params';
import { Circulation } from '../src/sim/circulation';
import { capillaryProfile, integratePo2, solveSteadyState } from '../src/sim/oxygen';

const circ = new Circulation();
const ss = solveSteadyState(circ);
const at = (id: string) => ss.segments[circ.get(id).index];

describe('whole-body O2 steady state at rest', () => {
  it('has arterial SO2 ≈ 97 % and PO2 ≈ 95 mmHg (bronchial shunt included)', () => {
    expect(ss.arterial.saturationIn).toBeGreaterThan(0.965);
    expect(ss.arterial.saturationIn).toBeLessThan(0.98);
    expect(ss.arterial.po2In).toBeGreaterThan(90);
    expect(ss.arterial.po2In).toBeLessThan(100);
  });

  it('has mixed venous SO2 ≈ 75 % and PO2 ≈ 40 mmHg', () => {
    expect(ss.mixedVenous.saturationIn).toBeGreaterThan(0.7);
    expect(ss.mixedVenous.saturationIn).toBeLessThan(0.78);
    expect(ss.mixedVenous.po2In).toBeGreaterThan(36);
    expect(ss.mixedVenous.po2In).toBeLessThan(43);
  });

  it('takes up 250 mL O2/min in the lungs, matching body consumption (Fick)', () => {
    const uptake = ['lung_L.cap', 'lung_R.cap'].reduce((a, id) => {
      const o = at(id);
      return a + (o.contentOut - o.contentIn) * circ.get(id).flow * 60;
    }, 0);
    expect(uptake).toBeCloseTo(REST.vo2, 3);
    // CO × (arterial − mixed venous) is ~0.3 % higher because bronchial venous blood bypasses the lungs.
    const fick = REST.cardiacOutput * (ss.arterial.contentIn - ss.mixedVenous.contentIn) * 60;
    expect(Math.abs(fick / REST.vo2 - 1)).toBeLessThan(0.01);
  });

  it('has organ-specific venous saturations', () => {
    // Coronary sinus 25–40 %: the heart extracts most of its O2.
    expect(at('coronary_sinus').saturationIn).toBeGreaterThan(0.25);
    expect(at('coronary_sinus').saturationIn).toBeLessThan(0.4);
    // Jugular bulb 55–75 %.
    expect(at('jugular_L').saturationIn).toBeGreaterThan(0.55);
    expect(at('jugular_L').saturationIn).toBeLessThan(0.75);
    // Renal vein ~ 90 %: kidneys get flow far beyond their O2 need.
    expect(at('renal_vein_L').saturationIn).toBeGreaterThan(0.85);
    // Inferior vena cava is better saturated than superior (kidneys).
    expect(at('ivc_thoracic').saturationIn).toBeGreaterThan(at('svc').saturationIn);
    // Portal blood has already passed the gut but is still well saturated.
    expect(at('portal_vein').saturationIn).toBeGreaterThan(0.75);
    expect(at('hepatic_veins').saturationIn).toBeLessThan(at('portal_vein').saturationIn);
  });
});

describe('pulmonary O2 loading', () => {
  const lung = ss.exchange.get(circ.get('lung_L.cap').index)!;

  it('reaches equilibrium with alveolar gas after ~0.25 s, a third of the 0.75 s transit', () => {
    const pv = ss.mixedVenous.po2In;
    const gap = REST.alveolarPo2 - pv;
    let t = 0;
    let p = pv;
    while (p < REST.alveolarPo2 - 0.05 * gap) {
      p = integratePo2(p, 0.001, lung);
      t += 0.001;
    }
    expect(t).toBeGreaterThan(0.18);
    expect(t).toBeLessThan(0.35);
    expect(saturation(integratePo2(pv, 0.75, lung))).toBeGreaterThan(0.975);
  });

  it('becomes diffusion-limited when transit shortens to ~0.25 s (hard exercise)', () => {
    const p = integratePo2(30, 0.2, lung);
    expect(saturation(p)).toBeLessThan(0.97);
  });

  it('plots the same equilibration time along the capillary as the chart shows', () => {
    const cap = circ.get('lung_L.cap');
    const prof = capillaryProfile(lung, at('lung_L.cap').contentIn, 1.5 * cap.transit);
    expect(prof.equilibration).not.toBeNull();
    expect(prof.equilibration!).toBeGreaterThan(0.18);
    expect(prof.equilibration!).toBeLessThan(0.35);
    // PO2 rises monotonically towards alveolar gas and never passes it.
    for (let i = 1; i < prof.po2.length; i++) expect(prof.po2[i]).toBeGreaterThanOrEqual(prof.po2[i - 1] - 1e-9);
    expect(prof.po2.at(-1)!).toBeLessThanOrEqual(lung.targetPo2 + 1e-9);
  });

  it('never overshoots alveolar PO2', () => {
    expect(integratePo2(40, 5, lung)).toBeLessThanOrEqual(REST.alveolarPo2);
  });
});

describe('tissue unloading', () => {
  it('delivers each bed its VO2 at the bed mean transit time', () => {
    for (const s of circ.segments) {
      if (s.exchange?.type !== 'tissue') continue;
      const o = ss.segments[s.index];
      const vo2 = (o.contentIn - o.contentOut) * s.flow * 60;
      expect(vo2, s.id).toBeCloseTo(s.exchange.vo2, 6);
      expect(o.po2Out, s.id).toBeGreaterThan(s.exchange.tissuePo2);
    }
  });

  it('extracts more from cells that linger longer', () => {
    const s = circ.get('arm_L.muscle.cap');
    const ex = ss.exchange.get(s.index)!;
    const p0 = ss.segments[s.index].po2In;
    expect(o2Content(integratePo2(p0, 4, ex))).toBeLessThan(o2Content(integratePo2(p0, 1, ex)));
  });
});
