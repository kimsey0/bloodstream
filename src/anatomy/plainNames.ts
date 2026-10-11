/**
 * Everyday names for the circulation's anatomical names, for viewers without anatomy training.
 * Segment names are "<place>" or "<place>: <part>", where a place may start with "left " or "right ".
 */

/** Places (without left/right), anatomical → everyday. Names not listed are already plain. */
const PLACES: Record<string, string> = {
  // Organ beds
  'gluteal & pelvic muscle': 'buttock & hip muscles',
  'thigh bone & connective tissue': 'thigh bone & tissue',
  'lower leg bone & connective tissue': 'lower leg bone & tissue',
  'arm bone & connective tissue': 'arm bone & tissue',
  'Trunk wall muscle': 'Torso muscles',
  'Trunk skin': 'Torso skin',
  'Trunk bone, fat & connective tissue': 'Torso bone, fat & tissue',
  'Myocardium (left coronary)': 'Heart muscle (left heart artery)',
  'Myocardium (right coronary)': 'Heart muscle (right heart artery)',
  'Brain (left hemisphere)': 'Brain (left half)',
  'Brain (right hemisphere)': 'Brain (right half)',
  'Bronchial circulation': 'Airway walls',
  'Lung alveoli': 'Lung air sacs',
  // Arteries
  'Aortic root': 'Aorta, at the heart',
  'Ascending aorta': 'Aorta, rising from the heart',
  'Descending thoracic aorta': 'Aorta in the chest',
  'Abdominal aorta (suprarenal)': 'Aorta in the belly, above the kidneys',
  'Abdominal aorta (infrarenal)': 'Aorta in the belly, below the kidneys',
  'Brachiocephalic trunk': 'Artery to the right arm & head',
  'common carotid artery': 'carotid artery (neck)',
  'subclavian artery': 'artery under the collarbone',
  'axillary & brachial arteries': 'armpit & upper arm artery',
  'radial & ulnar arteries': 'forearm arteries',
  'Left coronary artery': 'Left heart artery (coronary)',
  'Right coronary artery': 'Right heart artery (coronary)',
  'Pulmonary trunk': 'Main lung artery',
  'pulmonary artery': 'lung artery',
  'Coeliac trunk': 'Artery to the stomach, liver & spleen',
  'Splenic & gastric arteries': 'Arteries to the spleen & stomach',
  'Hepatic artery': 'Liver artery',
  'Superior & inferior mesenteric arteries': 'Arteries to the intestines',
  'renal artery': 'kidney artery',
  'common iliac artery': 'hip artery',
  'internal iliac artery': 'artery to the pelvis',
  'external iliac & femoral arteries': 'groin & thigh artery',
  'popliteal & tibial arteries': 'knee & shin arteries',
  'dorsalis pedis & plantar arteries': 'foot arteries',
  // Veins
  'Superior vena cava': 'Main vein from the upper body',
  'Inferior vena cava (infrarenal)': 'Main vein from the lower body, below the kidneys',
  'Inferior vena cava (renal to hepatic)': 'Main vein from the lower body, kidneys to liver',
  'Inferior vena cava (hepatic to heart)': 'Main vein from the lower body, liver to heart',
  'internal jugular vein': 'jugular vein (neck)',
  'brachiocephalic vein': 'vein from the head & arm',
  'subclavian vein': 'vein under the collarbone',
  'brachial & basilic veins': 'upper arm veins',
  'Azygos venous system': 'Veins of the chest wall',
  'Coronary sinus': "Heart muscle's main vein",
  'pulmonary veins': 'lung veins',
  'Hepatic veins': 'Liver veins',
  'Hepatic portal vein': 'Portal vein, gut to liver',
  'Superior mesenteric vein': 'Vein from the intestines',
  'Splenic vein': 'Vein from the spleen',
  'renal vein': 'kidney vein',
  'common iliac vein': 'hip vein',
  'internal iliac vein': 'vein from the pelvis',
  'femoral & external iliac veins': 'thigh & groin vein',
  'tibial & popliteal veins': 'shin & knee veins',
};

/** Parts of an organ bed (after the colon), anatomical → everyday. */
const PARTS: Record<string, string> = {
  'alveolar capillaries': 'capillaries round the air sacs',
  'hepatic arterioles': 'arterioles',
  'portal venules': 'venules from the gut',
  sinusoids: 'leaky capillaries (sinusoids)',
  'central & sublobular veins': 'small veins',
  'interlobar arteries & afferent arterioles': 'arteries & arterioles to the filters',
  'glomerular capillaries': 'filtering capillaries',
  'efferent arterioles': 'arterioles leaving the filters',
  'peritubular capillaries': 'capillaries round the tubules',
};

function place(name: string): string {
  const side = /^(left|right) /.exec(name);
  const rest = side ? name.slice(side[0].length) : name;
  const plain = PLACES[rest];
  return plain === undefined ? name : side ? side[0] + plain : plain;
}

/** The everyday form of a segment name (or of its place alone); unchanged if it is already plain. */
export function everydayName(name: string): string {
  const colon = name.indexOf(': ');
  if (colon < 0) return place(name);
  const part = name.slice(colon + 2);
  return `${place(name.slice(0, colon))}: ${PARTS[part] ?? part}`;
}

/** Anatomical names that need no everyday form, for the test that keeps the table complete. */
export const ALREADY_PLAIN = new Set([
  'kidney',
  'Liver',
  'Intestines',
  'Spleen, stomach & pancreas',
  'lung',
  'thigh skin',
  'thigh muscle',
  'pelvic organs & bone',
  'lower leg skin',
  'hand skin',
  'hand muscle, bone & tendon',
  'foot skin',
  'foot muscle, bone & tendon',
  'calf muscle',
  'arm skin',
  'arm muscle',
  'Face & scalp (left)',
  'Face & scalp (right)',
  'forearm veins',
  'foot veins',
  'Right atrium',
  'Right ventricle',
  'Left atrium',
  'Left ventricle',
  'Aortic arch',
  'arterioles',
  'capillaries',
  'venules & veins',
  'arteries & arterioles',
  // Microscope bed labels
  'Heart muscle',
  'Brain',
  'Thigh muscle',
  'Kidney',
  'Fingertip skin',
]);

/** True if the table has an everyday form for this place or part (or it needs none). */
export function hasEverydayForm(placeOrPart: string): boolean {
  const rest = placeOrPart.replace(/^(left|right) /, '');
  return rest in PLACES || placeOrPart in PARTS || ALREADY_PLAIN.has(rest);
}
