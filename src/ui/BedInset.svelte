<script lang="ts">
  import { ui } from './state.svelte';

  interface Props {
    onExpand: () => void;
    onDismiss: () => void;
  }
  let { onExpand, onDismiss }: Props = $props();

  /** A round scale-bar length whose bar is 40–110 px wide. */
  let bar = $derived.by(() => {
    const per100 = ui.insetScalePx;
    for (const um of [5, 10, 20, 50, 100, 200, 500, 1000]) {
      const px = (per100 * um) / 100;
      if (px >= 40) return { um, px: Math.min(px, 110) };
    }
    return { um: 1000, px: (per100 * 1000) / 100 };
  });
  const fmtSpeed = (um: number) => (um >= 1000 ? `${(um / 1000).toFixed(2)} mm/s` : `${Math.round(um)} µm/s`);
</script>

{#if ui.inset}
  <section class="inset" aria-label={`Close-up: ${ui.inset.label}`}>
    <button id="bed-inset-view" class="view" onclick={onExpand} aria-label="Open this capillary bed full screen">
      <span class="scale" style:width={`${bar.px}px`}>{bar.um} µm</span>
    </button>
    <div class="bar">
      <span class="dot" class:here={ui.inset.status === 'here'}></span>
      <span class="text">
        <b>{ui.inset.label}</b>
        <span class="status" aria-live="polite"
          >{ui.inset.status === 'here'
            ? `crossing · ${fmtSpeed(ui.inset.speedUm)}`
            : ui.inset.status === 'approaching'
              ? 'on its way in'
              : 'has left'}</span
        >
      </span>
      <button class="close" onclick={onDismiss} aria-label="Close this close-up">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" /></svg>
      </button>
    </div>
  </section>
{/if}

<style>
  .inset {
    pointer-events: auto;
    position: absolute;
    right: 16px;
    bottom: calc(var(--dock-space, 180px) + 10px);
    width: min(360px, calc(100% - 32px));
    display: grid;
    grid-template-rows: 1fr auto;
    height: min(270px, 32vh);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    background: transparent;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
    animation: rise 0.18s ease-out;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .inset {
      animation: none;
    }
  }
  .view {
    position: relative;
    display: block;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
  }
  .view:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: -2px;
  }
  .scale {
    position: absolute;
    left: 10px;
    bottom: 8px;
    border-top: 2px solid var(--text);
    padding-top: 2px;
    font: 11px var(--font-data);
    color: var(--text);
    text-align: left;
    text-shadow: 0 1px 2px #000;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
    background: var(--panel);
    border-top: 1px solid var(--line);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--muted);
  }
  .dot.here {
    border-color: var(--text);
    background: var(--text);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    line-height: 1.3;
    white-space: nowrap;
  }
  .text b {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .status {
    flex: none;
    color: var(--steel);
    font-family: var(--font-data);
    font-size: 11px;
  }
  .close {
    flex: none;
    width: 28px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
  }
  .close svg {
    width: 12px;
    height: 12px;
  }
  .close:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  @media (max-width: 480px) {
    .inset {
      height: min(220px, 27vh);
    }
  }
</style>
