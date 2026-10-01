/**
 * Capillary beds that can be opened in the microscope view, each with a
 * tissue-specific network style. Dimensions are typical histology values
 * (µm). The capillary length, diameter and transit time come from the
 * circulation model itself.
 */

import type { Tissue } from '../physiology/params';
import type { Segment } from '../sim/circulation';

export type NetworkStyle = 'fibers' | 'alveoli' | 'tortuous' | 'hairpin';

export interface MicroBed {
  /** Capillary segment id in the circulation graph. */
  capillary: string;
  label: string;
  style: NetworkStyle;
  /** Number of capillaries drawn. */
  capillaries: number;
  /** Fibre/cord/tubule radius for the 'fibers' style, µm. */
  fiberRadius?: number;
  /** What the fibres are. */
  fiberLabel?: string;
  /** One-line description shown in the panel. */
  blurb: string;
}

export const MICRO_BEDS: MicroBed[] = [
  {
    capillary: 'lung_R.cap',
    label: 'Lung alveoli',
    style: 'alveoli',
    capillaries: 18,
    blurb: 'Capillaries wrap the air sacs. O₂ crosses a barrier under 1 µm thick, and the cell is fully loaded about a third of the way along.',
  },
  {
    capillary: 'heart_L.cap',
    label: 'Heart muscle',
    style: 'fibers',
    capillaries: 16,
    fiberRadius: 9,
    fiberLabel: 'cardiomyocytes',
    blurb: 'About one capillary per heart-muscle cell. The heart extracts about two-thirds of the O₂ even at rest.',
  },
  {
    capillary: 'brain_L.cap',
    label: 'Brain',
    style: 'tortuous',
    capillaries: 14,
    blurb: 'A dense, winding 3D mesh. The brain uses ~20 % of the body’s O₂ at rest and extracts about a third of what arrives.',
  },
  {
    capillary: 'leg_L.thigh.muscle.cap',
    label: 'Thigh muscle',
    style: 'fibers',
    capillaries: 12,
    fiberRadius: 25,
    fiberLabel: 'muscle fibres',
    blurb: 'Capillaries run alongside muscle fibres. At rest, flow is slow and only about a third of the O₂ is taken.',
  },
  {
    capillary: 'kidney_L.cap',
    label: 'Kidney',
    style: 'fibers',
    capillaries: 12,
    fiberRadius: 22,
    fiberLabel: 'tubules',
    blurb: 'Peritubular capillaries, after the glomerulus. Kidneys get a fifth of cardiac output for filtering, so blood leaves still ~90 % saturated.',
  },
  {
    capillary: 'liver.cap',
    label: 'Liver',
    style: 'fibers',
    capillaries: 12,
    fiberRadius: 12,
    fiberLabel: 'hepatocyte plates',
    blurb: 'Wide, leaky sinusoids between plates of liver cells, fed mostly by portal blood that has already passed the gut.',
  },
  {
    capillary: 'arm_L.hand.skin.cap',
    label: 'Fingertip skin',
    style: 'hairpin',
    capillaries: 10,
    blurb: 'Hairpin loops rise into each skin ridge and turn back. Skin flow serves temperature control far more than O₂ need.',
  },
];

type StyleSpec = Pick<MicroBed, 'style' | 'capillaries' | 'fiberRadius' | 'fiberLabel'>;

/** Network style by tissue, for beds that are not in the menu. */
const TISSUE_STYLE: Record<Tissue | 'lung', StyleSpec> = {
  lung: { style: 'alveoli', capillaries: 18 },
  heart: { style: 'fibers', capillaries: 16, fiberRadius: 9, fiberLabel: 'cardiomyocytes' },
  muscle: { style: 'fibers', capillaries: 12, fiberRadius: 25, fiberLabel: 'muscle fibres' },
  kidney: { style: 'fibers', capillaries: 12, fiberRadius: 22, fiberLabel: 'tubules' },
  liver: { style: 'fibers', capillaries: 12, fiberRadius: 12, fiberLabel: 'hepatocyte plates' },
  brain: { style: 'tortuous', capillaries: 14 },
  skin: { style: 'hairpin', capillaries: 10 },
  gut: { style: 'tortuous', capillaries: 12 },
  bronchial: { style: 'tortuous', capillaries: 10 },
  other: { style: 'tortuous', capillaries: 10 },
};

/** The microscope description of any exchanging capillary segment. */
export function microBedFor(seg: Segment): MicroBed {
  const listed = MICRO_BEDS.find((b) => b.capillary === seg.id);
  if (listed) return listed;
  const key = seg.exchange?.type === 'lung' ? 'lung' : (seg.tissue ?? 'other');
  return {
    capillary: seg.id,
    label: seg.name.replace(/: .*$/, ''),
    ...TISSUE_STYLE[key],
    blurb: 'A representative patch of this capillary bed, drawn from the same model as the body view.',
  };
}
