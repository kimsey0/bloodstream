<script lang="ts">
  import { hemoglobinStepColors, saturationCss } from '../color/saturation';
  import { p50 } from '../physiology/dissociation';
  import type { FollowInfo } from '../sim/protocol';
  import CurveChart from './CurveChart.svelte';
  import { capitalise, showName } from './names';
  import { history, ui } from './state.svelte';

  interface Props {
    info: FollowInfo;
    onStop: () => void;
    /** Open the microscope on the bed the cell is in; absent when not applicable. */
    onZoom?: () => void;
  }
  let { info, onStop, onZoom }: Props = $props();

  let journeyOpen = $state(false);
  /** Start compact: saturation, location and circuit time; the rest is under Details. */
  let details = $state(false);
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
  const shortVia = (via: string[]) => (via.length ? via.map(showName).join(' + ') : '—');

  let anatomical = $derived(capitalise(ui.segmentNames[info.segment] ?? ''));
  let name = $derived(capitalise(showName(ui.segmentNames[info.segment] ?? '')));
  let kind = $derived(KIND_LABEL[ui.segmentKinds[info.segment]] ?? '');
  let recent = $derived([...info.route].reverse().slice(0, 12));
  let span = $derived(Math.min(120, Math.max(2, 20 * ui.speed)));
  let stepColors = $derived(hemoglobinStepColors(ui.colorScale));
  let siteWords = $derived(ui.colorScale === 'natural' ? 'bright red with O₂ and dark red without' : 'red with O₂ and blue without');

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
    // Gutters for the SO₂ axis (left) and the speed axis (right).
    const left = 30;
    const right = 50;
    const x = (t: number) => left + ((t - t0) / span) * (w - left - right);
    const yS = (s: number) => 5 + (1 - s) * (h - 10);
    // Speed: log scale from 0.1 mm/s to 1000 mm/s.
    const yV = (v: number) => 5 + (1 - (Math.log10(Math.max(0.1, v)) + 1) / 4) * (h - 10);
    ctx.strokeStyle = 'rgba(141, 153, 171, 0.25)';
    ctx.lineWidth = 1;
    for (const s of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(left, yS(s));
      ctx.lineTo(w - right, yS(s));
      ctx.stroke();
    }
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(141, 153, 171, 0.9)';
    for (const s of [0, 0.5, 1]) ctx.fillText(`${s * 100}%`, left - 4, yS(s));
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(169, 191, 220, 0.8)';
    for (const [v, label] of [[1000, '1 m/s'], [10, '1 cm/s'], [0.1, '0.1 mm/s']] as const) ctx.fillText(label, w - right + 4, yV(v));
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
      ctx.strokeStyle = saturationCss(s[i], ui.colorScale);
      ctx.beginPath();
      ctx.moveTo(x(t[i - 1]), yS(s[i - 1]));
      ctx.lineTo(x(t[i]), yS(s[i]));
      ctx.stroke();
    }
  }

  $effect(() => {
    void info;
    void details;
    void ui.colorScale;
    draw();
  });
</script>

{#if ui.followCollapsed}
  <button class="pill left" data-follow aria-label="Show the followed cell's panel" onclick={() => (ui.followCollapsed = false)}>
    <span class="dot small" style:background={saturationCss(info.saturation, ui.colorScale)}></span>
    <b class="num">{pct(info.saturation)}</b>
    <span class="pill-name">{name}</span>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5 4.5-4.5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg>
  </button>
{:else}
<section class="panel" data-follow aria-label="Followed red blood cell">
  <div class="top">
    <span class="dot" style:background={saturationCss(info.saturation, ui.colorScale)}></span>
    <div class="sat" title="O₂ saturation (SO₂): how full of oxygen this cell's haemoglobin is">
      <b>{pct(info.saturation)}</b>
      <span>O₂ saturation</span>
    </div>
    {#if onZoom}
      <button class="icon zoom" onclick={onZoom} aria-label="Zoom into this capillary bed" title="Zoom into this capillary bed"
        ><svg viewBox="0 0 16 16" aria-hidden="true"
          ><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.6" fill="none" /><path
            d="M10 10l4.5 4.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          /><path d="M4.5 6.5h4M6.5 4.5v4" stroke="currentColor" stroke-width="1.3" /></svg
        ></button
      >
    {/if}
    <button class="details" class:on={details} aria-expanded={details} onclick={() => (details = !details)} title="O₂ curve, blood chemistry, one haemoglobin molecule and the journey log">Details</button>
    <button class="stop" onclick={onStop} aria-label="Stop following">Stop</button>
    <button class="collapse" onclick={() => (ui.followCollapsed = true)} aria-label="Collapse panel" title="Collapse"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg></button>
  </div>

  <div class="where">
    <div class="name">{name}</div>
    {#if name !== anatomical}<div class="anatomical">{anatomical}</div>{/if}
    <div class="meta">
      <span class="kind">{kind}</span>
      <span>{fmtSpeed(info.speed)}</span>
      <span title="Partial pressure of O₂ in the cell's blood: the pressure that drives O₂ across capillary walls">PO₂ {info.po2.toFixed(0)} mmHg</span>
      <span title="Time this cell has spent in this vessel, of the time it will take to pass through. Cells vary: some cross much faster or slower than the average.">{fmtTime(info.segmentElapsed)} of {fmtTime(info.segmentDuration)} here</span>
    </div>
    <div class="progress"><i style:width={pct(info.progress, 0)}></i></div>
  </div>

  {#if !Number.isNaN(info.circuitElapsed)}
    <p class="circuit"><span class="label">This circuit</span> <b>{fmtTime(info.circuitElapsed)}</b>{#if info.circuitVia.length}{' '}<span class="via">via {shortVia(info.circuitVia)}</span>{/if}</p>
  {/if}

  {#if details}
    <div
      class="meta chem"
      title="The blood around the cell. CO₂, acid and heat shift the O₂ curve right (the Bohr effect): P50, the PO₂ at which haemoglobin is half saturated, rises and O₂ is released more easily."
    >
      <span>pH {info.conditions.pH.toFixed(2)}</span>
      <span>PCO₂ {info.conditions.pco2.toFixed(0)} mmHg</span>
      <span>{info.conditions.temperature.toFixed(1)} °C</span>
      <span class="p50">P50 {p50(info.conditions).toFixed(1)} mmHg</span>
    </div>
  {/if}

  {#if details}
    <CurveChart {info} />
  {/if}

  {#if details}
  <div class="hb-row">
    <figure class="hb">
      <svg viewBox="-5 -5 94 94" role="img" aria-label={`Haemoglobin with ${info.bound} of 4 sites holding oxygen`}>
        <!-- The whole molecule, coloured by its overall saturation (bound/4). -->
        <circle cx="42" cy="42" r="46" fill={stepColors[info.bound]} stroke="rgba(231,236,243,0.25)" stroke-width="1" />
        {#each SITE_POS as [cx, cy], k (k)}
          <!-- Each site on its own: oxygenated or not. -->
          <circle {cx} {cy} r="17" fill={stepColors[info.sites[k] ? 4 : 0]} stroke="#0b1018" stroke-width="1.5" />
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
    <p class="hb-note">
      One molecule's four binding sites, each {siteWords}; the disc behind shows the whole molecule's
      saturation. They bind and release O₂ in milliseconds, so at normal speed they flicker; slow to
      0.01× to watch individual sites.
    </p>
  </div>
  <div class="dist" title="Share of this cell's haemoglobin molecules with 0–4 O₂ bound">
    {#each info.hbDistribution as f, n (n)}
      <i style:flex-grow={Math.max(f, 0.0001)} style:background={stepColors[n]}>{f > 0.09 ? `${n}: ${pct(f, 0)}` : ''}</i>
    {/each}
  </div>
  <div class="spark">
    <canvas bind:this={canvas} aria-label="Saturation and speed over the last {span.toFixed(0)} s"></canvas>
    <span class="legend">last {span < 10 ? span.toFixed(1) : span.toFixed(0)} s · <em>SO₂</em> · <em class="v">speed (log)</em></span>
  </div>

  {#if info.laps.length}
    <div class="laps-block">
      <span class="label">Previous circuits</span>
      <ul class="laps">
        {#each [...info.laps].reverse().slice(0, 4) as lap, i (i)}
          <li><b>{fmtTime(lap.duration)}</b> {shortVia(lap.via)}</li>
        {/each}
      </ul>
    </div>
  {/if}
  <div class="toggles">
    <button aria-expanded={journeyOpen} onclick={() => (journeyOpen = !journeyOpen)}>
      {journeyOpen ? 'Hide' : 'Show'} journey log
    </button>
  </div>
  {/if}

  {#if details && journeyOpen}
    <ol class="journey">
      {#each recent as r (r.enter)}
        <li>
          <span class="sw" style:background={saturationCss(r.saturationOut ?? info.saturation, ui.colorScale)}></span>
          <span class="n">{capitalise(showName(ui.segmentNames[r.segment]))}</span>
          <span class="d">{r.exit !== undefined ? fmtTime(r.exit - r.enter) : '…'}</span>
          <span class="s">{pct(r.saturationIn, 0)}{r.saturationOut !== undefined && Math.abs(r.saturationOut - r.saturationIn) > 0.005 ? ` → ${pct(r.saturationOut, 0)}` : ''}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>
{/if}

<style>
  .pill {
    pointer-events: auto;
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 6px 8px;
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    cursor: pointer;
    max-width: calc(100% - 32px);
  }
  .pill svg,
  .collapse svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .pill:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .collapse {
    display: grid;
    place-items: center;
    width: 30px;
    height: 28px;
    padding: 0;
  }
  .pill.left {
    left: 16px;
  }
  .dot.small {
    width: 12px;
    height: 12px;
    box-shadow: 0 0 0 1.5px rgba(231, 236, 243, 0.6);
  }
  .num {
    font: 500 13px var(--font-data);
  }
  .pill-name {
    color: var(--muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .panel {
    pointer-events: auto;
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 16px;
    width: min(360px, calc(100% - 32px));
    /* Stop above the dock, and above a close-up where they share the screen (--inset-space). */
    max-height: calc(100% - env(safe-area-inset-top, 0px) - 22px - var(--dock-space, 150px) - var(--inset-space, 0px));
    overflow-y: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    gap: 6px;
  }
  .top .stop {
    padding: 4px 8px;
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
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .sat span {
    line-height: 1.1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .anatomical {
    margin-top: -2px;
    color: var(--muted);
    font-size: 11.5px;
    font-style: italic;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .chem {
    margin-top: 6px;
    cursor: help;
  }
  .chem .p50 {
    color: var(--text);
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
  .hb-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .hb-note {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .circuit {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    min-width: 0;
  }
  .laps-block {
    display: grid;
    gap: 2px;
  }
  .label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10.5px;
  }
  .circuit > b {
    font: 500 15px/1.2 var(--font-data);
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
    font: 500 9px var(--font-data);
    fill: #f4f7fb;
    /* A dark outline keeps the labels readable on red and blue sites alike. */
    stroke: #0b1018;
    stroke-width: 2.5px;
    paint-order: stroke;
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
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 28px;
    padding: 0;
  }
  .icon svg {
    width: 14px;
    height: 14px;
  }
  .details.on {
    background: var(--steel);
    color: #0b1220;
  }
  .details {
    font-size: 12px;
    padding: 4px 8px;
  }
  .icon.zoom {
    border-color: var(--steel);
    color: var(--steel);
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
  }
</style>
