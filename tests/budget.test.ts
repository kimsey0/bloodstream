import { describe, expect, it } from 'vitest';
import { activityState } from '../src/physiology/activity';
import { REST } from '../src/physiology/params';
import { oxygenBudget } from '../src/sim/budget';
import { Circulation } from '../src/sim/circulation';
import { solveSteadyState } from '../src/sim/oxygen';

const budgetAt = (level: number) => {
  const circ = new Circulation({ activity: activityState(level) });
  return oxygenBudget(circ, solveSteadyState(circ));
};
const rest = budgetAt(0);
const max = budgetAt(1);
const organ = (b: typeof rest, t: string) => b.organs.find((o) => o.tissue === t)!;

describe('O2 budget', () => {
  it('delivers ~1,000 mL O2/min at rest, of which the body uses a quarter (Guyton & Hall)', () => {
    expect(rest.delivered).toBeGreaterThan(950);
    expect(rest.delivered).toBeLessThan(1050);
    expect(rest.used).toBeCloseTo(REST.vo2, -1);
    expect(rest.extraction).toBeGreaterThan(0.22);
    expect(rest.extraction).toBeLessThan(0.3);
  });

  it('adds up: the organs use what the lungs take up', () => {
    for (const b of [rest, max]) {
      const sum = b.organs.reduce((a, o) => a + o.used, 0);
      expect(sum / b.used).toBeGreaterThan(0.99);
      expect(sum / b.used).toBeLessThan(1.01);
    }
  });

  it('extracts most in the heart and least in the kidney and skin at rest', () => {
    expect(organ(rest, 'heart').extraction).toBeGreaterThan(0.55);
    expect(organ(rest, 'kidney').extraction).toBeLessThan(0.15);
    expect(organ(rest, 'skin').extraction).toBeLessThan(0.2);
    const brain = organ(rest, 'brain').extraction;
    expect(brain).toBeGreaterThan(0.25);
    expect(brain).toBeLessThan(0.45);
  });

  it('extracts 75–85 % of delivered O2 at maximal exercise, most of it in working muscle', () => {
    expect(max.extraction).toBeGreaterThan(0.7);
    expect(max.extraction).toBeLessThan(0.85);
    expect(organ(max, 'muscle').extraction).toBeGreaterThan(0.75);
    expect(organ(max, 'muscle').used / max.used).toBeGreaterThan(0.8);
  });
});
