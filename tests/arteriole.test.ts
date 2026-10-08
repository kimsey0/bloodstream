import { describe, expect, it } from 'vitest';
import { activityState } from '../src/physiology/activity';
import { ARTERIOLAR } from '../src/physiology/params';
import { Circulation } from '../src/sim/circulation';
import { feedingArteriole, solveSteadyState } from '../src/sim/oxygen';

const solve = (level: number) => {
  const circ = new Circulation({ activity: activityState(level) });
  return { circ, ss: solveSteadyState(circ) };
};
const rest = solve(0);
const max = solve(1);

/** Share of a bed's O2 loss that happens in its arterioles. */
const share = (st: typeof rest, capId: string) => {
  const cap = st.circ.get(capId);
  const art = feedingArteriole(st.circ, cap)!;
  const a = st.ss.segments[art.index];
  return (a.contentIn - a.contentOut) / (a.contentIn - st.ss.segments[cap.index].contentOut);
};

describe('O2 loss from arterioles', () => {
  it('takes two-thirds of resting muscle O2 in the arterioles (Swain & Pittman 1989, hamster muscle)', () => {
    expect(share(rest, 'leg_L.thigh.muscle.cap')).toBeCloseTo(ARTERIOLAR.restShareMuscle, 2);
  });

  it('gives other beds a share set by their transit times, smallest in the kidney', () => {
    for (const id of ['brain_L.cap', 'heart_L.cap', 'intestine.cap']) {
      expect(share(rest, id), id).toBeGreaterThan(0.2);
      expect(share(rest, id), id).toBeLessThan(0.6);
    }
    expect(share(rest, 'kidney_L.cap')).toBeLessThan(0.25);
  });

  it('hands over to the capillaries in working muscle: arteriolar share falls with flow', () => {
    expect(share(max, 'leg_L.thigh.muscle.cap')).toBeLessThan(0.4);
  });

  it('keeps each bed’s total O2 use, so venous blood is unchanged', () => {
    for (const s of rest.circ.segments) {
      if (s.exchange?.type !== 'tissue') continue;
      const art = feedingArteriole(rest.circ, s);
      const cin = art ? rest.ss.segments[art.index].contentIn : rest.ss.segments[s.index].contentIn;
      expect((cin - rest.ss.segments[s.index].contentOut) * s.flow * 60, s.id).toBeCloseTo(s.exchange.vo2, 6);
    }
  });
});
