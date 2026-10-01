/**
 * The stylised vascular anatomy as a list of segments.
 *
 * Named vessels (aorta, carotids, venae cavae, ...) have a length and lumen
 * diameter, so volume = π d²/4 × length. Organ microcirculations are lumped
 * into three segments per bed (small arteries + arterioles, capillaries,
 * venules + unnamed veins). Their volumes are derived from resting RBC
 * transit times in `params.ts`.
 *
 * Dimensions are adult reference values (Gray's Anatomy; Caro et al., The
 * Mechanics of the Circulation). Paired structures are listed per side so
 * that 3D geometry can map 1:1 onto segments later.
 */
import { HCT_RATIO, LUNG, TISSUES, TRANSIT_CV, type Tissue } from './params';

export type SegmentKind = 'chamber' | 'artery' | 'arteriole' | 'capillary' | 'venule' | 'vein';

export type Exchange =
  | { type: 'lung' }
  | { type: 'tissue'; tissue: Tissue; vo2: number; tissuePo2: number };

export interface SegmentDef {
  id: string;
  name: string;
  kind: SegmentKind;
  circuit: 'systemic' | 'pulmonary';
  /** Body region for grouping (e.g. "leg_L", "head"). */
  region: string;
  tissue?: Tissue;
  /** Path length travelled by a cell, mm. */
  length: number;
  /** Lumen diameter of one vessel, mm (representative for lumped segments). */
  diameter: number;
  /** Explicit blood volume, mL (heart chambers). */
  volume?: number;
  /** Mean RBC transit at rest, s. The volume is derived from this and resting flow. */
  restTransit?: number;
  /** Tube/discharge haematocrit ratio (default 1). */
  hctRatio?: number;
  /** Coefficient of variation of individual transit times (default: radial profile). */
  transitCv?: number;
  /** Downstream segment ids. Branching is only allowed in arterial trees. */
  next: string[];
  /** Relative share of upstream flow, set on each bed's entry segment. */
  supply?: number;
  exchange?: Exchange;
}

const defs: SegmentDef[] = [];

function vessel(
  id: string,
  name: string,
  kind: 'artery' | 'vein',
  region: string,
  length: number,
  diameter: number,
  next: string[],
  circuit: 'systemic' | 'pulmonary' = 'systemic',
): void {
  defs.push({ id, name, kind, circuit, region, length, diameter, next });
}

function chamber(id: string, name: string, volume: number, length: number, next: string, circuit: 'systemic' | 'pulmonary'): void {
  const diameter = Math.sqrt((4 * volume * 1000) / (Math.PI * length));
  defs.push({ id, name, kind: 'chamber', circuit, region: 'heart', length, diameter, volume, transitCv: TRANSIT_CV.chamber, next: [next] });
}

interface BedOptions {
  id: string;
  name: string;
  tissue: Tissue;
  region: string;
  /** Share of this tissue's total resting flow and VO2 that goes to this bed. */
  share: number;
  drain: string;
}

/** Standard three-segment microcirculation. Returns the entry segment id. */
function bed({ id, name, tissue, region, share, drain }: BedOptions): string {
  const t = TISSUES[tissue];
  defs.push(
    {
      id: `${id}.art`, name: `${name}: arterioles`, kind: 'arteriole', circuit: 'systemic', region, tissue,
      length: 50, diameter: 0.1, restTransit: t.arterialTransit, hctRatio: HCT_RATIO.arteriole,
      transitCv: TRANSIT_CV.arteriole, supply: t.flowFraction * share, next: [`${id}.cap`],
    },
    {
      id: `${id}.cap`, name: `${name}: capillaries`, kind: 'capillary', circuit: 'systemic', region, tissue,
      length: t.capillaryLength, diameter: t.capillaryDiameter / 1000, restTransit: t.capillaryTransit,
      hctRatio: HCT_RATIO.capillary, transitCv: TRANSIT_CV.capillary, next: [`${id}.ven`],
      exchange: { type: 'tissue', tissue, vo2: t.vo2 * share, tissuePo2: t.tissuePo2 },
    },
    {
      id: `${id}.ven`, name: `${name}: venules & veins`, kind: 'venule', circuit: 'systemic', region, tissue,
      length: 150, diameter: 0.2, restTransit: t.venousTransit, hctRatio: HCT_RATIO.venule,
      transitCv: TRANSIT_CV.venule, next: [drain],
    },
  );
  return `${id}.art`;
}

/** Regional split of muscle, skin and "other" tissue (bone, fat, connective, pelvic organs). */
const SPLIT = {
  muscle: { arm: 0.1, trunk: 0.25, pelvis: 0.075, thigh: 0.12, lowerLeg: 0.08 },
  skin: { head: 0.075, arm: 0.045, hand: 0.03, trunk: 0.35, thigh: 0.09, lowerLeg: 0.055, foot: 0.03 },
  other: { arm: 0.035, hand: 0.015, trunk: 0.3, pelvis: 0.15, thigh: 0.08, lowerLeg: 0.05, foot: 0.02 },
};

const SIDE_NAME = { L: 'left', R: 'right' } as const;

// ---- Heart and pulmonary circulation -------------------------------------

chamber('ra', 'Right atrium', 70, 50, 'rv', 'pulmonary');
chamber('rv', 'Right ventricle', 105, 70, 'pulm_trunk', 'pulmonary');
vessel('pulm_trunk', 'Pulmonary trunk', 'artery', 'thorax', 50, 27, ['pa_L', 'pa_R'], 'pulmonary');
for (const side of ['L', 'R'] as const) {
  const lung = `lung_${side}`;
  const sideName = SIDE_NAME[side];
  vessel(`pa_${side}`, `${sideName} pulmonary artery`, 'artery', lung, side === 'L' ? 40 : 50, side === 'L' ? 20 : 22, [`${lung}.art`], 'pulmonary');
  defs.push(
    {
      id: `${lung}.art`, name: `${sideName} lung: arteries & arterioles`, kind: 'arteriole', circuit: 'pulmonary', region: lung,
      length: 100, diameter: 0.1, restTransit: LUNG.arterialTransit, hctRatio: HCT_RATIO.arteriole, transitCv: TRANSIT_CV.arteriole,
      supply: side === 'L' ? LUNG.leftFraction : 1 - LUNG.leftFraction, next: [`${lung}.cap`],
    },
    {
      id: `${lung}.cap`, name: `${sideName} lung: alveolar capillaries`, kind: 'capillary', circuit: 'pulmonary', region: lung,
      length: LUNG.capillaryLength, diameter: LUNG.capillaryDiameter / 1000, restTransit: LUNG.capillaryTransit,
      hctRatio: HCT_RATIO.pulmonaryCapillary, transitCv: TRANSIT_CV.pulmonaryCapillary, next: [`${lung}.ven`],
      exchange: { type: 'lung' },
    },
    {
      id: `${lung}.ven`, name: `${sideName} lung: venules & veins`, kind: 'venule', circuit: 'pulmonary', region: lung,
      length: 100, diameter: 0.2, restTransit: LUNG.venousTransit, hctRatio: HCT_RATIO.venule, transitCv: TRANSIT_CV.venule,
      next: [`pv_${side}`],
    },
  );
  vessel(`pv_${side}`, `${sideName} pulmonary veins`, 'vein', lung, 30, 21, ['la'], 'pulmonary');
}
chamber('la', 'Left atrium', 70, 50, 'lv', 'systemic');
chamber('lv', 'Left ventricle', 105, 80, 'aortic_root', 'systemic');

// ---- Aorta and coronary circulation --------------------------------------

vessel('aortic_root', 'Aortic root', 'artery', 'heart', 20, 30, ['coronary_L', 'coronary_R', 'aorta_asc']);
vessel('aorta_asc', 'Ascending aorta', 'artery', 'thorax', 50, 30, ['aorta_arch']);
vessel('coronary_L', 'Left coronary artery', 'artery', 'heart', 60, 4, [
  bed({ id: 'heart_L', name: 'Myocardium (left coronary)', tissue: 'heart', region: 'heart', share: 0.7, drain: 'coronary_sinus' }),
]);
vessel('coronary_R', 'Right coronary artery', 'artery', 'heart', 80, 3.5, [
  bed({ id: 'heart_R', name: 'Myocardium (right coronary)', tissue: 'heart', region: 'heart', share: 0.3, drain: 'coronary_sinus' }),
]);
vessel('coronary_sinus', 'Coronary sinus', 'vein', 'heart', 30, 9, ['ra']);

vessel('aorta_arch', 'Aortic arch', 'artery', 'thorax', 50, 27, ['brachiocephalic', 'carotid_L', 'subclavian_L', 'aorta_thoracic']);
vessel('brachiocephalic', 'Brachiocephalic trunk', 'artery', 'thorax', 40, 12, ['carotid_R', 'subclavian_R']);

// ---- Head and arms -------------------------------------------------------

for (const side of ['L', 'R'] as const) {
  const s = SIDE_NAME[side];
  vessel(`carotid_${side}`, `${s} common carotid artery`, 'artery', 'head', side === 'L' ? 110 : 90, 7, [
    bed({ id: `brain_${side}`, name: `Brain (${s} hemisphere)`, tissue: 'brain', region: 'head', share: 0.5, drain: `jugular_${side}` }),
    bed({ id: `head_skin_${side}`, name: `Face & scalp (${s})`, tissue: 'skin', region: 'head', share: SPLIT.skin.head, drain: `jugular_${side}` }),
  ]);
  vessel(`jugular_${side}`, `${s} internal jugular vein`, 'vein', 'head', 150, 11, [`brachiocephalic_vein_${side}`]);

  const arm = `arm_${side}`;
  vessel(`subclavian_${side}`, `${s} subclavian artery`, 'artery', arm, side === 'L' ? 90 : 70, 8, [`brachial_${side}`]);
  vessel(`brachial_${side}`, `${s} axillary & brachial arteries`, 'artery', arm, 500, 4.5, [
    bed({ id: `${arm}.muscle`, name: `${s} arm muscle`, tissue: 'muscle', region: arm, share: SPLIT.muscle.arm, drain: `arm_vein_${side}` }),
    bed({ id: `${arm}.skin`, name: `${s} arm skin`, tissue: 'skin', region: arm, share: SPLIT.skin.arm, drain: `arm_vein_${side}` }),
    bed({ id: `${arm}.other`, name: `${s} arm bone & connective tissue`, tissue: 'other', region: arm, share: SPLIT.other.arm, drain: `arm_vein_${side}` }),
    `forearm_artery_${side}`,
  ]);
  vessel(`forearm_artery_${side}`, `${s} radial & ulnar arteries`, 'artery', arm, 260, 3.5, [
    bed({ id: `${arm}.hand.skin`, name: `${s} hand skin`, tissue: 'skin', region: arm, share: SPLIT.skin.hand, drain: `forearm_vein_${side}` }),
    bed({ id: `${arm}.hand.other`, name: `${s} hand muscle, bone & tendon`, tissue: 'other', region: arm, share: SPLIT.other.hand, drain: `forearm_vein_${side}` }),
  ]);
  vessel(`forearm_vein_${side}`, `${s} forearm veins`, 'vein', arm, 260, 5, [`arm_vein_${side}`]);
  vessel(`arm_vein_${side}`, `${s} brachial & basilic veins`, 'vein', arm, 500, 7, [`subclavian_vein_${side}`]);
  vessel(`subclavian_vein_${side}`, `${s} subclavian vein`, 'vein', arm, 80, 11, [`brachiocephalic_vein_${side}`]);
  vessel(`brachiocephalic_vein_${side}`, `${s} brachiocephalic vein`, 'vein', 'thorax', side === 'L' ? 60 : 25, 13, ['svc']);
}
vessel('svc', 'Superior vena cava', 'vein', 'thorax', 70, 20, ['ra']);

// ---- Thorax and trunk wall -----------------------------------------------

vessel('aorta_thoracic', 'Descending thoracic aorta', 'artery', 'thorax', 200, 24, [
  bed({ id: 'bronchial', name: 'Bronchial circulation', tissue: 'bronchial', region: 'thorax', share: 1, drain: 'pv_R' }),
  bed({ id: 'trunk.muscle', name: 'Trunk wall muscle', tissue: 'muscle', region: 'trunk', share: SPLIT.muscle.trunk, drain: 'azygos' }),
  bed({ id: 'trunk.skin', name: 'Trunk skin', tissue: 'skin', region: 'trunk', share: SPLIT.skin.trunk, drain: 'azygos' }),
  bed({ id: 'trunk.other', name: 'Trunk bone, fat & connective tissue', tissue: 'other', region: 'trunk', share: SPLIT.other.trunk, drain: 'azygos' }),
  'aorta_abdominal',
]);
vessel('azygos', 'Azygos venous system', 'vein', 'trunk', 250, 8, ['svc']);

// ---- Abdomen -------------------------------------------------------------

vessel('aorta_abdominal', 'Abdominal aorta (suprarenal)', 'artery', 'abdomen', 60, 20, ['celiac', 'sma', 'renal_L', 'renal_R', 'aorta_infrarenal']);
vessel('aorta_infrarenal', 'Abdominal aorta (infrarenal)', 'artery', 'abdomen', 70, 18, ['iliac_L', 'iliac_R']);
vessel('celiac', 'Coeliac trunk', 'artery', 'abdomen', 20, 7, ['hepatic_artery', 'splenic_artery']);
vessel('hepatic_artery', 'Hepatic artery', 'artery', 'abdomen', 80, 5, ['liver.art']);
vessel('splenic_artery', 'Splenic & gastric arteries', 'artery', 'abdomen', 100, 5.5, [
  bed({ id: 'spleen_stomach', name: 'Spleen, stomach & pancreas', tissue: 'gut', region: 'abdomen', share: 0.32, drain: 'splenic_vein' }),
]);
vessel('sma', 'Superior & inferior mesenteric arteries', 'artery', 'abdomen', 150, 7, [
  bed({ id: 'intestine', name: 'Intestines', tissue: 'gut', region: 'abdomen', share: 0.68, drain: 'smv' }),
]);
vessel('splenic_vein', 'Splenic vein', 'vein', 'abdomen', 150, 8, ['portal_vein']);
vessel('smv', 'Superior mesenteric vein', 'vein', 'abdomen', 150, 10, ['portal_vein']);
vessel('portal_vein', 'Hepatic portal vein', 'vein', 'abdomen', 70, 13, ['liver.portal']);

// Liver: dual supply (hepatic artery ~25 %, portal vein ~75 %) into shared sinusoids.
{
  const t = TISSUES.liver;
  defs.push(
    {
      id: 'liver.art', name: 'Liver: hepatic arterioles', kind: 'arteriole', circuit: 'systemic', region: 'abdomen', tissue: 'liver',
      length: 40, diameter: 0.1, restTransit: t.arterialTransit, hctRatio: HCT_RATIO.arteriole, transitCv: TRANSIT_CV.arteriole,
      supply: t.flowFraction, next: ['liver.cap'],
    },
    {
      id: 'liver.portal', name: 'Liver: portal venules', kind: 'venule', circuit: 'systemic', region: 'abdomen', tissue: 'liver',
      length: 40, diameter: 0.2, restTransit: 3, hctRatio: HCT_RATIO.venule, transitCv: TRANSIT_CV.venule, next: ['liver.cap'],
    },
    {
      id: 'liver.cap', name: 'Liver: sinusoids', kind: 'capillary', circuit: 'systemic', region: 'abdomen', tissue: 'liver',
      length: t.capillaryLength, diameter: t.capillaryDiameter / 1000, restTransit: t.capillaryTransit,
      hctRatio: HCT_RATIO.capillary, transitCv: TRANSIT_CV.capillary, next: ['liver.ven'],
      exchange: { type: 'tissue', tissue: 'liver', vo2: t.vo2, tissuePo2: t.tissuePo2 },
    },
    {
      id: 'liver.ven', name: 'Liver: central & sublobular veins', kind: 'venule', circuit: 'systemic', region: 'abdomen', tissue: 'liver',
      length: 60, diameter: 0.2, restTransit: t.venousTransit, hctRatio: HCT_RATIO.venule, transitCv: TRANSIT_CV.venule,
      next: ['hepatic_veins'],
    },
  );
}
vessel('hepatic_veins', 'Hepatic veins', 'vein', 'abdomen', 40, 20, ['ivc_thoracic']);

// Kidneys: two capillary beds in series (glomerulus, then peritubular).
for (const side of ['L', 'R'] as const) {
  const s = SIDE_NAME[side];
  const k = `kidney_${side}`;
  const t = TISSUES.kidney;
  vessel(`renal_${side}`, `${s} renal artery`, 'artery', 'abdomen', side === 'L' ? 40 : 50, 5.5, [`${k}.art`]);
  defs.push(
    {
      id: `${k}.art`, name: `${s} kidney: interlobar arteries & afferent arterioles`, kind: 'arteriole', circuit: 'systemic', region: 'abdomen', tissue: 'kidney',
      length: 40, diameter: 0.1, restTransit: t.arterialTransit, hctRatio: HCT_RATIO.arteriole, transitCv: TRANSIT_CV.arteriole,
      supply: t.flowFraction / 2, next: [`${k}.glom`],
    },
    {
      id: `${k}.glom`, name: `${s} kidney: glomerular capillaries`, kind: 'capillary', circuit: 'systemic', region: 'abdomen', tissue: 'kidney',
      length: 0.3, diameter: 0.007, restTransit: 0.3, hctRatio: HCT_RATIO.capillary, transitCv: TRANSIT_CV.capillary, next: [`${k}.eff`],
    },
    {
      id: `${k}.eff`, name: `${s} kidney: efferent arterioles`, kind: 'arteriole', circuit: 'systemic', region: 'abdomen', tissue: 'kidney',
      length: 5, diameter: 0.02, restTransit: 1, hctRatio: HCT_RATIO.arteriole, transitCv: TRANSIT_CV.arteriole, next: [`${k}.cap`],
    },
    {
      id: `${k}.cap`, name: `${s} kidney: peritubular capillaries`, kind: 'capillary', circuit: 'systemic', region: 'abdomen', tissue: 'kidney',
      length: t.capillaryLength, diameter: t.capillaryDiameter / 1000, restTransit: t.capillaryTransit,
      hctRatio: HCT_RATIO.capillary, transitCv: TRANSIT_CV.capillary, next: [`${k}.ven`],
      exchange: { type: 'tissue', tissue: 'kidney', vo2: t.vo2 / 2, tissuePo2: t.tissuePo2 },
    },
    {
      id: `${k}.ven`, name: `${s} kidney: venules & veins`, kind: 'venule', circuit: 'systemic', region: 'abdomen', tissue: 'kidney',
      length: 40, diameter: 0.2, restTransit: t.venousTransit, hctRatio: HCT_RATIO.venule, transitCv: TRANSIT_CV.venule,
      next: [`renal_vein_${side}`],
    },
  );
  vessel(`renal_vein_${side}`, `${s} renal vein`, 'vein', 'abdomen', side === 'L' ? 75 : 25, 10, ['ivc_suprarenal']);
}

// ---- Pelvis and legs -----------------------------------------------------

for (const side of ['L', 'R'] as const) {
  const s = SIDE_NAME[side];
  const leg = `leg_${side}`;
  vessel(`iliac_${side}`, `${s} common iliac artery`, 'artery', 'pelvis', 50, 10, [`int_iliac_${side}`, `femoral_${side}`]);
  vessel(`int_iliac_${side}`, `${s} internal iliac artery`, 'artery', 'pelvis', 40, 6, [
    bed({ id: `pelvis_${side}.muscle`, name: `${s} gluteal & pelvic muscle`, tissue: 'muscle', region: 'pelvis', share: SPLIT.muscle.pelvis, drain: `int_iliac_vein_${side}` }),
    bed({ id: `pelvis_${side}.other`, name: `${s} pelvic organs & bone`, tissue: 'other', region: 'pelvis', share: SPLIT.other.pelvis, drain: `int_iliac_vein_${side}` }),
  ]);
  vessel(`femoral_${side}`, `${s} external iliac & femoral arteries`, 'artery', leg, 450, 7, [
    bed({ id: `${leg}.thigh.muscle`, name: `${s} thigh muscle`, tissue: 'muscle', region: leg, share: SPLIT.muscle.thigh, drain: `femoral_vein_${side}` }),
    bed({ id: `${leg}.thigh.skin`, name: `${s} thigh skin`, tissue: 'skin', region: leg, share: SPLIT.skin.thigh, drain: `femoral_vein_${side}` }),
    bed({ id: `${leg}.thigh.other`, name: `${s} thigh bone & connective tissue`, tissue: 'other', region: leg, share: SPLIT.other.thigh, drain: `femoral_vein_${side}` }),
    `lower_leg_artery_${side}`,
  ]);
  vessel(`lower_leg_artery_${side}`, `${s} popliteal & tibial arteries`, 'artery', leg, 400, 3.5, [
    bed({ id: `${leg}.lower.muscle`, name: `${s} calf muscle`, tissue: 'muscle', region: leg, share: SPLIT.muscle.lowerLeg, drain: `lower_leg_vein_${side}` }),
    bed({ id: `${leg}.lower.skin`, name: `${s} lower leg skin`, tissue: 'skin', region: leg, share: SPLIT.skin.lowerLeg, drain: `lower_leg_vein_${side}` }),
    bed({ id: `${leg}.lower.other`, name: `${s} lower leg bone & connective tissue`, tissue: 'other', region: leg, share: SPLIT.other.lowerLeg, drain: `lower_leg_vein_${side}` }),
    `foot_artery_${side}`,
  ]);
  vessel(`foot_artery_${side}`, `${s} dorsalis pedis & plantar arteries`, 'artery', leg, 150, 2.5, [
    bed({ id: `${leg}.foot.skin`, name: `${s} foot skin`, tissue: 'skin', region: leg, share: SPLIT.skin.foot, drain: `foot_vein_${side}` }),
    bed({ id: `${leg}.foot.other`, name: `${s} foot muscle, bone & tendon`, tissue: 'other', region: leg, share: SPLIT.other.foot, drain: `foot_vein_${side}` }),
  ]);
  vessel(`foot_vein_${side}`, `${s} foot veins`, 'vein', leg, 150, 4, [`lower_leg_vein_${side}`]);
  vessel(`lower_leg_vein_${side}`, `${s} tibial & popliteal veins`, 'vein', leg, 400, 6, [`femoral_vein_${side}`]);
  vessel(`femoral_vein_${side}`, `${s} femoral & external iliac veins`, 'vein', leg, 450, 11, [`common_iliac_vein_${side}`]);
  vessel(`int_iliac_vein_${side}`, `${s} internal iliac vein`, 'vein', 'pelvis', 40, 10, [`common_iliac_vein_${side}`]);
  vessel(`common_iliac_vein_${side}`, `${s} common iliac vein`, 'vein', 'pelvis', 60, 13, ['ivc_infrarenal']);
}
vessel('ivc_infrarenal', 'Inferior vena cava (infrarenal)', 'vein', 'abdomen', 100, 22, ['ivc_suprarenal']);
vessel('ivc_suprarenal', 'Inferior vena cava (renal to hepatic)', 'vein', 'abdomen', 100, 24, ['ivc_thoracic']);
vessel('ivc_thoracic', 'Inferior vena cava (hepatic to heart)', 'vein', 'thorax', 30, 25, ['ra']);

export const SEGMENT_DEFS: readonly SegmentDef[] = defs;
