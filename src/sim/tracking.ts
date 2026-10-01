/**
 * Observers that turn a Simulation's transition events into measurements:
 * round-trip ("lap") times, capillary visits, and a follow-one-cell log.
 */
import { o2Content, saturation } from '../physiology/dissociation';
import { adairDistribution, adairPo2, HemoglobinMolecule } from '../physiology/hemoglobin';
import { Rng } from './rng';
import type { Simulation, TransitionEvent } from './simulation';

export interface Lap {
  cell: number;
  /** Time of the left-ventricle entry that started this lap, s. */
  start: number;
  /** LV → LV round-trip time, s. */
  duration: number;
  /** Ids of the exchanging capillary beds passed on the way. */
  beds: string[];
}

export interface CapillaryVisit {
  cell: number;
  segment: number;
  enter: number;
  transit: number;
  po2In: number;
  po2Out: number;
}

/** Records every completed circuit and every capillary passage of all cells. */
export class CirculationRecorder {
  readonly laps: Lap[] = [];
  readonly visits: CapillaryVisit[] = [];
  private readonly lapStart: Float64Array;
  private readonly lapBeds: string[][];
  private readonly enterTime: Float64Array;
  private readonly enterPo2: Float64Array;
  private readonly detach: () => void;

  constructor(private readonly sim: Simulation) {
    this.lapStart = new Float64Array(sim.count).fill(-1);
    this.lapBeds = Array.from({ length: sim.count }, () => []);
    this.enterTime = new Float64Array(sim.count).fill(-1);
    this.enterPo2 = new Float64Array(sim.count);
    this.detach = sim.addListener((e) => this.onTransition(e));
  }

  dispose(): void {
    this.detach();
  }

  private onTransition(e: TransitionEvent): void {
    const segs = this.sim.circulation.segments;
    const from = segs[e.from];
    if (from.exchange && this.enterTime[e.cell] >= 0) {
      this.visits.push({
        cell: e.cell,
        segment: e.from,
        enter: this.enterTime[e.cell],
        transit: e.time - this.enterTime[e.cell],
        po2In: this.enterPo2[e.cell],
        po2Out: e.po2,
      });
      this.lapBeds[e.cell].push(from.id);
    }
    this.enterTime[e.cell] = segs[e.to].exchange ? e.time : -1;
    this.enterPo2[e.cell] = e.po2;

    if (e.to === this.sim.circulation.root.index) {
      const start = this.lapStart[e.cell];
      if (start >= 0) {
        this.laps.push({ cell: e.cell, start, duration: e.time - start, beds: this.lapBeds[e.cell] });
      }
      this.lapStart[e.cell] = e.time;
      this.lapBeds[e.cell] = [];
    }
  }

  /** O2 removed (or, in lungs, added) per visit: mL O2 per mL blood. */
  static contentChange(v: CapillaryVisit): number {
    return o2Content(v.po2Out) - o2Content(v.po2In);
  }
}

export interface RouteEntry {
  segment: number;
  enter: number;
  exit?: number;
  saturationIn: number;
  saturationOut?: number;
}

export interface TrackedLap {
  duration: number;
  /** Names of the exchanging capillary beds the cell passed (lungs excluded). */
  via: string[];
}

/**
 * Follows one cell: its route log, lap times, and a single representative
 * haemoglobin molecule whose four sites bind and release O2 stochastically.
 */
export class CellTracker {
  readonly route: RouteEntry[] = [];
  readonly laps: TrackedLap[] = [];
  readonly molecule: HemoglobinMolecule;
  private lapStart = -1;
  private lapVia: string[] = [];
  private readonly detach: () => void;

  constructor(
    private readonly sim: Simulation,
    readonly cell: number,
    seed = 7,
    private readonly maxRoute = 500,
  ) {
    const s = sim.saturation(cell);
    this.molecule = new HemoglobinMolecule(new Rng(seed), Math.round(s * 4));
    this.route.push({ segment: sim.segment[cell], enter: sim.time - sim.elapsed[cell], saturationIn: s });
    // Already in the left ventricle: this circuit starts now-ish.
    if (sim.segment[cell] === sim.circulation.root.index) this.lapStart = sim.time - sim.elapsed[cell];
    this.detach = sim.addListener((e) => {
      if (e.cell === cell) this.onTransition(e);
    });
  }

  dispose(): void {
    this.detach();
  }

  private onTransition(e: TransitionEvent): void {
    const last = this.route[this.route.length - 1];
    last.exit = e.time;
    last.saturationOut = saturation(e.po2);
    this.route.push({ segment: e.to, enter: e.time, saturationIn: saturation(e.po2) });
    if (this.route.length > this.maxRoute) this.route.shift();
    const from = this.sim.circulation.segments[e.from];
    if (from.exchange?.type === 'tissue') this.lapVia.push(from.name.replace(/: .*$/, ''));
    if (e.to === this.sim.circulation.root.index) {
      if (this.lapStart >= 0) this.laps.push({ duration: e.time - this.lapStart, via: this.lapVia });
      this.lapStart = e.time;
      this.lapVia = [];
    }
  }

  get lapTimes(): number[] {
    return this.laps.map((l) => l.duration);
  }

  /** Beds passed so far in the current circuit. */
  get currentVia(): string[] {
    return this.lapVia;
  }

  /** Effective PO2 driving the molecule, matched to the cell's saturation. */
  get moleculePo2(): number {
    return adairPo2(this.sim.saturation(this.cell));
  }

  /** Advance the molecule; call after each Simulation.step with the same dt. */
  stepMolecule(dt: number): void {
    this.molecule.step(dt, this.moleculePo2);
  }

  /** Fraction of the cell's ~270 million Hb molecules with 0..4 O2 bound. */
  get hemoglobinDistribution(): number[] {
    return adairDistribution(this.moleculePo2);
  }

  get timeSinceLapStart(): number {
    return this.lapStart >= 0 ? this.sim.time - this.lapStart : NaN;
  }
}
