/**
 * Stylised 3D layout of the vascular graph for a 175 cm adult.
 *
 * Units are centimetres. y is up (0 = floor), +x is the body's LEFT side (so
 * it appears on the right when viewed from the front), +z is anterior.
 *
 * Named vessels list their own control points. Layout-only branches add
 * anatomical side vessels for organ beds to branch from. Organ
 * microcirculations get a bed centre (a tap target); their arteriole,
 * capillary and venule trees are generated in their tissue (see paths.ts).
 * Segments are joined end to start automatically, so the points here only
 * need to be roughly in the right place.
 */

type P = [number, number, number];

/** Mirror a right/left-agnostic point list to one side: x is given for the LEFT side. */
const side = (s: 'L' | 'R', pts: P[]): P[] => pts.map(([x, y, z]) => [s === 'L' ? x : -x, y, z]);

export const VESSEL_POINTS: Record<string, P[]> = {
  // Heart and great vessels
  ra: [[-2.5, 129, 3], [-3, 127, 4.5]],
  rv: [[-1, 125.5, 6], [2, 124.5, 7], [3, 128, 6.5]],
  pulm_trunk: [[2.5, 130, 5], [2, 133, 3]],
  pa_L: [[5, 133, 2], [9, 132, 0]],
  pa_R: [[-2, 133, 2], [-8, 132, 0]],
  pv_L: [[7, 129, 0], [4, 128, 1]],
  pv_R: [[-6, 129, 0], [-1, 128, 1]],
  la: [[2, 128, 1.5], [3, 127, 2.5]],
  lv: [[4.5, 125.5, 4], [6, 123.5, 6], [4, 126, 6], [2, 129, 4.5]],
  aortic_root: [[1.5, 130.5, 4]],
  aorta_asc: [[1, 132, 4], [0.5, 135, 3.5]],
  coronary_L: [[3.5, 129.5, 6], [6, 127, 6.5]],
  coronary_R: [[-0.5, 129.5, 6], [-2.5, 127, 6.5]],
  coronary_sinus: [[1, 125, 1], [-1, 125.5, 2]],
  aorta_arch: [[0, 137, 2], [1, 138.5, -1], [2.5, 137, -4]],
  brachiocephalic: [[-1, 139, 1], [-3, 141.5, 1]],
  svc: [[-2.5, 137, 3], [-2.5, 132, 3]],
  aorta_thoracic: [[3, 134, -4.5], [2, 126, -4.5], [1, 117.5, -3.5]],
  azygos: [[-1.5, 106, -6], [-1.5, 120, -5.5], [-1.5, 133, -3]],

  // Head and neck
  carotid_L: [[2, 141, 0.5], [3, 146, 1], [3.5, 151, 1], [3, 156, 0]],
  carotid_R: [[-3.5, 143.5, 1], [-3.5, 150, 1], [-3, 156, 0]],
  jugular_L: [[4.5, 157, 0], [5, 150, 1.5], [5, 143, 1.5]],
  jugular_R: [[-4.5, 157, 0], [-5, 150, 1.5], [-5, 143, 1.5]],
  brachiocephalic_vein_L: [[4.5, 140.5, 3], [0, 139.5, 3.5], [-2.5, 138, 3]],
  brachiocephalic_vein_R: [[-5, 140.5, 3], [-3, 138.5, 3]],

  // Arms (x given for the left arm, mirrored for the right)
  ...Object.fromEntries(
    (['L', 'R'] as const).flatMap((s) => [
      [`subclavian_${s}`, side(s, s === 'L' ? [[4, 139.5, -1], [12, 142, 0], [18, 141, 0]] : [[5, 142, 0], [12, 143, 0], [18, 141, 0]])],
      [`brachial_${s}`, side(s, [[21, 138, 0], [24, 125, 0], [27, 113, -1]])],
      [`forearm_artery_${s}`, side(s, [[29, 104, 0], [31.5, 92, 1.5], [33, 84, 2.5]])],
      [`forearm_vein_${s}`, side(s, [[32.5, 84, 3.5], [31, 94, 3], [29.5, 105, 2]])],
      [`arm_vein_${s}`, side(s, [[29, 108, 1.5], [28, 114, 0.5], [25, 127, 1], [21.5, 138, 1]])],
      [`subclavian_vein_${s}`, side(s, [[18, 141.5, 1.5], [10, 141, 2], [6, 140.5, 2.5]])],
    ]),
  ),

  // Abdomen
  aorta_abdominal: [[1, 115, -3], [1, 108, -3]],
  aorta_infrarenal: [[1, 105, -2.5], [1, 100.5, -2]],
  celiac: [[1, 110.5, 0]],
  hepatic_artery: [[-3, 111.5, 1], [-7, 112, 1]],
  splenic_artery: [[5, 111.5, 0], [9, 112.5, -1]],
  sma: [[1, 105, 2], [0.5, 99, 4]],
  // Renal vessels end/start at the hilum, on the kidney's medial side.
  renal_L: [[4, 107, -4], [4.8, 104, -5.5]],
  renal_R: [[-3, 107, -4], [-4.6, 103.5, -5.5]],
  renal_vein_L: [[4.6, 102.5, -5], [2, 106.5, -1]],
  renal_vein_R: [[-4.5, 102, -5], [-2.5, 106.5, -2]],
  splenic_vein: [[9, 110, 0.5], [3, 109, 1.5]],
  smv: [[0, 98, 5], [-0.5, 106, 2.5]],
  portal_vein: [[-2, 108.5, 1.5], [-5, 112, 2]],
  hepatic_veins: [[-6, 116, 0], [-3, 117, -0.5]],
  ivc_infrarenal: [[-1.5, 99, -1], [-1.5, 106, -2]],
  ivc_suprarenal: [[-1.5, 107, -2], [-2, 114, -2]],
  ivc_thoracic: [[-2, 117, -1], [-2.5, 123, 2]],

  // Pelvis and legs
  ...Object.fromEntries(
    (['L', 'R'] as const).flatMap((s) => [
      [`iliac_${s}`, side(s, [[4, 96.5, -1], [6, 93, 0]])],
      [`int_iliac_${s}`, side(s, [[6.5, 90, -3]])],
      [`femoral_${s}`, side(s, [[8, 88, 2], [10, 70, 2.5], [10, 52, -1]])],
      [`lower_leg_artery_${s}`, side(s, [[10, 46, -3], [9.5, 25, -2.5], [9, 8, 1]])],
      [`foot_artery_${s}`, side(s, [[9, 5, 4], [9, 3.5, 9]])],
      [`foot_vein_${s}`, side(s, [[8, 3, 9.5], [8.5, 6, 3]])],
      [`lower_leg_vein_${s}`, side(s, [[8.5, 10, 0], [9, 30, -3.5], [9.5, 48, -3.5]])],
      [`femoral_vein_${s}`, side(s, [[9, 53, -1.5], [8.5, 70, 2], [7, 88, 2]])],
      [`int_iliac_vein_${s}`, side(s, [[6, 89, -4.5], [5, 92, -2.5]])],
      [`common_iliac_vein_${s}`, side(s, [[5, 93.5, -1], [2.5, 97, -1]])],
    ]),
  ),
};

/**
 * Layout-only branches: real vessels that are not simulation segments but give an organ bed's
 * strands somewhere anatomical to branch from or drain into (see territories.ts). An artery
 * branch leaves `from` (a named vessel or another branch) at the point nearest its first
 * point; a vein branch joins `into` at the point nearest its last point. Cells travel along
 * them as the first (or last) stretch of their arteriole (or venule) strand.
 */
export interface Branch {
  from?: string;
  into?: string;
  points: P[];
  /** Tube radius, cm (default 0.16). */
  radius?: number;
}

export const BRANCHES: Record<string, Branch> = {
  // Lumbar arteries and ascending lumbar veins: the lower trunk wall's supply, just behind the
  // abdominal aorta and IVC (the thoracic aorta's intercostals cover only the chest).
  lumbar_arteries: { from: 'aorta_thoracic', points: [[1, 116, -5.2], [1, 106, -5.3], [1, 96, -4.6]] },
  ascending_lumbar_vein: { into: 'azygos', points: [[-1.5, 95, -5.6], [-1.5, 103, -6]] },

  // Intestines: the mesenteric arteries and veins running down the mesentery.
  mesenteric_arteries: { from: 'sma', points: [[-0.5, 96, 4.5], [-2, 92.5, 4.5], [-4, 90, 4]] },
  mesenteric_veins: { into: 'smv', points: [[-4, 90.5, 5], [-2, 93, 5.3], [-0.5, 96.5, 5.3]] },

  // Heart: coronary branches in the grooves between chambers, and the cardiac veins.
  lad: { from: 'coronary_L', points: [[5.5, 126, 7.6], [4.5, 123.5, 7.3], [3.5, 121.5, 6]] },
  circumflex: { from: 'coronary_L', points: [[7, 127.5, 4.5], [6.2, 128, 2.2], [4.3, 128.5, 0.8]] },
  posterior_descending: { from: 'coronary_R', points: [[-2.9, 125.5, 4.5], [-2.2, 125.5, 2.5], [0.8, 123.5, 1.3], [2, 122, 2]] },
  great_cardiac_vein: { into: 'coronary_sinus', points: [[3.8, 122, 6.3], [5.2, 125, 7.3], [6.6, 127.8, 5.5], [6.3, 128.2, 2.5], [3.5, 127, 1]] },
  middle_cardiac_vein: { into: 'coronary_sinus', points: [[2.3, 121.8, 2.6], [1.5, 123.5, 1.3]] },

  ...Object.fromEntries(
    (['L', 'R'] as const).flatMap((s): [string, Branch][] => [
      // Brain: cerebral arteries over the hemisphere's surface; dural sinuses to the jugular.
      [`mca_${s}`, { from: `carotid_${s}`, points: side(s, [[3.5, 158, 1], [5.5, 160, 1.5], [6.8, 163, 0.5], [6.5, 166, -2], [4.5, 168, -4.5]]) }],
      [`aca_${s}`, { from: `carotid_${s}`, points: side(s, [[2, 158, 2.5], [0.8, 161, 6.5], [0.8, 166, 6], [0.8, 169.5, 1], [0.8, 168.5, -4]]) }],
      [`pca_${s}`, { from: `carotid_${s}`, points: side(s, [[2.5, 157, -1.5], [3.5, 159.5, -4.5], [3, 162, -7.5]]) }],
      // The superior sagittal sinus is one midline vessel; each side's copy drains to its own jugular.
      [`sagittal_sinus_${s}`, { into: `transverse_sinus_${s}`, radius: 0.22, points: side(s, [[0.3, 168.5, 6.5], [0.3, 170.8, 2], [0.3, 170.5, -3], [0.3, 167.5, -7.5], [0.3, 163, -9]]) }],
      [`transverse_sinus_${s}`, { into: `jugular_${s}`, radius: 0.25, points: side(s, [[0.3, 163, -9], [4, 162, -8.5], [5.5, 160, -5], [5, 157.5, -2]]) }],
      // Face and scalp: external carotid and its facial branch; facial vein.
      [`external_carotid_${s}`, { from: `carotid_${s}`, points: side(s, [[4.5, 152, 2.5], [5.5, 156, 3], [6.8, 160, 1.5], [7.2, 165, 0]]) }],
      [`facial_artery_${s}`, { from: `external_carotid_${s}`, points: side(s, [[4.5, 152, 2.5], [4.8, 154, 4.5], [4, 156.5, 5.5], [3.5, 159, 6.5]]) }],
      [`facial_vein_${s}`, { into: `jugular_${s}`, points: side(s, [[3.2, 159, 6.8], [4.2, 156, 5], [5, 153, 2.5]]) }],
      // Arm: deep brachial artery; cephalic vein (skin).
      [`profunda_brachii_${s}`, { from: `brachial_${s}`, points: side(s, [[22, 134, -0.5], [23.5, 129, -2.5], [25.5, 121, -3], [27, 115, -2.5]]) }],
      [`cephalic_vein_${s}`, { into: `arm_vein_${s}`, radius: 0.2, points: side(s, [[34, 89, 1.5], [31.5, 100, 2.5], [29.5, 111, 3], [25.5, 124, 3], [22.5, 136.5, 2.5]]) }],
      // Pelvis: gluteal arteries.
      [`gluteal_artery_${s}`, { from: `int_iliac_${s}`, points: side(s, [[7.5, 89.5, -4.5], [9.5, 88.5, -6.5], [11, 89, -8]]) }],
      // Leg: deep femoral, anterior tibial and fibular arteries; great and small saphenous veins (skin).
      [`profunda_femoris_${s}`, { from: `femoral_${s}`, points: side(s, [[8.6, 84, 1.5], [11, 78, -1], [11.5, 68, -2], [11, 57, -2.5]]) }],
      [`anterior_tibial_${s}`, { from: `lower_leg_artery_${s}`, points: side(s, [[10.3, 42, -2], [10.8, 38, 1.5], [10.3, 25, 2], [9.5, 11, 2.5]]) }],
      [`fibular_${s}`, { from: `lower_leg_artery_${s}`, points: side(s, [[10, 38, -3], [11, 28, -2], [10.5, 14, -1.5]]) }],
      [`great_saphenous_${s}`, { into: `femoral_vein_${s}`, radius: 0.2, points: side(s, [[6, 50, 1.5], [4.5, 62, 3.5], [4.8, 75, 4.8], [6, 85, 3.8]]) }],
      [`small_saphenous_${s}`, { into: `lower_leg_vein_${s}`, radius: 0.18, points: side(s, [[10.5, 9, -2.8], [10, 20, -4.5], [9.8, 32, -5], [9.6, 44, -4]]) }],
    ]),
  ),
};

/** Centre of each organ microcirculation (keyed by the bed prefix before ".art"/".cap"/...). */
export const BED_CENTERS: Record<string, P> = {
  lung_L: [11, 130, 0],
  lung_R: [-11, 130, 0],
  heart_L: [5, 126.5, 7],
  heart_R: [-1.5, 126, 7.5],
  brain_L: [4, 164, -1],
  brain_R: [-4, 164, -1],
  head_skin_L: [6, 158, 6.5],
  head_skin_R: [-6, 158, 6.5],
  bronchial: [-4, 131, -1.5],
  'trunk.muscle': [0, 115, -10],
  'trunk.skin': [-9, 117, 9],
  'trunk.other': [0, 108, -7],
  spleen_stomach: [9, 113, 0],
  intestine: [0, 97, 5],
  liver: [-8, 114, 2],
  kidney_L: [6.5, 103, -6],
  kidney_R: [-6.5, 103, -6],
  ...Object.fromEntries(
    (['L', 'R'] as const).flatMap((s) => {
      const m = s === 'L' ? 1 : -1;
      return [
        [`arm_${s}.muscle`, [26 * m, 118, 1]],
        [`arm_${s}.skin`, [30 * m, 104, 3]],
        [`arm_${s}.other`, [25 * m, 128, -1]],
        [`arm_${s}.hand.skin`, [34 * m, 78, 3.5]],
        [`arm_${s}.hand.other`, [33 * m, 80, 1]],
        [`leg_${s}.foot.skin`, [9.5 * m, 2.5, 7]],
        [`leg_${s}.foot.other`, [8.5 * m, 4, 3]],
        [`pelvis_${s}.muscle`, [10 * m, 87, -9]],
        [`pelvis_${s}.other`, [4 * m, 88, 2]],
        [`leg_${s}.thigh.muscle`, [10 * m, 68, 1]],
        [`leg_${s}.thigh.skin`, [14 * m, 72, 4]],
        [`leg_${s}.thigh.other`, [9 * m, 64, 0]],
        [`leg_${s}.lower.muscle`, [9 * m, 32, -4]],
        [`leg_${s}.lower.skin`, [10.5 * m, 24, 3]],
        [`leg_${s}.lower.other`, [9 * m, 12, 3]],
      ];
    }),
  ),
};

/** Landmarks for the translucent body and organ shells. */
export const BODY = {
  height: 175,
  center: [0, 105, 0] as P,
};
