# Sources and parameter register

Every physiological number in the model, with where it comes from, so an
audit can check each one. Numbers that are pure presentation (chart sizes,
colours, the number of tracer cells) are not listed.

**Status** of each number:

- **M**: measured value, taken from the source at the location given.
- **T**: textbook reference value; chapter given, page not recorded.
- **D**: derived by calculation from sourced values (the calculation is
  stated).
- **F**: fitted. Set so that a model output matches a measured value, which
  is named. The fit target is sourced; the parameter itself is not.
- **A**: assumption, with no specific source. The best candidates for
  future work.

When a change adds or alters a physiological number, update this file in
the same commit.

## References

| Key | Reference | Used for |
|---|---|---|
| Severinghaus 1979 | Severinghaus JW. Simple, accurate equations for human blood O2 dissociation computations. *J Appl Physiol* 46:599–602, 1979. | Dissociation curve and its pH, PCO2 and temperature corrections |
| Imai 1982 | Imai K. *Allosteric Effects in Haemoglobin*. Cambridge UP, 1982; constants as tabulated in *Zool Sci* 18:905, 2001. | Adair constants |
| Unzai 1998 | Unzai S et al. *J Biol Chem*, 1998; and Gibson QH, earlier kinetic work (volume and pages not recorded). | O2 on- and off-rate ranges |
| Guyton & Hall | Hall JE. *Guyton and Hall Textbook of Medical Physiology*, 14th ed. | Cardiac output, VO2, blood volume distribution (ch. 14), exercise (ch. 85) |
| Ganong | Barrett KE et al. *Ganong's Review of Medical Physiology*, 26th ed., Table 32-1. | Resting organ flows and VO2 |
| West RP | West JB. *Respiratory Physiology: The Essentials*, 10th ed., ch. 3. | Pulmonary transit 0.75 s, equilibrium at ~0.25 s, DLO2 range |
| Pries 1990 | Pries AR et al. *Circ Res* 67:826, 1990; Desjardins C, Duling BR, 1990. | Tube/discharge haematocrit (Fåhraeus effect) |
| Evans & Fung 1972 | Evans E, Fung YC. *Microvasc Res* 4:335, 1972. | Red-cell shape |
| Weissler | Weissler AM et al., systolic time intervals. | Ejection duration vs heart rate |
| Åstrand & Rodahl | Åstrand P-O, Rodahl K. *Textbook of Work Physiology*. | Exercise anchors, respiratory exchange ratio |
| Rowell 1986 | Rowell LB. *Human Circulation: Regulation during Physical Stress*, 1986. | Flow redistribution in exercise |
| Saltin & Gollnick | Saltin B, Gollnick PD. *Handbook of Physiology*, Skeletal Muscle, 1983. | Muscle capillary recruitment |
| Hsia 1999 | Hsia CCW. *Respir Physiol*, 1999 (volume and pages not recorded). | Pulmonary capillary recruitment in exercise |
| Dempsey & Wagner 1999 | Dempsey JA, Wagner PD. Exercise-induced arterial hypoxemia. *J Appl Physiol* 87:1997–2006, 1999. | Arterial blood gases at VO2max |
| Hopkins 1996 | Hopkins SR et al. Pulmonary transit time and diffusion limitation during heavy exercise in athletes. *Respir Physiol* 103:67–73, 1996. | DLO2, transit times at VO2max |
| Hopkins 2024 | Hopkins SR, Dempsey JA, Stickland MK. *Med Sci Sports Exerc* 56:1538–1541, 2024. | Transit-time distribution at VO2max |
| Calbet 2005 | Calbet JAL et al. Why do arms extract less oxygen than legs during exercise? *Am J Physiol Regul Integr Comp Physiol* 289:R1448–R1458, 2005. | Arterial, femoral venous and right atrial blood gases; in vivo P50 |
| González-Alonso & Calbet 2003 | González-Alonso J, Calbet JAL. *Circulation* 107:824–830, 2003. | Femoral venous blood and temperature at VO2max |
| Richardson 1995 | Richardson RS et al. Myoglobin O2 desaturation during exercise. *J Clin Invest* 96:1916–1926, 1995. | Intracellular PO2, myoglobin P50, muscle DO2 |
| Richardson 2006 | Richardson RS et al. *J Physiol* 571:415–424, 2006. | Resting intracellular PO2 |
| Wagner 1996 | Wagner PD. Determinants of maximal oxygen transport and utilization. *Annu Rev Physiol* 58:21–50, 1996. | Muscle venous blood at VO2max, intracellular PO2 |
| Geers & Gros 2000 | Geers C, Gros G. *Physiol Rev* 80:681–715, 2000 (as summarised by *Deranged Physiology*, "Transport of carbon dioxide in the blood"). | Cross-check of the CO2 a–v difference |
| West 1983 | West JB et al. Pulmonary gas exchange on the summit of Mount Everest. *J Appl Physiol* 55:678–687, 1983. **Seen only as a search-result summary, not read in full.** | Summit and 7,830 m alveolar gases |
| West 1996 | West JB. Prediction of barometric pressures at high altitudes with the use of model atmospheres. *J Appl Physiol* 81:1850–1854, 1996. | Barometric pressure vs altitude |
| Roughton & Darling 1944 | Roughton FJW, Darling RC. *Am J Physiol* 141:17–31, 1944. | Method for the CO-shifted curve (not checked numerically against the paper) |
| ATS/ERS 2017 | Graham BL et al. *Eur Respir J* 49:1600016, 2017 (Hb correction of DLCO after Cotes). | Lung diffusing capacity vs Hb |
| Varat 1972 | Varat MA, Adolph RJ, Fowler NO. Cardiovascular effects of anemia. *Am Heart J* 83:415–426, 1972. | Cardiac output, coronary and cerebral flow in anaemia |
| Brutsaert 2000 | Brutsaert TD et al. *Am J Phys Anthropol* 113:169–181, 2000. | SaO2 at 3,600–3,850 m in acclimatized lowlanders, rest and exercise |
| Machado 2009 | Machado GM, Oliveira MM, Fernandes LAF. *IEEE TVCG* 15:1291, 2009. | Colour-vision-deficiency simulation |

Read but not used: Luft UC et al., *J Appl Physiol* 2:37, 1949 (alveolar
gases in the seconds after rapid decompression; not relevant to
acclimatized altitude).

## Parameters

### Blood and haemoglobin (`src/physiology/dissociation.ts`, `hemoglobin.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Dissociation curve, P50 | Severinghaus equation, 26.86 mmHg | M | Severinghaus 1979 |
| pH / CO2 / temperature corrections | 0.40 per pH unit, 0.06 per log10 PCO2, 0.024 per °C | M | Severinghaus 1979 |
| Normal Hb | 15 g/dL | T | Guyton & Hall |
| Hüfner's constant | 1.34 mL O2/g | T | Guyton & Hall |
| O2 solubility | 0.003 mL/dL/mmHg; 1.38 µM/mmHg | T | Guyton & Hall |
| Adair constants k1–k4 | 0.0037, 0.047, 0.012, 1.1 mmHg⁻¹ | M | Imai 1982 |
| O2 on-rates per site | 8, 10, 15, 30 µM⁻¹s⁻¹ | A | Chosen inside the T- and R-state ranges of Unzai 1998 / Gibson |
| Hb molecules per red cell | 2.7 × 10⁸ | D | MCH 30 pg ÷ 64.5 kDa |
| CO-shifted curve | Haldane competition with COHb held constant | D | Method of Roughton & Darling 1944 |

### Blood chemistry (`dissociation.ts`, `activity.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| CO2 capacitance | 0.55 mL/dL/mmHg | D | Calbet 2005 Table 2: leg CO2 output over PCO2 rise, rest and max |
| pH fall per mmHg PCO2 | 0.004 | D | Calbet 2005 Table 2: femoral vs arterial, rest (7.41 → 7.38, 38.9 → 46.6) and max (7.33 → 7.19, 34.9 → 72.2) |
| Respiratory exchange ratio | 0.8 / 0.85 / 0.95 / 1.1 (rest → max) | T, A | Rest and max: Åstrand & Rodahl; walking and jogging interpolated |
| Arterial PCO2 at max | 34 mmHg | M | Calbet 2005 Table 2 (34.9); Dempsey & Wagner 1999 p.1999 ("30–35") |
| Arterial lactic pH fall at max | 0.09 (pH 7.33) | F | Calbet 2005 Table 2 arterial pH 7.33 |
| Arterial temperature rise at max | 1.5 °C | M | Dempsey & Wagner 1999 p.2000 (1.5–2 °C over a progressive test) |
| Working-muscle venous minus arterial temperature | 0.2 °C at max | M | González-Alonso & Calbet 2003, Fig. 1 legend (~0.1 °C above core) |
| Walking / jogging arterial PCO2, acid, temperature | 40 / 38 mmHg; 0 / 0.02; 0.2 / 0.8 °C | A | Interpolated between rest and max |

### Circulation at rest (`params.ts`, `anatomy.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Cardiac output, heart rate, VO2 | 5 L/min, 70 bpm, 250 mL/min | T | Guyton & Hall |
| Blood volume distribution | heart 7 %, pulmonary 9 %, systemic arteries 13 %, arterioles + capillaries 7 %, veins 64 % | T | Guyton & Hall ch. 14 |
| Organ flow fractions and VO2 | `TISSUES` | T, D | Ganong Table 32-1, rescaled to 5 L/min and 250 mL/min |
| Named-vessel lengths and diameters | `anatomy.ts` | T | Gray's Anatomy; Caro, *The Mechanics of the Circulation* (pages not recorded) |
| Arteriole and venous transit times per tissue | `TISSUES` | F | Chosen so blood volume matches the Guyton & Hall distribution |
| Capillary transit, length, diameter per tissue | `TISSUES` | A | "Typical" values, no specific source |
| Pulmonary capillary transit | 0.75 s | T | West RP ch. 3 |
| Tube/discharge haematocrit ratios | 0.9 / 0.6 / 0.85 / 0.95 | M | Pries 1990 |
| Transit-time coefficients of variation | 0.3–0.5 | A | Pulmonary 0.4 is consistent with Hopkins 1996 p.71 (~40 % of transits < 0.3 s at max) |
| Regional splits of muscle, skin, other (`SPLIT`, `EXERCISE`) | `anatomy.ts` | A | |
| Muscle mass | 28 kg | A | ~40 % of 70 kg |

### Tissue O2 (`params.ts`, `circulation.ts`, `oxygen.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Resting muscle intracellular PO2 | 34 mmHg | M | Richardson 2006 Table 1 (34 ± 6) |
| Resting brain tissue PO2 | 25 mmHg | A | Clinical brain-tissue O2 monitoring normal range 20–35 mmHg (no specific reference) |
| Resting heart, kidney, gut, liver, skin, bronchial, other tissue PO2 | 10, 30, 30, 25, 30, 25, 20 mmHg | A | "Typical interstitial", no specific source |
| Diffusing capacity rise with flow (muscle, heart) | DmO2 ∝ flow^0.9 | F | Thigh intracellular PO2 at max = 3.1 ± 0.3 mmHg (Richardson 1995 Table I) |
| Myoglobin P50 | 3.2 mmHg | M | Richardson 1995 (value used for ~39 °C) |

### Lungs and exercise (`activity.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Max cardiac output / VO2 / heart rate | 22 L/min, 3.25 L/min, 185 bpm | T | Guyton & Hall ch. 85; Åstrand & Rodahl |
| Walking and jogging CO, VO2, HR | 9 / 16 L/min, 0.875 / 2.0 L/min, 100 / 145 bpm | T, A | Åstrand & Rodahl (approximate) |
| Flow redistribution in exercise | `ANCHORS.tissueFlow` | T, A | Rowell 1986 (directions and rough factors); exact values assumed |
| Muscle capillary recruitment | up to 4× | T | Saltin & Gollnick; intermediates assumed |
| Muscle arteriole dilation | up to 2× | A | |
| Pulmonary capillary recruitment | up to 2.2× | T | Hsia 1999; keeps transit near 0.4 s (Hopkins 1996 p.71: 0.39–0.41 s) |
| DLO2 at rest | 25 mL/min/mmHg | T | West RP (20–30) |
| DLO2 walking / jogging / max | 35 / 62 / 85 | F | Alveolar–arterial difference rising to 15–25 mmHg at max for VO2max 35–55 (Dempsey & Wagner 1999 p.1998–1999). Compare Hopkins 1996 Table 1: 108 at a cardiac output of 33 L/min |
| Alveolar PO2 at max | 115 mmHg | M | Richardson 1995 Fig. 9 shows ~120 mmHg in knee-extensor exercise; a search summary of the exercise literature gave ~115. Not checked against whole-body data |
| Ejection duration | 0.30 s at 70 bpm → 0.20 s at 180 | T | Weissler |
| Diastolic aortic flow, pulsatility per vessel class | 0.03; α 0.08–0.9 | A | |

### "What if" scenarios (`scenario.ts`, `compensation.ts`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Barometric pressure vs altitude | exp(6.63268 − 0.1112 h − 0.00149 h²) | M | West 1996 |
| Acclimatized arterial PCO2 vs pressure | 40 at 760, 14.3 at 288, 7.5 at 253 mmHg | M, A | Endpoints West 1983 (summary only); linear interpolation assumed |
| Lung diffusing capacity vs Hb | DL ∝ 1.7 Hb / (10.22 + Hb) | M | ATS/ERS 2017 (Cotes) |
| Extraction a tissue takes before raising flow | 2 × normal | F | Resting cardiac output starts rising near Hb 7 g/dL, then roughly linearly (Varat 1972 p.415, p.418) |
| Heart holds its O2 delivery | | M | Varat 1972 p.417: coronary flow rises with cardiac output or more; coronary sinus PO2 unchanged in anaemic dogs; myocardial extraction ~70 % |
| Maximal dilation: heart / brain / other | 4× / 2× / 3× | A | Coronary flow reserve and maximal cerebral vasodilation as commonly quoted; 3× assumed |
| Lowest tissue PO2 before rescue dilation | 2 mmHg | A | |
| Muscle flow during compensation | as other tissues (2 × extraction, 3× dilation) | A | Varat 1972 p.417: femoral flow rose in proportion to cardiac output in anaemic dogs |
| Cardiac output cap | 22 L/min | T | Max exercise anchor |
| Heart rate scales with cardiac output | | A | |
| Everest preset Hb | 18.5 g/dL | A | |

### Microscope (`src/micro/`)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Mean corpuscular volume, haematocrit | 90 fL, 0.45 | T | Guyton & Hall |
| Terminal arteriole / collecting venule speeds | 2.5 / 1.2 mm/s | A | Within the 0.2–4 mm/s range in README |
| Red-cell shape | Evans–Fung biconcave disc | M | Evans & Fung 1972 |
| Tissue geometry (fibre radii, capillary counts) | `beds.ts` | A | "Typical histology" |

## Validation targets

These are model outputs checked by tests against a source. They are not
parameters.

| Output | Test file | Source |
|---|---|---|
| Arterial and mixed venous SO2 and PO2 at rest | `oxygen.test.ts` | Guyton & Hall; West RP |
| Coronary sinus, jugular and renal venous SO2 | `oxygen.test.ts` | Guyton & Hall (ranges) |
| Lung equilibration ~0.25 s of 0.75 s | `oxygen.test.ts` | West RP ch. 3 |
| Mixed venous PCO2 / pH at rest | `bohr.test.ts` | Guyton & Hall; Calbet 2005 Table 2 |
| Femoral venous P50 at max, 37.5 ± 3.1 | `bohr.test.ts` | Calbet 2005 Table 3 |
| Femoral venous pH, PCO2; arterial pH, PCO2 at max | `activity.test.ts` | Calbet 2005 Table 2; Richardson 1995 Table I |
| A–a difference 15–25 mmHg at max, rising with work | `activity.test.ts` | Dempsey & Wagner 1999 p.1998–1999 |
| Thigh intracellular PO2 2–4 mmHg at max, < 6 at jogging | `diffusion.test.ts` | Richardson 1995 Table I |
| Myoglobin saturation at rest and max | `diffusion.test.ts` | Richardson 2006 Table 1; Richardson 1995 Table I |
| Thigh DmO2 per kg at max | `diffusion.test.ts` | Richardson 1995 Table I (35.3 for ~2.5 kg) |
| Thigh mean capillary PO2 at max | `diffusion.test.ts` | Richardson 1995 Table I (37.5); Calbet 2005 (33.8) |
| Summit barometric and alveolar PO2 | `scenario.test.ts` | West 1996; West 1983 |
| Resting SaO2 at 3,700 m, Hb 17.6 | `scenario.test.ts` | Brutsaert 2000 Table 4 (92.0 %) |
| Resting cardiac output vs Hb | `scenario.test.ts` | Varat 1972 p.415, p.418 |

## Known disagreements

| Output | Model | Measured | Likely cause |
|---|---|---|---|
| SaO2 walking at 3,700 m, Hb 17.6 (VO2 ~0.9–1.1 L/min) | 81 % | 88.9 % (Brutsaert 2000 Table 4) | No ventilation–perfusion mismatch, so the lungs' sea-level diffusing capacity was fitted to carry the whole A–a difference. That makes diffusion limitation too strong at altitude. |
| SaO2 at ~2 L/min VO2 at 3,700 m | 70 % | 86.6 % | Same |
| Thigh mean capillary PO2 at max | 30 mmHg | 33.8–37.5 | |
| Mixed venous PCO2 at rest | 47 mmHg | 45–46 (textbook) | Straight-line CO2 slopes fitted to Calbet 2005 |
| Cerebral flow in anaemia | unchanged until brain extraction doubles (Hb ~8) | rises; delivery only slightly reduced (Varat 1972 p.417) | One extraction reserve for all tissues except the heart |
| Heart rate in anaemia | rises with cardiac output | stroke volume rises, tachycardia "frequently absent" (Varat 1972 p.415, p.418) | Heart rate scales with cardiac output |
| Resting heart rate at 3,700 m | 70 bpm | 85 bpm (Brutsaert 2000 Table 2) | No chemoreflex drive on heart rate |
