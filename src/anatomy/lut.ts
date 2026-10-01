/** Arc-length lookup tables for vessel paths (no three.js dependency, so the worker stays small). */

/** Samples per segment in the lookup table. */
export const LUT_SAMPLES = 32;
/** Floats per sample: position, normal, binormal. */
export const LUT_STRIDE = 9;

/**
 * Position of a point `progress` (0–1) along segment `seg`, offset radially by
 * (`r` · radius) at angle `theta`. Pure function over the LUT so it can run in
 * the worker.
 */
export function samplePath(
  lut: Float32Array,
  radius: Float32Array,
  seg: number,
  progress: number,
  r: number,
  theta: number,
  out: Float32Array,
  offset: number,
): void {
  const f = Math.min(Math.max(progress, 0), 1) * (LUT_SAMPLES - 1);
  const k = Math.min(Math.floor(f), LUT_SAMPLES - 2);
  const t = f - k;
  const a = (seg * LUT_SAMPLES + k) * LUT_STRIDE;
  const b = a + LUT_STRIDE;
  const rr = r * radius[seg];
  const c = Math.cos(theta) * rr;
  const s = Math.sin(theta) * rr;
  for (let d = 0; d < 3; d++) {
    const p = lut[a + d] + (lut[b + d] - lut[a + d]) * t;
    const n = lut[a + 3 + d];
    const bi = lut[a + 6 + d];
    out[offset + d] = p + n * c + bi * s;
  }
}
