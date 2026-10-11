<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { activityState } from '../physiology/activity';
  import { BLOOD } from '../physiology/dissociation';
  import {
    barometricPressure,
    inspiredPo2,
    isNormalScenario,
    NORMAL_SCENARIO,
    SCENARIO_PRESETS,
    scenarioActivity,
    type Scenario,
  } from '../physiology/scenario';
  import { ui } from './state.svelte';

  interface Props {
    /** Apply a scenario, at the current activity level unless one is given. */
    onApply: (scenario: Scenario, level?: number) => void;
  }
  let { onApply }: Props = $props();

  /** The scenario being edited; applied with the button. */
  let draft: Scenario = $state({ ...ui.scenario });
  let busy = $derived(ui.scenarioPending !== null);
  const same = (a: Scenario, b: Scenario) => JSON.stringify(a) === JSON.stringify(b);
  let changed = $derived(!same(draft, ui.scenario));
  let preset = $derived(SCENARIO_PRESETS.find((p) => same(p.scenario, draft)));

  // Preview without touching the simulation's blood: pressures from the scenario module, capacity by hand.
  let alveolar = $derived(scenarioActivity(activityState(ui.activity.level), draft).alveolarPo2);
  let capacity = $derived(draft.hb * BLOOD.hufner * (1 - draft.coFraction));
  let normalCapacity = NORMAL_SCENARIO.hb * BLOOD.hufner;

  const pick = (s: Scenario) => (draft = { ...s });
  const fmt = (n: number) => n.toLocaleString('en-GB');
</script>

<Sheet title="What if?" onClose={() => (ui.whatIfOpen = false)} width={440}>
  <div class="presets" role="group" aria-label="Scenarios">
    {#each SCENARIO_PRESETS as p (p.id)}
      <button class:active={preset?.id === p.id} onclick={() => pick(p.scenario)}>{p.label}</button>
    {/each}
  </div>

  <label>
    <span>Haemoglobin <b>{draft.hb.toFixed(1)} g/dL</b></span>
    <input type="range" min="5" max="20" step="0.5" bind:value={draft.hb} />
  </label>
  <label>
    <span>Altitude <b>{fmt(Math.round(draft.altitude))} m</b></span>
    <input type="range" min="0" max="8848" step="1" bind:value={draft.altitude} />
  </label>
  <label>
    <span>Carbon monoxide <b>{Math.round(draft.coFraction * 100)} % of Hb</b></span>
    <input type="range" min="0" max="0.6" step="0.01" bind:value={draft.coFraction} />
  </label>
  <label>
    <span>O₂ affinity: P50 <b>{draft.p50.toFixed(1)} mmHg</b></span>
    <input type="range" min="15" max="40" step="0.1" bind:value={draft.p50} />
    <small>P50 is the O₂ pressure at which haemoglobin is half full, at standard pH and temperature. Lower means it grips O₂ more tightly.</small>
  </label>
  <label class="check">
    <input type="checkbox" bind:checked={draft.compensate} />
    <span>Body compensates: heart, brain and muscle raise their blood flow</span>
  </label>

  <dl>
    <div><dt>Air pressure</dt><dd>{Math.round(barometricPressure(draft.altitude))} mmHg · inspired PO₂ {Math.round(inspiredPo2(draft.altitude))}</dd></div>
    <div><dt>Alveolar PO₂</dt><dd>{Math.round(alveolar)} mmHg at {activityState(ui.activity.level).label.toLowerCase()}</dd></div>
    <div><dt>O₂ capacity</dt><dd>{capacity.toFixed(1)} mL per dL blood{Math.abs(capacity - normalCapacity) > 0.05 ? ` (normal ${normalCapacity.toFixed(1)})` : ''}</dd></div>
  </dl>

  <p class="note" aria-live="polite">
    {#if busy}
      Recalculating: the body adjusts its flows organ by organ…
    {:else if ui.limit}
      <b>Beyond this body's limits at {ui.limit.label.toLowerCase()}.</b> The {ui.limit.organ.toLowerCase()} could not get the O₂ it uses,
      so the previous state stays. Try it at a lower activity level{draft.compensate ? '' : ', or let the body compensate'}.
    {:else if preset}
      {preset.note}
    {:else}
      A custom mix. O₂ use stays that of the activity level.
    {/if}
  </p>
  {#snippet footer()}
    {#if ui.limit && ui.limit.level > 0 && !busy}
      <button class="ghost" onclick={() => onApply({ ...draft }, 0)}>Apply at rest instead</button>
    {/if}
    <button class="ghost" disabled={isNormalScenario(draft) && draft.compensate} onclick={() => pick(NORMAL_SCENARIO)}>Reset</button>
    <button class="apply" disabled={!changed || busy} onclick={() => onApply({ ...draft })}>{busy ? 'Applying…' : changed ? 'Apply' : 'Applied'}</button>
  {/snippet}
</Sheet>

<style>
  button {
    font: inherit;
    font-size: 12px;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 5px 10px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .presets button.active,
  .apply:not(:disabled) {
    background: var(--steel);
    border-color: var(--steel);
    color: #0b1220;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 12px;
    color: var(--muted);
  }
  label small {
    font-size: 11px;
    line-height: 1.3;
  }
  label b {
    color: var(--text);
    font-family: var(--font-data);
    font-weight: 500;
  }
  label span {
    display: flex;
    justify-content: space-between;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--steel);
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .check span {
    display: inline;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 3px;
    font-size: 12px;
  }
  dl div {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-family: var(--font-data);
  }
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
    min-height: 3.6em;
  }
  .note b {
    color: var(--text);
  }
</style>
