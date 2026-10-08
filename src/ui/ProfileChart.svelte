<script lang="ts">
  /**
   * PO2 of a cell along the capillary, from entry, as in West's classic figure of O2 uptake along
   * the pulmonary capillary. In the lungs it shows whether blood matches the air before it leaves:
   * at rest it does so a third of the way along, so uptake is limited by blood flow
   * (perfusion-limited); with short transits or thin air it may not (diffusion-limited).
   * In tissues it shows blood PO2 falling towards the cells' PO2.
   */
  import { saturationCss } from '../color/saturation';
  import { ui, type MicroInfo } from './state.svelte';

  interface Props {
    info: MicroInfo;
  }
  let { info }: Props = $props();

  const W = 332;
  const H = 132;
  const M = { l: 30, r: 12, t: 12, b: 24 };
  const PW = W - M.l - M.r;
  const PH = H - M.t - M.b;

  let prof = $derived(info.profile);
  let tMax = $derived(prof.t.at(-1) ?? 1);
  let yMax = $derived(Math.max(60, Math.ceil((Math.max(info.targetPo2, ...prof.po2) + 5) / 20) * 20));
  let yTicks = $derived(Array.from({ length: yMax / 20 + 1 }, (_, i) => i * 20).filter((v) => yMax <= 120 || v % 40 === 0));
  let tTicks = $derived.by(() => {
    const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((s) => tMax / s <= 6) ?? 10;
    return Array.from({ length: Math.floor(tMax / step) + 1 }, (_, i) => +(i * step).toFixed(2));
  });

  const x = (t: number) => M.l + (t / tMax) * PW;
  const y = (p: number) => M.t + (1 - p / yMax) * PH;

  /** The profile as short segments, each coloured by the cell's saturation there. */
  let segments = $derived(
    prof.t.slice(1).map((t, i) => ({
      d: `M${x(prof.t[i]).toFixed(1)},${y(prof.po2[i]).toFixed(1)}L${x(t).toFixed(1)},${y(prof.po2[i + 1]).toFixed(1)}`,
      color: saturationCss(prof.saturation[i + 1], ui.colorScale),
    })),
  );

  /** Value of the profile at time t, by linear interpolation. */
  function at(series: number[], t: number): number {
    const u = (t / tMax) * (prof.t.length - 1);
    const i = Math.min(prof.t.length - 2, Math.max(0, Math.floor(u)));
    return series[i] + (series[i + 1] - series[i]) * (u - i);
  }

  const s = (t: number) => `${t < 1 ? t.toFixed(2) : t.toFixed(1)} s`;
  let eq = $derived(prof.equilibration);
  let caption = $derived.by(() => {
    const leave = `the average cell leaves at ${s(prof.transit)}`;
    if (!info.lung) {
      const out = at(prof.po2, prof.transit);
      return `Blood PO₂ falls from ${prof.po2[0].toFixed(0)} to ${out.toFixed(0)} mmHg by the time ${leave}, towards the cells' ${info.targetPo2.toFixed(0)} mmHg. The gap that remains keeps O₂ diffusing out.`;
    }
    if (eq !== null && eq <= prof.fastTransit)
      return `Blood matches the air after ${s(eq)}, and ${leave}. The rest of the capillary is spare: uptake is limited by blood flow, not by diffusion (perfusion-limited).`;
    if (eq !== null && eq <= prof.transit)
      return `Blood matches the air after ${s(eq)}, and ${leave}, but the fastest 10 % of cells leave by ${s(prof.fastTransit)}, before they finish: uptake is becoming diffusion-limited.`;
    return `The average cell leaves at ${s(prof.transit)}, before its blood matches the air: uptake is diffusion-limited, and blood leaves below alveolar PO₂.`;
  });

  /** Hovered time, s, or null. */
  let hover: number | null = $state(null);
  function onPointer(e: PointerEvent): void {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    hover = px < M.l || px > W - M.r ? null : ((px - M.l) / PW) * tMax;
  }
</script>

<figure class="profile">
  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label={`PO₂ along the capillary: from ${prof.po2[0].toFixed(0)} mmHg at entry to ${at(prof.po2, prof.transit).toFixed(0)} mmHg when the average cell leaves at ${s(prof.transit)}. ${caption}`}
    onpointermove={onPointer}
    onpointerdown={onPointer}
    onpointerleave={() => (hover = null)}
  >
    {#each yTicks as p (p)}
      <line class="grid" x1={M.l} x2={W - M.r} y1={y(p)} y2={y(p)} />
      <text class="tick" x={M.l - 5} y={y(p) + 3.5} text-anchor="end">{p}</text>
    {/each}
    {#each tTicks as t (t)}
      <text class="tick" x={x(t)} y={H - M.b + 12} text-anchor="middle">{t}</text>
    {/each}
    <text class="axis" x={W - M.r} y={H - 2} text-anchor="end">time in capillary, s</text>
    <text class="axis" x="1" y={M.t - 3}>PO₂</text>

    <line class="target" x1={M.l} x2={W - M.r} y1={y(info.targetPo2)} y2={y(info.targetPo2)} />
    <text class="target" x={W - M.r - 2} y={y(info.targetPo2) + (info.lung ? 11 : -4)} text-anchor="end"
      >{info.lung ? 'alveolar gas' : 'cells'} {info.targetPo2.toFixed(0)}</text
    >

    {#if prof.fastTransit < prof.transit - 1e-3}
      <line class="leave fast" x1={x(prof.fastTransit)} x2={x(prof.fastTransit)} y1={M.t} y2={M.t + PH} />
      <text class="leave" x={x(prof.fastTransit) - 3} y={M.t + PH - 5} text-anchor="end">fastest 10 %</text>
    {/if}
    <line class="leave" x1={x(prof.transit)} x2={x(prof.transit)} y1={M.t} y2={M.t + PH} />
    <text class="leave" x={x(prof.transit) + 3} y={M.t + PH - 5}>average cell leaves</text>

    {#each segments as seg, i (i)}
      <path d={seg.d} stroke={seg.color} />
    {/each}
    {#if info.lung && eq !== null}
      <circle class="eq" cx={x(eq)} cy={y(at(prof.po2, eq))} r="4" />
    {/if}

    {#if hover !== null}
      <line class="cross" x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + PH} />
      <text class="hover" x={M.l + 4} y={M.t + 10}
        >{s(hover)}: PO₂ {at(prof.po2, hover).toFixed(0)} mmHg · SO₂ {Math.round(at(prof.saturation, hover) * 100)}%</text
      >
    {/if}
  </svg>
  <figcaption>{caption}</figcaption>
</figure>

<style>
  .profile {
    margin: 0;
    display: grid;
    gap: 4px;
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
    stroke-linecap: round;
  }
  line.target {
    stroke: var(--steel);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  text.target,
  text.leave {
    fill: var(--steel);
    font-size: 9px;
    font-family: var(--font-ui);
  }
  line.leave {
    stroke: var(--muted);
    stroke-width: 1;
  }
  line.leave.fast {
    stroke-dasharray: 2 3;
  }
  .eq {
    fill: none;
    stroke: var(--text);
    stroke-width: 1.5;
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
</style>
