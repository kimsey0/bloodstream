<script lang="ts">
  import { HEMOGLOBIN_STEP_COLORS, saturationCss } from '../color/saturation';
  import type { FollowInfo } from '../sim/protocol';
  import { history, ui } from './state.svelte';

  interface Props {
    info: FollowInfo;
    onStop: () => void;
  }
  let { info, onStop }: Props = $props();

  let journeyOpen = $state(false);
  /** Phones start compact: saturation, location, circuit timer and the molecule only. */
  let details = $state(globalThis.innerWidth > 520);
  let canvas: HTMLCanvasElement | undefined = $state();

  const KIND_LABEL: Record<string, string> = {
    chamber: 'heart chamber',
    artery: 'artery',
    arteriole: 'arterioles',
    capillary: 'capillaries',
    venule: 'venules & small veins',
    vein: 'vein',
  };
  const SITES = ['α1', 'β1', 'α2', 'β2'];
  // 2×2 tetramer layout: α1 β1 on top, β2 α2 below (subunits pair diagonally).
  const SITE_POS = [
    [22, 22],
    [62, 22],
    [62, 62],
    [22, 62],
  ];

  const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
  const fmtSpeed = (mmPerS: number) =>
    mmPerS >= 10 ? `${(mmPerS / 10).toFixed(1)} cm/s` : mmPerS >= 1 ? `${mmPerS.toFixed(1)} mm/s` : `${(mmPerS * 1000).toFixed(0)} µm/s`;
  const fmtTime = (t: number) => (t < 10 ? `${t.toFixed(2)} s` : t < 60 ? `${t.toFixed(1)} s` : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
  const shortVia = (via: string[]) => (via.length ? via.join(' + ') : '—');

  let name = $derived(ui.segmentNames[info.segment] ?? '');
  let kind = $derived(KIND_LABEL[ui.segmentKinds[info.segment]] ?? '');
  let recent = $derived([...info.route].reverse().slice(0, 12));
  let span = $derived(Math.min(120, Math.max(2, 20 * ui.speed)));

  /** SO₂ (coloured) and speed (log scale, grey) over the last `window` seconds of body time. */
  function draw(): void {
    if (!canvas) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const t1 = ui.time;
    const t0 = t1 - span;
    const x = (t: number) => ((t - t0) / span) * w;
    const yS = (s: number) => 3 + (1 - s) * (h - 6);
    // Speed: log scale from 0.1 mm/s to 1000 mm/s.
    const yV = (v: number) => 3 + (1 - (Math.log10(Math.max(0.1, v)) + 1) / 4) * (h - 6);
    ctx.strokeStyle = 'rgba(141, 153, 171, 0.25)';
    ctx.lineWidth = 1;
    for (const s of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, yS(s));
      ctx.lineTo(w, yS(s));
      ctx.stroke();
    }
    const { t, s, v } = history;
    let i0 = 0;
    while (i0 < t.length && t[i0] < t0) i0++;
    ctx.strokeStyle = 'rgba(169, 191, 220, 0.55)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    for (let i = i0; i < t.length; i++) (i === i0 ? ctx.moveTo : ctx.lineTo).call(ctx, x(t[i]), yV(v[i]));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    for (let i = Math.max(i0, 1); i < t.length; i++) {
      ctx.strokeStyle = saturationCss(s[i]);
      ctx.beginPath();
      ctx.moveTo(x(t[i - 1]), yS(s[i - 1]));
      ctx.lineTo(x(t[i]), yS(s[i]));
      ctx.stroke();
    }
  }

  $effect(() => {
    void info;
    void details;
    draw();
  });
</script>

<section class="panel" aria-label="Followed red blood cell">
  <div class="top">
    <span class="dot" style:background={saturationCss(info.saturation)}></span>
    <div class="sat">
      <b>{pct(info.saturation)}</b>
      <span>SO₂ · {info.po2.toFixed(0)} mmHg</span>
    </div>
    <button class="stop" onclick={onStop} aria-label="Stop following">Stop</button>
  </div>

  <div class="where">
    <div class="name">{name}</div>
    <div class="meta">
      <span class="kind">{kind}</span>
      <span>{fmtSpeed(info.speed)}</span>
      <span>{fmtTime(info.segmentElapsed)} of {fmtTime(info.segmentDuration)}</span>
    </div>
    <div class="progress"><i style:width={pct(info.progress, 0)}></i></div>
  </div>

  <div class="grid">
    <div class="circuit">
      <span class="label">This circuit</span>
      <b>{Number.isNaN(info.circuitElapsed) ? 'not yet timed' : fmtTime(info.circuitElapsed)}</b>
      <span class="via">via {shortVia(info.circuitVia)}</span>
      {#if info.laps.length}
        <span class="label second">Previous circuits</span>
        <ul class="laps">
          {#each [...info.laps].reverse().slice(0, 4) as lap, i (i)}
            <li><b>{fmtTime(lap.duration)}</b> {shortVia(lap.via)}</li>
          {/each}
        </ul>
      {/if}
    </div>

    <figure class="hb">
      <svg viewBox="0 0 84 84" role="img" aria-label={`Haemoglobin with ${info.bound} of 4 sites holding oxygen`}>
        {#each SITE_POS as [cx, cy], k (k)}
          <circle {cx} {cy} r="17" fill={HEMOGLOBIN_STEP_COLORS[info.bound]} stroke="rgba(231,236,243,0.35)" stroke-width="1" />
          <rect x={cx - 6} y={cy - 6} width="12" height="12" rx="2" fill="#0b1018" opacity="0.55" />
          {#if info.sites[k]}
            <circle cx={cx - 3} cy={cy} r="3.2" fill="#f4f7fb" />
            <circle cx={cx + 3} cy={cy} r="3.2" fill="#f4f7fb" />
          {/if}
          <text x={cx} y={cy + (cy < 42 ? -9 : 15)} text-anchor="middle">{SITES[k]}</text>
        {/each}
      </svg>
      <figcaption><b>{info.bound}/4</b> O₂ on one of ~270 million Hb</figcaption>
    </figure>
  </div>

  {#if details}
  <div class="dist" title="Share of this cell's haemoglobin molecules with 0–4 O₂ bound">
    {#each info.hbDistribution as f, n (n)}
      <i style:flex-grow={Math.max(f, 0.0001)} style:background={HEMOGLOBIN_STEP_COLORS[n]}>{f > 0.09 ? `${n}: ${pct(f, 0)}` : ''}</i>
    {/each}
  </div>
  <div class="spark">
    <canvas bind:this={canvas} aria-label="Saturation and speed over the last {span.toFixed(0)} s"></canvas>
    <span class="legend">last {span < 10 ? span.toFixed(1) : span.toFixed(0)} s · <em>SO₂</em> · <em class="v">speed (log)</em></span>
  </div>

  {/if}

  <div class="toggles">
    <button aria-expanded={details} onclick={() => (details = !details)}>{details ? 'Fewer details' : 'More details'}</button>
    <button aria-expanded={journeyOpen} onclick={() => (journeyOpen = !journeyOpen)}>
      {journeyOpen ? 'Hide' : 'Show'} journey log
    </button>
  </div>
  {#if journeyOpen}
    <ol class="journey">
      {#each recent as r (r.enter)}
        <li>
          <span class="sw" style:background={saturationCss(r.saturationOut ?? info.saturation)}></span>
          <span class="n">{ui.segmentNames[r.segment]}</span>
          <span class="d">{r.exit !== undefined ? fmtTime(r.exit - r.enter) : '…'}</span>
          <span class="s">{pct(r.saturationIn, 0)}{r.saturationOut !== undefined && Math.abs(r.saturationOut - r.saturationIn) > 0.005 ? ` → ${pct(r.saturationOut, 0)}` : ''}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .panel {
    pointer-events: auto;
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 16px;
    width: min(360px, calc(100% - 32px));
    max-height: calc(100% - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 150px);
    overflow-y: auto;
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(231, 236, 243, 0.6);
    flex: none;
  }
  .sat {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .sat b {
    font: 500 26px/1 var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .sat span,
  .meta,
  .label,
  .via,
  figcaption,
  .legend {
    color: var(--muted);
    font-size: 12px;
  }
  button {
    font: inherit;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
    padding: 4px 10px;
  }
  button:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .name {
    font-weight: 600;
    font-stretch: 90%;
    text-wrap: balance;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .kind {
    font-family: var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10.5px;
    color: var(--steel);
  }
  .progress {
    height: 3px;
    background: var(--line);
    border-radius: 2px;
    margin-top: 6px;
    overflow: hidden;
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--steel);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: start;
  }
  .circuit {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10.5px;
  }
  .label.second {
    margin-top: 6px;
  }
  .circuit > b {
    font: 500 20px/1.2 var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .laps {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .laps b {
    font: 500 12px var(--font-data);
    color: var(--text);
    margin-right: 4px;
  }
  .hb {
    margin: 0;
    width: 104px;
    text-align: center;
  }
  .hb svg {
    width: 104px;
    height: 104px;
    display: block;
  }
  .hb text {
    font: 8px var(--font-data);
    fill: var(--muted);
  }
  figcaption {
    font-size: 11px;
    line-height: 1.3;
  }
  figcaption b {
    color: var(--text);
    font-family: var(--font-data);
  }
  .dist {
    display: flex;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
  }
  .dist i {
    flex-basis: 0;
    font: normal 10px/16px var(--font-data);
    color: #fff;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .spark canvas {
    width: 100%;
    height: 56px;
    display: block;
  }
  .legend em {
    font-style: normal;
    color: var(--text);
  }
  .legend em.v {
    color: var(--steel);
  }
  .toggles {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .toggles button {
    font-size: 12px;
  }
  .journey {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    font-size: 12px;
  }
  .journey li {
    display: grid;
    grid-template-columns: 10px 1fr auto auto;
    gap: 8px;
    align-items: center;
  }
  .journey .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .journey .n {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .journey .d,
  .journey .s {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  @media (max-width: 520px) {
    .panel {
      padding: 10px 12px;
      gap: 8px;
    }
    .spark canvas {
      height: 44px;
    }
    .hb,
    .hb svg {
      width: 78px;
    }
    .hb svg {
      height: 78px;
    }
    .sat b {
      font-size: 22px;
    }
    .circuit > b {
      font-size: 17px;
    }
  }
</style>
