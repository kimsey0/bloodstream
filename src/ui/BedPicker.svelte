<script lang="ts">
  import { saturationCss } from '../color/saturation';
  import { MICRO_BEDS } from '../micro/beds';
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
  const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const bedName = (i: number) => capitalise(ui.segmentNames[i].replace(/: .*$/, ''));
</script>

<div class="sheet" role="dialog" aria-label="Choose a capillary bed">
  <div class="head">
    <h2>Zoom into a capillary bed</h2>
    <button onclick={() => (ui.pickerOpen = false)}>Close</button>
  </div>
  {#if ui.follow && ui.followBed >= 0}
    <button class="item mine" onclick={() => onPick(ui.followBed)}>
      <span class="name">Where your cell is now</span>
      <span class="sub">{bedName(ui.followBed)}</span>
    </button>
  {/if}
  <ul>
    {#each items as b (b.capillary)}
      {@const sat = ui.bedSaturation[b.index]}
      <li>
        <button class="item" onclick={() => onPick(b.index)}>
          <span class="name">{b.label}</span>
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
</div>

<style>
  .sheet {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 140px);
    width: min(420px, calc(100% - 32px));
    max-height: calc(100% - 140px - 90px - env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: grid;
    gap: 8px;
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
  @media (max-width: 480px) {
    .sheet {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 168px);
      max-height: calc(100% - 168px - 90px - env(safe-area-inset-bottom, 0px));
    }
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
