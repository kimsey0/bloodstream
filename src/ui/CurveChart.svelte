<script lang="ts">
  /**
   * The O2 dissociation curve with the followed cell on it. Two curves: arterial blood, and the
   * blood around the cell, which shifts right with CO2, acid and heat (the Bohr effect). The
   * cell's recent path traces the loop: up the curve in the lungs, down it in tissues.
   *
   * The y axis shows saturation or O2 content. Content separates what saturation hides: anaemic
   * blood is as saturated as normal blood but carries less. When a "what if" scenario changes the
   * blood, a faint curve shows normal blood for comparison.
   */
  import { saturationCss } from '../color/saturation';
  import {
    BLOOD,
    currentHaemoglobin,
    NORMAL_HAEMOGLOBIN,
    normalSaturation,
    O2_CAPACITY,
    p50,
    saturation,
    type BloodConditions,
  } from '../physiology/dissociation';
  import { po2OnCurve } from '../sim/oxygen';
  import type { FollowInfo } from '../sim/protocol';
  import { history, ui } from './state.svelte';

  interface Props {
    info: FollowInfo;
  }
  let { info }: Props = $props();

  const W = 332;
  const H = 172;
  const M = { l: 30, r: 12, t: 16, b: 24 };
  const PW = W - M.l - M.r;
  const PH = H - M.t - M.b;
  const P_MAX = 120;
  /** Body time of path shown, s. */
  const TRAIL = 60;

  /** Y axis: saturation (0–1) or O2 content (mL/dL). */
  let mode = $state<'saturation' | 'content'>('saturation');
  const NORMAL_CAPACITY = (NORMAL_HAEMOGLOBIN.hb / 100) * BLOOD.hufner;

  /** The blood itself (Hb, CO, P50) lives outside Svelte's reactivity; the applied scenario tracks it. */
  let blood = $derived((void ui.scenario, currentHaemoglobin()));
  let capacity = $derived((void blood, O2_CAPACITY));
  let yMax = $derived(mode === 'saturation' ? 1 : Math.max(21, Math.ceil(capacity * 100 + 1)));
  let yTicks = $derived(mode === 'saturation' ? [0, 0.25, 0.5, 0.75, 1] : [0, 5, 10, 15, 20, 25].filter((v) => v <= yMax));

  const x = (p: number) => M.l + (Math.min(p, P_MAX) / P_MAX) * PW;
  const y = (v: number) => M.t + (1 - v / yMax) * PH;
  /** The plotted value for blood at PO2 p with saturation s. */
  const value = (p: number, s: number) => (mode === 'saturation' ? s : (s * capacity + BLOOD.solubility * p) * 100);
  const curveOf = (f: (p: number) => number) => {
    let d = '';
    for (let p = 0; p <= P_MAX; p += 1) d += `${p ? 'L' : 'M'}${x(p).toFixed(1)},${y(f(p)).toFixed(1)}`;
    return d;
  };
  const curve = (c: BloodConditions) => curveOf((p) => value(p, saturation(p, c)));
  const pct = (s: number) => `${Math.round(s * 100)}%`;
  const fmtValue = (v: number) => (mode === 'saturation' ? pct(v) : `${v.toFixed(1)} mL/dL`);

  let arterial = $derived(ui.arterialConditions);
  let here = $derived(info.conditions);
  let p50Art = $derived(p50(arterial));
  let p50Here = $derived(p50(here));
  let shifted = $derived(Math.abs(p50Here - p50Art) > 0.2);
  let arterialPath = $derived((void yMax, void blood, curve(arterial)));
  let herePath = $derived((void yMax, void blood, shifted ? curve(here) : ''));
  /** Normal blood under the same conditions, when the scenario changes the curve that is plotted. */
  let curveChanged = $derived(
    mode === 'content'
      ? Math.abs(capacity - NORMAL_CAPACITY) > 1e-6 || blood.coFraction > 0 || Math.abs(blood.p50 - NORMAL_HAEMOGLOBIN.p50) > 1e-9
      : blood.coFraction > 0 || Math.abs(blood.p50 - NORMAL_HAEMOGLOBIN.p50) > 1e-9,
  );
  let normalPath = $derived(
    curveChanged
      ? curveOf((p) => {
          const s = normalSaturation(p, arterial);
          return mode === 'saturation' ? s : (s * NORMAL_CAPACITY + BLOOD.solubility * p) * 100;
        })
      : '',
  );
  let arterialPoint = $derived((void blood, value(ui.arterialPo2, ui.arterialSaturation)));
  let venousPoint = $derived((void blood, value(ui.mixedVenousPo2, ui.mixedVenousSaturation)));

  /** Saturation colour bins and age bins for the trail: a few paths instead of thousands of segments. */
  const SAT_BINS = 12;
  const AGE_BINS = 3;

  /**
   * Recent (PO2, SO2) path, coloured by saturation and fainter with age. Samples come once per
   * frame, which can span all of lung loading, so long gaps are filled by interpolating O2 content
   * and the curve's shift: the path then follows the curve during exchange, and runs level (same
   * content, shifted curve) where blood chemistry changes between vessels.
   */
  let trail = $derived.by(() => {
    void info;
    void yMax;
    const { t, s, p, c, f } = history;
    const v = (i: number) => (mode === 'saturation' ? s[i] : c[i] * 100);
    const t1 = t.at(-1) ?? 0;
    let i0 = t.length;
    while (i0 > 0 && t[i0 - 1] >= t1 - TRAIL) i0--;
    const d: string[] = Array.from({ length: SAT_BINS * AGE_BINS }, () => '');
    let px = x(p[i0] ?? 0);
    let py = y(i0 < t.length ? v(i0) : 0);
    for (let i = i0 + 1; i < t.length; i++) {
      const gap = Math.abs(x(p[i]) - px) + Math.abs(y(v(i)) - py);
      if (gap < 0.5) continue;
      const age = Math.min(AGE_BINS - 1, Math.floor(((t1 - t[i]) / TRAIL) * AGE_BINS));
      const n = Math.min(40, Math.ceil(gap / 3));
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        let nx = x(p[i]);
        let ny = y(v(i));
        let su = s[i];
        if (k < n) {
          const cu = c[i - 1] + (c[i] - c[i - 1]) * u;
          const fu = f[i - 1] * Math.pow(f[i] / f[i - 1], u);
          const pu = po2OnCurve(cu, fu);
          su = Math.max(0, (cu - BLOOD.solubility * pu) / O2_CAPACITY);
          nx = x(pu);
          ny = y(mode === 'saturation' ? su : cu * 100);
        }
        const sat = Math.min(SAT_BINS - 1, Math.floor(su * SAT_BINS));
        d[age * SAT_BINS + Math.max(0, sat)] += `M${px.toFixed(1)},${py.toFixed(1)}L${nx.toFixed(1)},${ny.toFixed(1)}`;
        px = nx;
        py = ny;
      }
    }
    return d
      .map((path, k) => ({
        path,
        color: saturationCss(((k % SAT_BINS) + 0.5) / SAT_BINS, ui.colorScale),
        opacity: 0.9 - (0.6 * Math.floor(k / SAT_BINS)) / (AGE_BINS - 1),
      }))
      .filter((b) => b.path);
  });

  let bound = $derived(Math.max(0, (info.content - BLOOD.solubility * info.po2) * 100));
  let dissolved = $derived(BLOOD.solubility * info.po2 * 100);

  /** Hovered PO2, mmHg, or null. */
  let hover: number | null = $state(null);
  function onPointer(e: PointerEvent): void {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    hover = px < M.l || px > W - M.r ? null : Math.round(((px - M.l) / PW) * P_MAX);
  }
</script>

<figure class="curve">
  <div class="top">
    <div class="key" aria-hidden="true">
      <span><i class="art"></i>Arterial blood · P50 {p50Art.toFixed(1)}</span>
      <span><i class="here"></i>Around this cell · {shifted ? `P50 ${p50Here.toFixed(1)}` : 'same curve'}</span>
      {#if curveChanged}<span><i class="normal"></i>Normal blood</span>{/if}
    </div>
    <div class="modes" role="radiogroup" aria-label="Plot">
      <button role="radio" aria-checked={mode === 'saturation'} class:active={mode === 'saturation'} onclick={() => (mode = 'saturation')}>SO₂</button>
      <button role="radio" aria-checked={mode === 'content'} class:active={mode === 'content'} onclick={() => (mode = 'content')}>O₂ content</button>
    </div>
  </div>
  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label={`O₂ dissociation curve. The cell is at PO₂ ${info.po2.toFixed(0)} mmHg and ${pct(info.saturation)} saturation; P50 around it is ${p50Here.toFixed(1)} mmHg, ${p50Art.toFixed(1)} in arterial blood.`}
    onpointermove={onPointer}
    onpointerdown={onPointer}
    onpointerleave={() => (hover = null)}
  >
    {#each yTicks as s (s)}
      <line class="grid" x1={M.l} x2={W - M.r} y1={y(s)} y2={y(s)} />
      <text class="tick" x={M.l - 5} y={y(s) + 3.5} text-anchor="end">{mode === 'saturation' ? s * 100 : s}</text>
    {/each}
    {#each [0, 20, 40, 60, 80, 100, 120] as p (p)}
      <text class="tick" x={x(p)} y={H - M.b + 12} text-anchor="middle">{p}</text>
    {/each}
    <text class="axis" x={W - M.r} y={H - 2} text-anchor="end">PO₂, mmHg</text>
    <text class="axis" x="1" y={M.t - 7}>{mode === 'saturation' ? 'SO₂ %' : 'O₂ mL/dL'}</text>

    {#if info.exchangeTarget}
      {@const tx = x(info.exchangeTarget.po2)}
      <line class="target" x1={tx} x2={tx} y1={M.t} y2={M.t + PH} />
      <text class="target" x={info.exchangeTarget.po2 > 80 ? tx - 4 : tx + 4} y={M.t + PH - 6} text-anchor={info.exchangeTarget.po2 > 80 ? 'end' : 'start'}
        >{info.exchangeTarget.kind === 'alveolar' ? 'alveolar gas' : 'tissue'} {info.exchangeTarget.po2.toFixed(0)}{info.exchangeTarget.vq !== undefined
          ? ` · V/Q ${info.exchangeTarget.vq.toFixed(1)}`
          : ''}</text
      >
    {/if}
    {#if curveChanged}<path class="normal" d={normalPath} />{/if}
    <path class="art" d={arterialPath} />
    {#if shifted}<path class="here" d={herePath} />{/if}
    <circle class="p50 art" cx={x(p50Art)} cy={y(value(p50Art, saturation(p50Art, arterial)))} r="2.5" />
    {#if shifted}<circle class="p50 here" cx={x(p50Here)} cy={y(value(p50Here, saturation(p50Here, here)))} r="2.5" />{/if}

    {#if ui.ready}
      <g class="ref">
        <circle cx={x(ui.arterialPo2)} cy={y(arterialPoint)} r="4" />
        <text x={x(ui.arterialPo2) - 7} y={y(arterialPoint) + 14} text-anchor="end">arterial</text>
        <circle cx={x(ui.mixedVenousPo2)} cy={y(venousPoint)} r="4" />
        <text x={x(ui.mixedVenousPo2) + 7} y={y(venousPoint) + 4}>mixed venous</text>
      </g>
    {/if}

    {#each trail as bin, i (i)}
      <path class="trail" d={bin.path} stroke={bin.color} opacity={bin.opacity} />
    {/each}
    <circle class="cell" cx={x(info.po2)} cy={y(mode === 'saturation' ? info.saturation : info.content * 100)} r="5.5" fill={saturationCss(info.saturation, ui.colorScale)} />

    {#if hover !== null}
      <line class="cross" x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + PH} />
      <text class="hover" x={W - M.r - 4} y={M.t + PH - 6} text-anchor="end"
        >PO₂ {hover}: {fmtValue(value(hover, saturation(hover, arterial)))} arterial{shifted ? ` · ${fmtValue(value(hover, saturation(hover, here)))} here` : ''}</text
      >
    {/if}
  </svg>
  <figcaption>
    <b>{(bound + dissolved).toFixed(1)}</b> mL O₂ per dL blood: {bound.toFixed(1)} on haemoglobin + {dissolved.toFixed(2)} dissolved
    <span class="cap">(full: {(capacity * 100).toFixed(1)})</span>
  </figcaption>
</figure>

<style>
  .curve {
    margin: 0;
    display: grid;
    gap: 4px;
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    font-size: 11px;
    color: var(--muted);
  }
  .key i {
    display: inline-block;
    width: 14px;
    height: 0;
    margin-right: 5px;
    vertical-align: middle;
    border-top: 2px solid var(--muted);
  }
  .key i.here {
    border-top-color: var(--text);
  }
  .key i.normal {
    border-top: 2px dashed var(--muted);
    opacity: 0.6;
  }
  .top {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    justify-content: space-between;
  }
  .modes {
    flex: none;
    display: flex;
    border: 1px solid var(--line);
    border-radius: 7px;
    overflow: hidden;
  }
  .modes button {
    font: 500 10px var(--font-ui);
    color: var(--muted);
    background: transparent;
    border: 0;
    padding: 3px 7px;
    cursor: pointer;
  }
  .modes button + button {
    border-left: 1px solid var(--line);
  }
  .modes button.active {
    background: var(--steel);
    color: #0b1220;
  }
  path.normal {
    stroke: var(--muted);
    stroke-dasharray: 4 3;
    opacity: 0.6;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    touch-action: pan-y;
    font-family: var(--font-data);
  }
  .grid {
    stroke: rgba(141, 153, 171, 0.18);
    stroke-width: 1;
  }
  .tick,
  .axis {
    fill: var(--muted);
    font-size: 9px;
  }
  .axis {
    font-family: var(--font-ui);
  }
  path {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  path.art {
    stroke: var(--muted);
  }
  path.here {
    stroke: var(--text);
  }
  .p50 {
    stroke: #0b1018;
    stroke-width: 1.5;
  }
  .p50.art {
    fill: var(--muted);
  }
  .p50.here {
    fill: var(--text);
  }
  .ref circle {
    fill: none;
    stroke: var(--steel);
    stroke-width: 1.5;
  }
  .ref text {
    fill: var(--steel);
    font-size: 9px;
    font-family: var(--font-ui);
  }
  path.trail {
    stroke-width: 2;
    stroke-linecap: round;
  }
  .cell {
    stroke: #0b1018;
    stroke-width: 2;
  }
  line.target {
    stroke: var(--steel);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  text.target {
    fill: var(--steel);
    font-size: 9px;
    font-family: var(--font-ui);
  }
  .cross {
    stroke: var(--steel);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .hover {
    fill: var(--text);
    font-size: 10px;
  }
  figcaption {
    font-size: 12px;
    color: var(--muted);
  }
  figcaption b {
    font-family: var(--font-data);
    color: var(--text);
  }
  .cap {
    white-space: nowrap;
  }
</style>
