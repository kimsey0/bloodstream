/**
 * Pulsatile flow from the heartbeat.
 *
 * The ventricles eject only during systole. Aortic flow is a half-sine pulse
 * over the ejection period with near-zero flow in diastole, so peak flow is
 * ~4–5× the mean: a mean aortic velocity of ~12 cm/s peaks near 50–60 cm/s
 * at rest. Ejection lasts ~0.30 s at 70 bpm and shortens to ~0.20 s near
 * 180 bpm (Weissler's systolic time intervals), so systole takes a growing
 * share of each beat as the heart speeds up.
 *
 * Downstream, arterial compliance (the Windkessel) smooths the pulse.
 * Each segment has a pulsatility α ∈ [0, 1], and its instantaneous flow is
 * mean × (1 + α (w − 1)), where w is the aortic waveform normalised to mean 1.
 * Averaged over a beat this equals the mean, so transit times and every
 * steady-state result are unchanged.
 */
import type { Segment } from '../sim/circulation';

/** Diastolic aortic flow as a fraction of mean (small: the aortic valve is shut). */
export const DIASTOLIC_FLOW = 0.03;

/** Ejection duration, s, as a function of heart rate. */
export function ejectionDuration(heartRate: number): number {
  return Math.min(0.32, Math.max(0.2, 0.3 - ((heartRate - 70) / 110) * 0.1));
}

export class CardiacWaveform {
  readonly period: number;
  /** Fraction of each beat spent ejecting. */
  readonly systole: number;
  private readonly amplitude: number;

  constructor(readonly heartRate: number) {
    this.period = 60 / heartRate;
    this.systole = Math.min(0.6, ejectionDuration(heartRate) / this.period);
    // Half-sine of amplitude A over systole plus a constant diastolic level, with mean 1.
    this.amplitude = ((1 - DIASTOLIC_FLOW * (1 - this.systole)) * Math.PI) / (2 * this.systole);
  }

  /** Phase within the beat (0 = start of ejection) at time t, s. */
  phase(t: number): number {
    const x = t / this.period;
    return x - Math.floor(x);
  }

  /** Normalised aortic flow (mean 1) at phase φ. */
  w(phase: number): number {
    return phase < this.systole ? this.amplitude * Math.sin((Math.PI * phase) / this.systole) : DIASTOLIC_FLOW;
  }

  /** ∫ w dφ from 0 to φ (one beat integrates to 1). */
  private cumulative(phase: number): number {
    const s = this.systole;
    if (phase < s) return ((this.amplitude * s) / Math.PI) * (1 - Math.cos((Math.PI * phase) / s));
    return (2 * this.amplitude * s) / Math.PI + DIASTOLIC_FLOW * (phase - s);
  }

  /** Mean of w over the time interval [t0, t1] (beats counted from t = 0). */
  meanOver(t0: number, t1: number): number {
    return this.meanOverBeats(t0 / this.period, (t1 - t0) / this.period);
  }

  /** Mean of w from beat count b0 over db beats (b counts beats; its fractional part is the phase). */
  meanOverBeats(b0: number, db: number): number {
    const at = (b: number) => Math.floor(b) + this.cumulative(b - Math.floor(b));
    if (db <= 0) return this.w(b0 - Math.floor(b0));
    return (at(b0 + db) - at(b0)) / db;
  }
}

/**
 * How strongly each segment follows the heartbeat. Ventricles eject only in systole; the
 * pulse fades through the arterial tree and is almost gone in capillaries. Veins and atria are
 * treated as steady.
 */
export function pulsatility(s: Segment): number {
  // Ventricles: > 1 marks pure ejection (no outflow at all in diastole); see flowRate().
  if (s.kind === 'chamber') return s.id === 'lv' || s.id === 'rv' ? VENTRICLE : 0;
  if (s.kind === 'artery') {
    if (s.circuit === 'pulmonary') return 0.8;
    if (s.diameter >= 15) return 0.9;
    if (s.diameter >= 6) return 0.7;
    return 0.5;
  }
  if (s.kind === 'arteriole') return s.circuit === 'pulmonary' ? 0.5 : 0.25;
  if (s.kind === 'capillary') return s.circuit === 'pulmonary' ? 0.3 : 0.08;
  return 0;
}

/** Pulsatility marker for ventricles, which empty only while ejecting. */
export const VENTRICLE = 2;

/** Flow-rate factor (mean 1) for a segment of pulsatility α when the aortic waveform averages W. */
export function flowRate(alpha: number, W: number): number {
  if (alpha === VENTRICLE) return Math.max(0, (W - DIASTOLIC_FLOW) / (1 - DIASTOLIC_FLOW));
  return 1 + alpha * (W - 1);
}
