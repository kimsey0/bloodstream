/**
 * Colour scale for haemoglobin O2 saturation.
 *
 * There is no formal standard. Two conventions overlap:
 * - Anatomical illustration: arteries red, veins blue.
 * - Oximetry / photoacoustic sO2 imaging: a blue (low) → red (high) ramp.
 *
 * This scale follows both: deep blue at 0 %, violet/magenta around mixed
 * venous saturation (~70 %), red at full saturation. A plain red ↔ dark-red
 * ramp, the "true" colour of blood, is avoided because it is
 * nearly invisible to deuteranopes and protanopes. Lightness rises
 * monotonically with saturation, so the scale also reads in greyscale. The
 * blue → red hue axis is the one red–green colour-vision deficiencies
 * preserve.
 *
 * The stops are deliberately denser above 50 %, where physiology happens
 * (arterial ≈ 97 %, mixed venous ≈ 73 %, coronary sinus ≈ 30 %).
 * Interpolation is in OKLab for perceptual smoothness.
 */

export type Rgb = [number, number, number];

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Saturation → OKLCH stops. */
const STOPS: [number, Oklch][] = [
  [0.0, { l: 0.22, c: 0.1, h: 262 }],
  [0.5, { l: 0.4, c: 0.17, h: 275 }],
  [0.75, { l: 0.54, c: 0.19, h: 335 }],
  [1.0, { l: 0.64, c: 0.22, h: 27 }],
];

function oklchToOklab({ l, c, h }: Oklch): [number, number, number] {
  const r = (h * Math.PI) / 180;
  return [l, c * Math.cos(r), c * Math.sin(r)];
}

export function oklabToLinearSrgb([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearSrgbToOklab([r, g, b]: Rgb): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

export function srgbToLinear(c: Rgb): Rgb {
  return c.map(toLinear) as Rgb;
}

/** In-gamut linear sRGB for an OKLab colour, reducing chroma if needed. */
function oklabToLinearInGamut(lab: [number, number, number]): Rgb {
  let [L, a, b] = lab;
  for (let i = 0; i < 30; i++) {
    const rgb = oklabToLinearSrgb([L, a, b]);
    if (rgb.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) return rgb.map((x) => Math.min(1, Math.max(0, x))) as Rgb;
    a *= 0.95;
    b *= 0.95;
  }
  return oklabToLinearSrgb([L, 0, 0]);
}

/** Colour as OKLab for saturation s (0–1). */
export function saturationOklab(s: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, s));
  let i = 0;
  while (i < STOPS.length - 2 && x > STOPS[i + 1][0]) i++;
  const [s0, c0] = STOPS[i];
  const [s1, c1] = STOPS[i + 1];
  const t = (x - s0) / (s1 - s0);
  const a = oklchToOklab(c0);
  const b = oklchToOklab(c1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Linear-light sRGB (what three.js expects for vertex/instance colours). */
export function saturationColorLinear(s: number): Rgb {
  return oklabToLinearInGamut(saturationOklab(s));
}

/** Gamma-encoded sRGB, 0–1. */
export function saturationColor(s: number): Rgb {
  return saturationColorLinear(s).map(toGamma) as Rgb;
}

export function saturationCss(s: number): string {
  const [r, g, b] = saturationColor(s).map((x) => Math.round(x * 255));
  return `rgb(${r} ${g} ${b})`;
}

/** Colours for a haemoglobin tetramer with 0, 1, 2, 3, 4 O2 bound. */
export const HEMOGLOBIN_STEP_COLORS: string[] = [0, 1, 2, 3, 4].map((n) => saturationCss(n / 4));

/**
 * Colour-vision-deficiency simulation, Machado, Oliveira & Fernandes 2009,
 * severity 1.0, applied to linear sRGB.
 */
export const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

export type Cvd = keyof typeof CVD_MATRICES;

export function simulateCvd(linear: Rgb, type: Cvd): Rgb {
  const m = CVD_MATRICES[type];
  return m.map((row) => Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]))) as Rgb;
}

/** Euclidean distance in OKLab (≈ perceptual difference; 0.02 is a just-noticeable difference). */
export function deltaEOk(a: Rgb, b: Rgb): number {
  const x = linearSrgbToOklab(a);
  const y = linearSrgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
