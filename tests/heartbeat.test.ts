import { describe, expect, it } from 'vitest';
import { CardiacWaveform, CORONARY_RATIO, ejectionDuration, PULSE_CORONARY_LEFT, PULSE_CORONARY_RIGHT } from '../src/physiology/heartbeat';
import { Simulation } from '../src/sim/simulation';

describe('cardiac waveform', () => {
  it('averages to the mean flow over a beat and over arbitrary windows', () => {
    for (const hr of [60, 70, 120, 180]) {
      const w = new CardiacWaveform(hr);
      expect(w.meanOver(0, w.period)).toBeCloseTo(1, 9);
      expect(w.meanOver(0.123, 0.123 + 7 * w.period)).toBeCloseTo(1, 9);
      // Numerical check of the closed-form integral.
      let sum = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) sum += w.w((i + 0.5) / n);
      expect(sum / n).toBeCloseTo(1, 4);
    }
  });

  it('peaks at ~4–5× mean aortic flow at rest, with systole shortening as the heart speeds up', () => {
    const rest = new CardiacWaveform(70);
    const peak = rest.w(rest.systole / 2);
    expect(peak).toBeGreaterThan(4);
    expect(peak).toBeLessThan(5);
    expect(ejectionDuration(70)).toBeCloseTo(0.3, 2);
    expect(ejectionDuration(180)).toBeCloseTo(0.2, 2);
    expect(new CardiacWaveform(180).systole).toBeGreaterThan(rest.systole);
  });
});

describe('coronary waveform', () => {
  it('averages to 1 and carries about three-quarters of coronary flow in diastole at rest', () => {
    const w = new CardiacWaveform(70);
    for (const ch of [PULSE_CORONARY_LEFT, PULSE_CORONARY_RIGHT]) {
      expect(w.channelOverBeats(ch, 0.37, 5)).toBeCloseTo(1, 9);
      const r = CORONARY_RATIO[ch];
      expect(w.coronary(0.8, r) / w.coronary(0.1, r)).toBeCloseTo(r, 9);
      const diastolicShare = w.coronary(0.8, r) * (1 - w.systole);
      expect(diastolicShare).toBeGreaterThan(0.7);
      expect(diastolicShare).toBeLessThan(0.8);
    }
  });
});

describe('pulsatile simulation', () => {
  it('moves cells into the left heart wall faster in diastole than in systole', () => {
    const sim = new Simulation({ cellCount: 8000, seed: 10 });
    const art = sim.circulation.get('heart_L.art').index;
    const w = sim.waveform!;
    let sys = 0;
    let sysN = 0;
    let dia = 0;
    let diaN = 0;
    for (let i = 0; i < 1500; i++) {
      sim.step(0.004);
      const ph = sim.beatPhase;
      for (let c = 0; c < sim.count; c++) {
        if (sim.segment[c] !== art) continue;
        const v = sim.speed(c);
        if (ph > 0.1 * w.systole && ph < 0.9 * w.systole) (sys += v), sysN++;
        else if (ph > w.systole + 0.05) (dia += v), diaN++;
      }
    }
    expect(dia / diaN / (sys / sysN)).toBeGreaterThan(1.5);
  });

  it('ejects cells from the left ventricle only during systole', () => {
    const sim = new Simulation({ cellCount: 3000, seed: 8 });
    const lv = sim.circulation.root.index;
    let inSystole = 0;
    let inDiastole = 0;
    sim.addListener((e) => {
      if (e.from !== lv) return;
      const phase = sim.waveform!.phase(e.time);
      if (phase < sim.waveform!.systole + 0.01) inSystole++;
      else inDiastole++;
    });
    for (let i = 0; i < 3000; i++) sim.step(0.01);
    expect(inSystole).toBeGreaterThan(100);
    expect(inDiastole).toBe(0);
  });

  it('makes aortic cells surge in systole and drift in diastole', () => {
    const sim = new Simulation({ cellCount: 4000, seed: 9 });
    const asc = sim.circulation.get('aorta_asc').index;
    const speeds = (phaseLo: number, phaseHi: number) => {
      const out: number[] = [];
      for (let i = 0; i < 400; i++) {
        sim.step(0.005);
        const ph = sim.beatPhase;
        if (ph < phaseLo || ph > phaseHi) continue;
        for (let c = 0; c < sim.count; c++) if (sim.segment[c] === asc) out.push(sim.speed(c));
      }
      return out.reduce((a, b) => a + b, 0) / out.length;
    };
    const w = sim.waveform!;
    const systolic = speeds(w.systole * 0.4, w.systole * 0.6);
    const diastolic = speeds(w.systole + 0.1, 0.95);
    // Peak aortic velocity at rest ≈ 50–100 cm/s.
    expect(systolic).toBeGreaterThan(400);
    expect(diastolic).toBeLessThan(systolic / 4);
  });
});
