<script lang="ts">
  import { saturationCss } from '../color/saturation';
  import { ui, type MicroInfo } from './state.svelte';

  interface Props {
    info: MicroInfo;
    onBack: () => void;
    onResetView: () => void;
  }
  let { info, onBack, onResetView }: Props = $props();

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  /** A round scale-bar length whose bar is 60–160 px wide. */
  let bar = $derived.by(() => {
    const per100 = ui.microScalePx;
    for (const um of [5, 10, 20, 50, 100, 200, 500, 1000]) {
      const px = (per100 * um) / 100;
      if (px >= 60) return { um, px: Math.min(px, 200) };
    }
    return { um: 1000, px: (per100 * 1000) / 100 };
  });
  const fmtSpeed = (um: number) => (um >= 1000 ? `${(um / 1000).toFixed(2)} mm/s` : `${Math.round(um)} µm/s`);
</script>

{#if ui.microCollapsed}
  <div class="pill-row">
    <button class="pill back-pill" onclick={onBack} aria-label="Back to the body">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg>
      Body
    </button>
    <button class="pill" aria-label="Show the capillary bed panel" onclick={() => (ui.microCollapsed = false)}>
      {info.label}
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5 4.5-4.5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg>
    </button>
  </div>
{:else}
<section class="panel" aria-label="Capillary bed">
  <div class="head">
    <button class="back" onclick={onBack}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg>
      Body
    </button>
    <h2>{info.label}</h2>
    <button class="ghost" onclick={onResetView} aria-label="Reset microscope view">Recentre</button>
    <button class="collapse" onclick={() => (ui.microCollapsed = true)} aria-label="Collapse panel" title="Collapse"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" /></svg></button>
  </div>
  <p class="blurb">{info.blurb}</p>
  <dl>
    <div><dt>Capillary</dt><dd>{Math.round(info.lengthUm)} µm long · {info.diameterUm.toFixed(0)} µm wide</dd></div>
    <div><dt>Red cell</dt><dd>{fmtSpeed(info.speedUm)} · {info.transit.toFixed(2)} s to cross</dd></div>
    <div>
      <dt>SO₂</dt>
      <dd>
        <span class="sw" style:background={saturationCss(info.saturationIn)}></span>{pct(info.saturationIn)} in →
        <span class="sw" style:background={saturationCss(info.saturationOut)}></span>{pct(info.saturationOut)} out
      </dd>
    </div>
  </dl>
  <div class="foot">
    <span class="dot"></span>
    <span class="dotlabel"
      >= 10⁹ O₂ molecules {info.lung ? 'entering a cell' : 'leaving a cell'} · ~{info.dotsPerPass < 1
        ? info.dotsPerPass.toFixed(1)
        : Math.round(info.dotsPerPass)} per cell</span
    >
    <span class="scale" style:width={`${bar.px}px`}>{bar.um} µm</span>
  </div>
  {#if ui.follow}
    <p class="you">
      {#if ui.microFollow === 'here'}
        Your cell (ringed) is passing through this patch.
      {:else if ui.microFollow === 'approaching'}
        Your cell is on its way here through the arterioles.
      {:else}
        Your cell is elsewhere: {ui.segmentNames[ui.follow.segment]}.
      {/if}
    </p>
  {/if}
</section>
{/if}

<style>
  .pill {
    pointer-events: auto;
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
  .pill-row {
    pointer-events: auto;
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    right: 16px;
    display: flex;
    gap: 8px;
    max-width: calc(100% - 32px);
  }
  @media (min-width: 821px) {
    .pill-row {
      top: calc(env(safe-area-inset-top, 0px) + 84px);
    }
  }
  @media (max-width: 520px) {
    .pill-row {
      left: 16px;
      right: auto;
    }
  }

  .panel {
    pointer-events: auto;
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    right: 16px;
    width: min(380px, calc(100% - 32px));
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 17px;
    font-weight: 650;
    font-stretch: 82%;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    min-width: 0;
  }
  button {
    font: inherit;
    font-size: 12px;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-left: 4px;
  }
  .back svg {
    width: 16px;
    height: 16px;
  }
  .blurb {
    margin: 0;
    color: #c4ccd8;
    font-size: 13px;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 2px;
    font-size: 12.5px;
  }
  dl div {
    display: flex;
    gap: 10px;
  }
  dt {
    width: 64px;
    flex: none;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10.5px;
    line-height: 18px;
  }
  dd {
    margin: 0;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 4px;
    vertical-align: -1px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 12px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d9f7ff;
    box-shadow: 0 0 6px #bff1ff;
  }
  .dotlabel {
    flex: 1;
    min-width: 160px;
  }
  .scale {
    height: 18px;
    border: 1.5px solid var(--text);
    border-top: 0;
    font: 11px/14px var(--font-data);
    color: var(--text);
    text-align: center;
  }
  .you {
    margin: 0;
    font-size: 12px;
    color: var(--steel);
  }
  @media (min-width: 821px) {
    .panel {
      top: calc(env(safe-area-inset-top, 0px) + 84px);
    }
  }
  @media (max-width: 520px) {
    .blurb {
      display: none;
    }
    .panel {
      left: 16px;
      right: auto;
    }
  }
</style>
