<script lang="ts">
  import type { ColorScale } from '../color/saturation';
  import { ui } from './state.svelte';

  interface Props {
    onColorScale: (scale: ColorScale) => void;
  }
  let { onColorScale }: Props = $props();
</script>

<section class="sheet" aria-label="Display">
  <div class="head">
    <h2>Display</h2>
    <button onclick={() => (ui.displayOpen = false)}>Close</button>
  </div>
  <div class="setting">
    <span class="label">Colours</span>
    <div class="choice" role="radiogroup" aria-label="Colour scale">
      <button role="radio" aria-checked={ui.colorScale === 'blue-red'} class:active={ui.colorScale === 'blue-red'} onclick={() => onColorScale('blue-red')}
        >Code</button
      >
      <button role="radio" aria-checked={ui.colorScale === 'natural'} class:active={ui.colorScale === 'natural'} onclick={() => onColorScale('natural')}
        >True colour</button
      >
    </div>
    <p>
      {#if ui.colorScale === 'natural'}
        Blood is bright red with O₂ and dark red without.
      {:else}
        Blue is only a code: real blood is never blue. Blood low in O₂ is dark red.
      {/if}
    </p>
  </div>
  <div class="setting">
    <span class="label">Organ close-ups</span>
    <div class="choice" role="radiogroup" aria-label="Organ close-ups">
      <button role="radio" aria-checked={ui.insetsOn} class:active={ui.insetsOn} onclick={() => (ui.insetsOn = true)}>On</button>
      <button role="radio" aria-checked={!ui.insetsOn} class:active={!ui.insetsOn} onclick={() => (ui.insetsOn = false)}>Off</button>
    </div>
    <p>While you follow a cell, a live close-up opens as it passes through each organ's capillaries.</p>
  </div>
</section>

<style>
  .sheet {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--dock-space, 150px) + 10px);
    width: min(420px, calc(100% - 32px));
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: grid;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-stretch: 85%;
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
  .setting {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 4px 10px;
  }
  .label {
    font-size: 13px;
  }
  .setting p {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
    line-height: 1.35;
    color: var(--muted);
  }
  .choice {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .choice button {
    border: 0;
    border-radius: 0;
    height: 28px;
    padding: 0 10px;
    color: var(--muted);
  }
  .choice button + button {
    border-left: 1px solid var(--line);
  }
  .choice button.active {
    background: var(--steel);
    color: #0b1220;
  }
</style>
