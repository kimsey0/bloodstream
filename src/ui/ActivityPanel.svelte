<script lang="ts">
  import { ACTIVITY_LABELS, activityState } from '../physiology/activity';
  import { isNormalScenario } from '../physiology/scenario';
  import { ui } from './state.svelte';

  interface Props {
    onApply: (level: number) => void;
  }
  let { onApply }: Props = $props();

  /** Slider position while dragging; applied on release. */
  let draft = $state(ui.activity.level);
  let preview = $derived(activityState(draft));
  let busy = $derived(ui.activityPending !== null);

  const apply = () => {
    if (Math.abs(draft - ui.activity.level) > 0.004) onApply(Math.round(draft * 100) / 100);
  };
</script>

<div class="sheet" role="dialog" aria-label="Activity level">
  <div class="head">
    <h2>Activity</h2>
    <button onclick={() => (ui.activityOpen = false)}>Close</button>
  </div>
  <div class="now">
    <b>{preview.label}</b>
    <span>{preview.met.toFixed(1)} MET</span>
  </div>
  <input
    id="activity-level"
    type="range"
    min="0"
    max="1"
    step="0.01"
    bind:value={draft}
    onchange={apply}
    aria-label="Activity level from rest to maximal exercise"
    aria-valuetext={preview.label}
  />
  <div class="ticks">
    {#each ACTIVITY_LABELS as t (t.level)}
      <button class="tick" style:left={`${t.level * 100}%`} onclick={() => ((draft = t.level), apply())}>{t.label}</button>
    {/each}
  </div>
  <dl>
    <div><dt>Heart rate</dt><dd>{Math.round(preview.heartRate)} bpm</dd></div>
    <div><dt>Cardiac output</dt><dd>{(preview.cardiacOutput * 0.06).toFixed(1)} L/min</dd></div>
    <div><dt>O₂ use</dt><dd>{(preview.vo2 / 1000).toFixed(2)} L/min</dd></div>
    <div><dt>To muscle</dt><dd>{Math.round((preview.tissueFlow.muscle / (preview.cardiacOutput * 60)) * 100)}% of blood flow</dd></div>
  </dl>
  <p class="note">
    {#if busy}
      Recalculating flows and oxygen exchange…
    {:else if ui.limit}
      <b>{ui.limit.label} is beyond this body's VO₂max{isNormalScenario(ui.scenario) ? '' : ' in these conditions'}.</b> The {ui.limit.organ.toLowerCase()} could not get the O₂ it would use, so the body stays at {ui.activity.label.toLowerCase()}.
    {:else}
      The change is instant here; in a real body heart rate and flow take a minute or two to settle.
    {/if}
  </p>
</div>

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
    gap: 10px;
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
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .now {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .now b {
    font-size: 18px;
    font-weight: 650;
    font-stretch: 85%;
  }
  .now span {
    color: var(--muted);
    font: 12px var(--font-data);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--steel);
  }
  .ticks {
    position: relative;
    height: 26px;
    margin: -4px 10px 0;
  }
  .tick {
    position: absolute;
    transform: translateX(-50%);
    border: 0;
    padding: 2px 4px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .tick:first-child {
    transform: translateX(-20%);
  }
  .tick:last-child {
    transform: translateX(-80%);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
  }
  dt {
    color: var(--muted);
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font: 500 14px var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
