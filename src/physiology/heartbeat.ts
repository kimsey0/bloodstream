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
 *
 * Coronary flow is the exception: contracting muscle squeezes its own
 * vessels in systole, so coronary flow is highest in diastole, when aortic
 * flow has stopped. The coronary arteries and their beds follow a waveform of
 * their own (see `coronary`).
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

  /**
   * Normalised coronary flow (mean 1) at phase φ, for a diastolic-to-systolic flow ratio R:
   * a constant level q_s during ejection and R·q_s in diastole, with q_s = 1 / (s + R (1 − s)).
   */
  coronary(phase: number, ratio: number): number {
    const qs = 1 / (this.systole + ratio * (1 - this.systole));
    return phase < this.systole ? qs : ratio * qs;
  }

  /** Mean of the coronary waveform from beat count b0 over db beats. */
  coronaryOverBeats(b0: number, db: number, ratio: number): number {
    const s = this.systole;
    const qs = 1 / (s + ratio * (1 - s));
    const cumulative = (p: number) => (p < s ? qs * p : qs * s + ratio * qs * (p - s));
    const at = (b: number) => Math.floor(b) + cumulative(b - Math.floor(b));
    if (db <= 0) return this.coronary(b0 - Math.floor(b0), ratio);
    return (at(b0 + db) - at(b0)) / db;
  }

  /** Mean waveform value of a pulse channel (see `pulseChannel`) over db beats from b0. */
  channelOverBeats(channel: number, b0: number, db: number): number {
    return channel === PULSE_AORTIC ? this.meanOverBeats(b0, db) : this.coronaryOverBeats(b0, db, CORONARY_RATIO[channel]);
  }

  /** Waveform value of a pulse channel at phase φ. */
  channelAt(channel: number, phase: number): number {
    return channel === PULSE_AORTIC ? this.w(phase) : this.coronary(phase, CORONARY_RATIO[channel]);
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

/** Pulse channels: which waveform a segment follows. */
export const PULSE_AORTIC = 0;
export const PULSE_CORONARY_LEFT = 1;
export const PULSE_CORONARY_RIGHT = 2;
export const PULSE_CHANNELS = 3;

/**
 * Diastolic-to-systolic coronary flow ratio, indexed by pulse channel. Resting mid-diastolic over
 * systolic peak flow velocity in 567 human coronary arteries: LCA 1.85 ± 0.70, RCA 1.53 ± 0.34
 * (Seligman et al., EuroIntervention 2022, Table 2). Velocity stands in for flow, since the
 * artery's diameter barely changes over a beat. With systole a third of the beat, the left
 * coronary artery then carries ~78 % of its flow in diastole, the right ~74 %.
 */
export const CORONARY_RATIO = [1, 1.85, 1.53] as const;

/** Which waveform a segment follows: the coronary arteries and their beds have their own. */
export function pulseChannel(s: Segment): number {
  if (s.kind === 'artery' || s.kind === 'arteriole' || s.kind === 'capillary') {
    if (s.id === 'coronary_L' || s.id.startsWith('heart_L.')) return PULSE_CORONARY_LEFT;
    if (s.id === 'coronary_R' || s.id.startsWith('heart_R.')) return PULSE_CORONARY_RIGHT;
  }
  return PULSE_AORTIC;
}

/**
 * How strongly each segment follows the heartbeat. Ventricles eject only in systole; the
 * pulse fades through the arterial tree and is almost gone in capillaries. Veins and atria are
 * treated as steady.
 */
export function pulsatility(s: Segment): number {
  // Ventricles: > 1 marks pure ejection (no outflow at all in diastole); see flowRate().
  if (s.kind === 'chamber') return s.id === 'lv' || s.id === 'rv' ? VENTRICLE : 0;
  // Coronary arteries and arterioles follow their own (diastolic) waveform in full.
  if (pulseChannel(s) !== PULSE_AORTIC) return s.kind === 'capillary' ? 0.5 : 1;
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
