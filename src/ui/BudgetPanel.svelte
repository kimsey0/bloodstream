<script lang="ts">
  import Sheet from './Sheet.svelte';
  /**
   * The body's O2 budget: what the heart sends out (cardiac output × arterial O2 content), what
   * each organ takes, and the fraction of arriving O2 it extracts.
   */
  import { saturationCss } from '../color/saturation';
  import type { OxygenBudget } from '../sim/budget';
  import { ui } from './state.svelte';

  interface Props {
    budget: OxygenBudget;
  }
  let { budget }: Props = $props();

  const NAMES: Record<string, string> = {
    brain: 'Brain',
    heart: 'Heart wall',
    kidney: 'Kidneys',
    gut: 'Gut & spleen',
    liver: 'Liver',
    muscle: 'Skeletal muscle',
    skin: 'Skin',
    bronchial: 'Airway walls',
    other: 'Bone, fat & other',
  };
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const mL = (x: number) => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(x >= 10 ? 0 : 1));
</script>

<Sheet title="O₂ budget" onClose={() => (ui.budgetOpen = false)} width={440}>

  <dl class="whole">
    <div><dt>Delivered</dt><dd>{mL(budget.delivered)} <small>mL/min</small></dd></div>
    <div><dt>Used</dt><dd>{mL(budget.used)} <small>mL/min</small></dd></div>
    <div><dt>Extracted</dt><dd>{pct(budget.extraction)}</dd></div>
  </dl>
  <p class="formula">
    Cardiac output {(budget.cardiacOutput / 1000).toFixed(1)} L/min × arterial O₂ {budget.arterialContent.toFixed(1)} mL/dL =
    {mL(budget.delivered)} mL O₂/min. Blood returns with {budget.mixedVenousContent.toFixed(1)} mL/dL, so the body used the difference.
  </p>

  <table>
    <thead>
      <tr>
        <th scope="col">Organ</th>
        <th scope="col">Flow <small>L/min</small></th>
        <th scope="col">O₂ used <small>mL/min</small></th>
        <th scope="col">Extracted</th>
      </tr>
    </thead>
    <tbody>
      {#each budget.organs as o (o.tissue)}
        <tr title={`${NAMES[o.tissue]}: ${mL(o.delivered)} mL O₂/min arrive, ${mL(o.used)} are used; blood leaves ${pct(o.venousSaturation)} saturated.`}>
          <th scope="row">{NAMES[o.tissue]}</th>
          <td>{(o.flow / 1000).toFixed(2)}</td>
          <td>{mL(o.used)}</td>
          <td class="ext">
            <span class="bar" aria-hidden="true"><span style:width={pct(o.extraction)}></span></span>
            {pct(o.extraction)}
            <span class="sw" style:background={saturationCss(o.venousSaturation, ui.colorScale)} aria-hidden="true"></span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="note">
    Extracted: the share of the O₂ arriving in an organ's capillaries that it takes; the swatch is the colour of the blood
    leaving. The liver's blood is mostly portal blood the gut has already used, so organ deliveries add up to more than the
    total.
  </p>
</Sheet>

<style>
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
    font: 500 18px var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  small {
    color: var(--muted);
    font-size: 10px;
  }
  .formula,
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 3px 4px;
    text-align: right;
    white-space: nowrap;
  }
  thead th {
    color: var(--muted);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--line);
  }
  th:first-child {
    text-align: left;
    padding-left: 0;
  }
  tbody th {
    font-weight: 500;
  }
  td {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  thead small {
    font-size: 9px;
    letter-spacing: 0;
    text-transform: none;
  }
  .ext {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .bar {
    display: inline-block;
    width: 40px;
    height: 6px;
    border-radius: 3px;
    background: rgba(141, 153, 171, 0.18);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--steel);
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  @media (max-width: 400px) {
    /* Small phones: the bars and one-line headers would push the table past the sheet's edge. */
    .bar {
      display: none;
    }
    thead th {
      white-space: normal;
    }
    thead small {
      display: block;
    }
  }
</style>
