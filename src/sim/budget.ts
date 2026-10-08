/**
 * The body's O2 budget: how much O2 the heart sends out, how much each organ takes, and what
 * fraction of what arrives it extracts. All of it follows from the steady state by the Fick
 * principle: O2 used = blood flow × (O2 content in − O2 content out).
 */
import type { Tissue } from '../physiology/params';
import type { Circulation } from './circulation';
import type { SteadyState } from './oxygen';

export interface OrganBudget {
  tissue: Tissue;
  /** Blood flow through the organ's exchanging capillaries, mL/min. */
  flow: number;
  /** O2 arriving in those capillaries, mL/min. */
  delivered: number;
  /** O2 taken up by the organ, mL/min. */
  used: number;
  /** used / delivered. */
  extraction: number;
  /** Flow-weighted saturation of blood leaving the capillaries. */
  venousSaturation: number;
}

export interface OxygenBudget {
  /** mL blood/min. */
  cardiacOutput: number;
  /** Arterial and mixed venous O2 content, mL O2 per dL blood. */
  arterialContent: number;
  mixedVenousContent: number;
  /** Whole-body O2 delivery (cardiac output × arterial content) and use (Fick), mL/min. */
  delivered: number;
  used: number;
  /** Whole-body extraction: used / delivered (the "utilization coefficient"). */
  extraction: number;
  /** Per organ, in a fixed order. */
  organs: OrganBudget[];
}

export const BUDGET_ORDER: Tissue[] = ['brain', 'heart', 'kidney', 'gut', 'liver', 'muscle', 'skin', 'bronchial', 'other'];

export function oxygenBudget(circ: Circulation, ss: SteadyState): OxygenBudget {
  const cardiacOutput = circ.cardiacOutput * 60;
  const ca = ss.arterial.contentIn;
  const cv = ss.mixedVenous.contentIn;
  const acc = new Map<Tissue, { flow: number; delivered: number; used: number; sat: number }>();
  for (const s of circ.segments) {
    if (s.exchange?.type !== 'tissue' || !s.tissue) continue;
    const o = ss.segments[s.index];
    const f = s.flow * 60;
    const a = acc.get(s.tissue) ?? { flow: 0, delivered: 0, used: 0, sat: 0 };
    a.flow += f;
    a.delivered += f * o.contentIn;
    a.used += f * (o.contentIn - o.contentOut);
    a.sat += f * o.saturationOut;
    acc.set(s.tissue, a);
  }
  const organs = BUDGET_ORDER.filter((t) => acc.has(t)).map((tissue) => {
    const a = acc.get(tissue)!;
    return {
      tissue,
      flow: a.flow,
      delivered: a.delivered,
      used: a.used,
      extraction: a.used / a.delivered,
      venousSaturation: a.sat / a.flow,
    };
  });
  return {
    cardiacOutput,
    arterialContent: ca * 100,
    mixedVenousContent: cv * 100,
    delivered: cardiacOutput * ca,
    used: cardiacOutput * (ca - cv),
    extraction: (ca - cv) / ca,
    organs,
  };
}
