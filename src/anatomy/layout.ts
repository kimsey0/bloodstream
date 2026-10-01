/**
 * Stylised 3D layout of the vascular graph for a 175 cm adult.
 *
 * Units are centimetres. y is up (0 = floor), +x is the body's LEFT side (so
 * it appears on the right when viewed from the front), +z is anterior.
 *
 * Named vessels list their own control points. Organ microcirculations get
 * a bed centre, and their arteriole/capillary/venule paths are generated
 * around it (see paths.ts). Segments are joined end to start automatically,
 * so the points here only need to be roughly in the right place.
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
  renal_L: [[4, 107, -4], [6, 104, -5]],
  renal_R: [[-3, 107, -4], [-6, 104, -5]],
  renal_vein_L: [[6, 103, -4], [2, 106.5, -1]],
  renal_vein_R: [[-6, 103, -4], [-2.5, 106.5, -2]],
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
