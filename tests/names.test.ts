import { describe, expect, it } from 'vitest';
import { everydayName, hasEverydayForm } from '../src/anatomy/plainNames';
import { MICRO_BEDS } from '../src/micro/beds';
import { Circulation } from '../src/sim/circulation';

describe('everyday names', () => {
  const circ = new Circulation();

  it('cover every segment name, so new anatomy gets a plain form too', () => {
    const missing = new Set<string>();
    for (const s of circ.segments) {
      const [place, part] = s.name.split(': ');
      if (!hasEverydayForm(place)) missing.add(place);
      if (part !== undefined && !hasEverydayForm(part)) missing.add(part);
    }
    for (const b of MICRO_BEDS) if (!hasEverydayForm(b.label)) missing.add(b.label);
    expect([...missing]).toEqual([]);
  });

  it('keep the side and translate place and part separately', () => {
    expect(everydayName('left kidney: glomerular capillaries')).toBe('left kidney: filtering capillaries');
    expect(everydayName('right gluteal & pelvic muscle: arterioles')).toBe('right buttock & hip muscles: arterioles');
    // Microscope and close-up labels capitalise the side.
    expect(everydayName('Right gluteal & pelvic muscle')).toBe('Right buttock & hip muscles');
    expect(everydayName('Left coronary artery')).toBe('Left heart artery (coronary)');
    expect(everydayName('Coeliac trunk')).toBe('Artery to the stomach, liver & spleen');
    expect(everydayName('Left ventricle')).toBe('Left ventricle');
  });
});
