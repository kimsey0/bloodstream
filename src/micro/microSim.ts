/**
 * Local red cells streaming through one microscope network.
 *
 * Cells move single file at one velocity per capillary, so they never
 * overtake one another. Capillary transit times across the network follow
 * the same log-normal distribution as the body-scale model. O2 exchange
 * uses that bed's calibrated exchange model, so the same physics drives both
 * scales. Every 10⁹ O2 molecules a cell releases (or, in the lungs, takes
 * up) produces one "O2 dot" event for the renderer.
 */
import { Vector3 } from 'three';
import { saturation } from '../physiology/dissociation';
import { HB_PER_RBC } from '../physiology/hemoglobin';
import { integratePo2, transitQuadrature, type ExchangeModel } from '../sim/oxygen';
import { Rng } from '../sim/rng';
import { sampleLine, type MicroNetwork } from './network';

/** O2 molecules represented by one dot. */
export const MOLECULES_PER_DOT = 1e9;
/** Mean corpuscular volume, µm³ (fL). */
const RBC_VOLUME = 90;
/** Systemic discharge haematocrit. */
const HCT = 0.45;
/** Mean RBC speeds in the terminal arteriole and collecting venule, µm/s. */
export const ARTERIOLE_SPEED = 2500;
export const VENULE_SPEED = 1200;

export interface MicroParams {
  /** Mean capillary RBC transit, s, and its coefficient of variation. */
  transit: number;
  transitCv: number;
  /** Tube/discharge haematocrit ratio in the capillaries. */
  hctRatio: number;
  exchange: ExchangeModel;
  /** Mean PO2 entering the capillaries, mmHg. */
  po2In: number;
}

export interface MicroCell {
  route: number;
  /** Arc length along the route, µm. */
  s: number;
  po2: number;
  /** Fractional O2 molecules not yet turned into a dot. */
  carry: number;
  /** Fixed offset inside the arteriole/venule so cells don't stack on the axis. */
  offset: Vector3;
  tilt: number;
}

export interface DotEvent {
  position: Vector3;
  /** +1: O2 leaving the cell; −1: O2 entering it. */
  direction: number;
}

export class MicroSim {
  readonly cells: MicroCell[] = [];
  /** Capillary transit and velocity per route. */
  readonly capTransit: number[];
  readonly capSpeed: number[];
  readonly spacing: number;
  private readonly nextSpawn: number[];
  private readonly rng = new Rng(17);
  time = 0;

  constructor(
    readonly net: MicroNetwork,
    readonly params: MicroParams,
  ) {
    // Heterogeneous transit between capillaries, constant along each one.
    const nodes = transitQuadrature(params.transit, params.transitCv, net.routes.length);
    const order = net.routes.map((_, i) => i).sort((a, b) => Math.sin(a * 12.9898) - Math.sin(b * 12.9898));
    this.capTransit = net.routes.map((_, i) => nodes[order[i]]);
    this.capSpeed = net.routes.map((r, i) => (r.capEnd - r.capStart) / this.capTransit[i]);
    // Mean spacing between successive cells from tube haematocrit: one cell volume per HCT·area of lumen.
    const area = Math.PI * net.capRadius * net.capRadius;
    this.spacing = RBC_VOLUME / (HCT * params.hctRatio * area);
    this.nextSpawn = net.routes.map(() => this.rng.next() * 0.2);
    // Pre-fill so the view opens in a steady state.
    const fill = Math.max(...net.routes.map((r, i) => this.routeDuration(r.line.length, r.capStart, r.capEnd, i)));
    for (let t = 0; t < fill; t += 0.02) this.step(0.02);
  }

  speedAt(cell: MicroCell): number {
    const r = this.net.routes[cell.route];
    if (cell.s < r.capStart) return ARTERIOLE_SPEED;
    if (cell.s < r.capEnd) return this.capSpeed[cell.route];
    return VENULE_SPEED;
  }

  private routeDuration(length: number, capStart: number, capEnd: number, i: number): number {
    return capStart / ARTERIOLE_SPEED + this.capTransit[i] + (length - capEnd) / VENULE_SPEED;
  }

  /** Advance by dt seconds of body time. Returns the O2 dot events produced. */
  step(dt: number): DotEvent[] {
    const events: DotEvent[] = [];
    this.time += dt;
    // Spawn at the arteriole entrance so that cells arrive in each capillary at the right spacing.
    // Equal cell flux in every capillary, as in the body model, where each passing cell draws its
    // transit independently. Slow capillaries therefore hold cells closer together.
    const meanSpeed = this.capSpeed.reduce((a, b) => a + b, 0) / this.capSpeed.length;
    const interval = this.spacing / meanSpeed;
    this.net.routes.forEach((r, i) => {
      while (this.nextSpawn[i] <= this.time) {
        const age = this.time - this.nextSpawn[i];
        this.cells.push({
          route: i,
          s: Math.min(age * ARTERIOLE_SPEED, r.capStart),
          po2: this.params.po2In,
          carry: this.rng.next(),
          offset: new Vector3(this.rng.next() - 0.5, this.rng.next() - 0.5, this.rng.next() - 0.5).multiplyScalar(2),
          tilt: this.rng.next(),
        });
        this.nextSpawn[i] += interval * (0.85 + 0.3 * this.rng.next());
      }
    });

    const tmp = new Vector3();
    for (let c = this.cells.length - 1; c >= 0; c--) {
      const cell = this.cells[c];
      const r = this.net.routes[cell.route];
      let remaining = dt;
      while (remaining > 1e-9) {
        if (cell.s < r.capStart) {
          const h = Math.min(remaining, (r.capStart - cell.s) / ARTERIOLE_SPEED);
          cell.s = Math.min(r.capStart, cell.s + h * ARTERIOLE_SPEED);
          remaining -= h;
          if (h <= 0) cell.s = r.capStart;
        } else if (cell.s < r.capEnd) {
          const v = this.capSpeed[cell.route];
          const h = Math.min(remaining, (r.capEnd - cell.s) / v);
          const before = saturation(cell.po2, this.params.exchange.conditions);
          cell.po2 = integratePo2(cell.po2, h, this.params.exchange);
          const delta = (before - saturation(cell.po2, this.params.exchange.conditions)) * 4 * HB_PER_RBC;
          cell.s = Math.min(r.capEnd, cell.s + h * v);
          remaining -= h;
          cell.carry += Math.abs(delta) / MOLECULES_PER_DOT;
          while (cell.carry >= 1) {
            cell.carry -= 1;
            events.push({ position: sampleLine(r.line, cell.s, tmp).clone(), direction: Math.sign(delta) || 1 });
          }
          if (h <= 0) cell.s = r.capEnd;
        } else {
          cell.s += remaining * VENULE_SPEED;
          remaining = 0;
        }
      }
      if (cell.s >= r.line.length) this.cells.splice(c, 1);
    }
    return events;
  }

  /** Mean saturation of cells leaving the capillaries now (for display). */
  outletSaturation(): number {
    let sum = 0;
    let n = 0;
    for (const c of this.cells) {
      if (c.s >= this.net.routes[c.route].capEnd) {
        sum += saturation(c.po2, this.params.exchange.conditions);
        n++;
      }
    }
    return n ? sum / n : NaN;
  }
}
