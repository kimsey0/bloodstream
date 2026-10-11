<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { saturationCss } from '../color/saturation';
  import { MICRO_BEDS } from '../micro/beds';
  import { placeName, showName } from './names';
  import { ui } from './state.svelte';

  interface Props {
    capillaryIndex: (id: string) => number;
    allBeds: () => number[];
    onPick: (capillary: number) => void;
  }
  let { capillaryIndex, allBeds, onPick }: Props = $props();

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  let items = $derived(MICRO_BEDS.map((b) => ({ ...b, index: capillaryIndex(b.capillary) })));
  let showAll = $state(false);

  const REGION_LABEL: Record<string, string> = {
    lung_L: 'Lungs',
    lung_R: 'Lungs',
    heart: 'Heart',
    head: 'Head',
    thorax: 'Chest',
    trunk: 'Trunk wall',
    abdomen: 'Abdomen',
    pelvis: 'Pelvis',
    arm_L: 'Left arm & hand',
    arm_R: 'Right arm & hand',
    leg_L: 'Left leg & foot',
    leg_R: 'Right leg & foot',
  };
  let groups = $derived.by(() => {
    const map = new Map<string, number[]>();
    for (const i of allBeds()) {
      const g = REGION_LABEL[ui.segmentRegions[i]] ?? ui.segmentRegions[i];
      map.set(g, [...(map.get(g) ?? []), i]);
    }
    return [...map.entries()];
  });
  const bedName = (i: number) => placeName(ui.segmentNames[i]);
</script>

<Sheet title="Zoom into a capillary bed" onClose={() => (ui.pickerOpen = false)}>
  {#if ui.follow && ui.followBed >= 0}
    <button class="item mine" onclick={() => onPick(ui.followBed)}>
      <span class="name">Where your cell is now</span>
      <span class="sub">{bedName(ui.followBed)}</span>
    </button>
  {/if}
  <p class="caption">See red cells and oxygen at true scale. The figures are the blood's O₂ saturation going in → coming out.</p>
  <ul>
    {#each items as b (b.capillary)}
      {@const sat = ui.bedSaturation[b.index]}
      <li>
        <button class="item" onclick={() => onPick(b.index)}>
          <span class="name">{showName(b.label)}</span>
          {#if sat}
            <span class="sats">
              <span class="sw" style:background={saturationCss(sat[0], ui.colorScale)}></span>{pct(sat[0])}
              →
              <span class="sw" style:background={saturationCss(sat[1], ui.colorScale)}></span>{pct(sat[1])}
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
  <button class="more" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
    {showAll ? 'Hide' : 'Show'} all capillary beds
  </button>
  {#if showAll}
    {#each groups as [group, beds] (group)}
      <h3>{group}</h3>
      <ul>
        {#each beds as i (i)}
          {@const sat = ui.bedSaturation[i]}
          <li>
            <button class="item small" onclick={() => onPick(i)}>
              <span>{bedName(i)}</span>
              {#if sat}<span class="sats">{pct(sat[0])} → {pct(sat[1])}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</Sheet>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  button {
    font: inherit;
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
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    text-align: left;
  }
  .item.small {
    padding: 6px 10px;
    font-size: 13px;
  }
  .more {
    justify-self: start;
    font-size: 12px;
  }
  h3 {
    margin: 6px 0 0;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .item:hover {
    border-color: var(--steel);
  }
  .mine {
    border-color: var(--steel);
    flex-wrap: wrap;
  }
  .caption {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .name {
    font-weight: 600;
  }
  .sub {
    color: var(--muted);
    font-size: 12px;
  }
  .sats {
    font: 12px var(--font-data);
    color: var(--muted);
    white-space: nowrap;
  }
  .sw {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 2px;
    margin-right: 3px;
  }
</style>
