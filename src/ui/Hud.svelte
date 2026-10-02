<script lang="ts">
  import { saturationCss, type ColorScale } from '../color/saturation';
  import ActivityPanel from './ActivityPanel.svelte';
  import BedPicker from './BedPicker.svelte';
  import FollowPanel from './FollowPanel.svelte';
  import MicroPanel from './MicroPanel.svelte';
  import TapMenu from './TapMenu.svelte';
  import { SPEEDS, ui } from './state.svelte';

  interface Props {
    onSpeed: (speed: number) => void;
    onPause: (paused: boolean) => void;
    onResetView: () => void;
    onFollowRandom: () => void;
    onStopFollow: () => void;
    onOpenBed: (capillary: number) => void;
    onBackToBody: () => void;
    onMicroReset: () => void;
    onFollowCell: (cell: number) => void;
    onActivity: (level: number) => void;
    onDismissHint: () => void;
    onColorScale: (scale: ColorScale) => void;
    capillaryIndex: (id: string) => number;
    allBeds: () => number[];
  }
  let {
    onSpeed,
    onPause,
    onResetView,
    onFollowRandom,
    onStopFollow,
    onOpenBed,
    onBackToBody,
    onMicroReset,
    onFollowCell,
    onActivity,
    onDismissHint,
    onColorScale,
    capillaryIndex,
    allBeds,
  }: Props = $props();

  let gradient = $derived(Array.from({ length: 21 }, (_, i) => `${saturationCss(i / 20, ui.colorScale)} ${i * 5}%`).join(', '));

  const clock = (t: number) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  };
  const speedLabel = (s: number) => (s < 1 ? `${s}×` : `${s}×`);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // The heart icon swells with each ejection.
  let heartScale = $derived(ui.beatPhase < ui.systole ? 1 + 0.25 * Math.sin((Math.PI * ui.beatPhase) / ui.systole) : 1);
</script>

{#if ui.follow}
  <div class="follow-wrap" class:micro={ui.view === 'micro'}>
    <FollowPanel info={ui.follow} onStop={onStopFollow} onZoom={ui.view === 'body' && ui.followBed >= 0 ? () => onOpenBed(ui.followBed) : undefined} />
  </div>
{/if}

{#if ui.view === 'micro' && ui.micro}
  <MicroPanel info={ui.micro} onBack={onBackToBody} onResetView={onMicroReset} />
{/if}

{#if ui.activityOpen}
  <ActivityPanel onApply={onActivity} />
{/if}

{#if ui.pickerOpen}
  <BedPicker {capillaryIndex} {allBeds} onPick={(c) => onOpenBed(c)} />
{/if}

{#if ui.tapMenu && ui.view === 'body'}
  <TapMenu menu={ui.tapMenu} onFollow={onFollowCell} onOpenBed={(c) => onOpenBed(c)} />
{/if}

{#if ui.hintOpen && ui.ready && ui.view === 'body' && !ui.follow && !ui.pickerOpen}
  <aside class="hint" aria-label="How to use">
    <p><b>Each dot is a red blood cell</b>, coloured by how much oxygen it carries, moving at real speed.</p>
    <ul>
      <li>Tap a cell to follow it round the body, or tap near an organ to zoom into its capillaries.</li>
      <li>Drag to rotate, pinch to zoom, two fingers to pan.</li>
      <li>Slow time down to 0.01× to watch oxygen load in the lungs.</li>
    </ul>
    <button onclick={onDismissHint}>Got it</button>
  </aside>
{/if}

<header class="brand" class:following={!!ui.follow || ui.view === 'micro'}>
  <h1>Bloodstream</h1>
  <p>{ui.activity.label} · {(ui.cardiacOutput * 0.06).toFixed(1)} L/min · {(ui.bloodVolume / 1000).toFixed(1)} L blood</p>
</header>

<div class="clock" class:following={!!ui.follow || ui.view === 'micro'} aria-live="off">
  <span class="label">Body time</span>
  <span class="value">{clock(ui.time)}</span>
  <span class="sub">{ui.paused ? 'paused' : ui.speed === 1 ? 'real time' : `${speedLabel(ui.speed)} real time`}</span>
  <span class="beat" aria-label={`Heart rate ${Math.round(ui.activity.heartRate)} beats per minute`}>
    <svg viewBox="0 0 16 16" aria-hidden="true" style:transform={`scale(${heartScale})`}
      ><path d="M8 14s-5.5-3.4-5.5-7.3A3 3 0 0 1 8 4.6a3 3 0 0 1 5.5 2.1C13.5 10.6 8 14 8 14z" fill="currentColor" /></svg
    >
    {Math.round(ui.activity.heartRate)} bpm
  </span>
</div>

{#if !ui.ready}
  <div class="loading" role="status">
    <div class="pulse"></div>
    <p>Calibrating the oxygen model…</p>
  </div>
{/if}

<div class="dock" id="dock">
  <div class="row">
    <button
      id="pause"
      class="icon"
      aria-label={ui.paused ? 'Play' : 'Pause'}
      onclick={() => onPause(!ui.paused)}
    >
      {#if ui.paused}
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
      {/if}
    </button>
    <div class="speeds" role="radiogroup" aria-label="Playback speed">
      {#each SPEEDS as s (s)}
        <button
          role="radio"
          aria-checked={ui.speed === s}
          class:active={ui.speed === s}
          onclick={() => onSpeed(s)}>{speedLabel(s)}</button
        >
      {/each}
    </div>
    <button
      class="icon follow"
      class:on={!!ui.follow}
      aria-label={ui.follow ? 'Stop following' : 'Follow a cell leaving the heart'}
      title={ui.follow ? 'Stop following' : 'Follow a cell leaving the heart'}
      onclick={() => (ui.follow ? onStopFollow() : onFollowRandom())}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.5" fill="none" /><circle
          cx="8"
          cy="8"
          r="2.2"
          fill="currentColor"
        /><path d="M8 0.5v2.4M8 13.1v2.4M0.5 8h2.4M13.1 8h2.4" stroke="currentColor" stroke-width="1.5" /></svg
      >
    </button>
    <button
      class="icon"
      class:on={ui.activityOpen || ui.activity.level > 0}
      aria-label="Activity level"
      title="Activity level"
      aria-expanded={ui.activityOpen}
      onclick={() => ((ui.activityOpen = !ui.activityOpen), (ui.pickerOpen = false))}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="10" cy="2.6" r="1.6" fill="currentColor" /><path
          d="M3 8.5l2.5-2.8 3 .8 1.6 2.6 2.4.6M8.5 6.5L7 10.5l2.6 1.6-1 3M7 10.5l-2.6 3.8"
          stroke="currentColor"
          stroke-width="1.5"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    </button>
    <button
      class="icon"
      class:on={ui.pickerOpen || ui.view === 'micro'}
      aria-label="Zoom into a capillary bed"
      title="Zoom into a capillary bed"
      aria-expanded={ui.pickerOpen}
      onclick={() => ((ui.pickerOpen = !ui.pickerOpen), (ui.activityOpen = false))}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.6" fill="none" /><path
          d="M10 10l4.5 4.5"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        /><path d="M4.5 6.5h4M6.5 4.5v4" stroke="currentColor" stroke-width="1.3" /></svg
      >
    </button>
    <button class="icon" aria-label="Reset view" title="Reset view" onclick={() => (ui.view === 'micro' ? onMicroReset() : onResetView())}>
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" stroke="currentColor" stroke-width="1.6" fill="none" /><path
          d="M1.8 2.8l1.1 3.7 3.6-1.2"
          stroke="currentColor"
          stroke-width="1.6"
          fill="none"
        /></svg
      >
    </button>
    <button class="icon" aria-label="About this view" aria-expanded={ui.infoOpen} onclick={() => (ui.infoOpen = !ui.infoOpen)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.5" fill="none" /><path
          d="M8 7v4.5M8 4.6v.1"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        /></svg
      >
    </button>
  </div>
  <div class="legend">
    <div class="bar" style:background={`linear-gradient(to right, ${gradient})`}>
      {#if ui.ready}
        <i style:left={pct(ui.mixedVenousSaturation)} title="Mixed venous"></i>
        <i style:left={pct(ui.arterialSaturation)} title="Arterial"></i>
      {/if}
    </div>
    <div class="ticks">
      {#if !ui.ready || ui.mixedVenousSaturation > 0.45}
        <span>0%</span>
        <span class="mid">O₂ saturation</span>
      {/if}
      {#if ui.ready}
        <!-- Low venous saturation (exercise): put the label to the right of its mark. -->
        <span class="mark" class:right={ui.mixedVenousSaturation < 0.45} style:left={pct(ui.mixedVenousSaturation)}
          >venous {pct(ui.mixedVenousSaturation)}</span
        >
        <span class="mark art" style:left={pct(ui.arterialSaturation)}>arterial {pct(ui.arterialSaturation)}</span>
      {/if}
    </div>
    <div class="scale">
      <p>
        {#if ui.colorScale === 'natural'}
          True colours: blood is bright red with O₂ and dark red without.
        {:else}
          Blue is only a code: real blood is never blue. Blood low in O₂ is dark red.
        {/if}
      </p>
      <div class="scales" role="radiogroup" aria-label="Colour scale">
        <button role="radio" aria-checked={ui.colorScale === 'blue-red'} class:active={ui.colorScale === 'blue-red'} onclick={() => onColorScale('blue-red')}
          >Code</button
        >
        <button role="radio" aria-checked={ui.colorScale === 'natural'} class:active={ui.colorScale === 'natural'} onclick={() => onColorScale('natural')}
          >True colour</button
        >
      </div>
    </div>
  </div>
</div>

{#if ui.infoOpen}
  <aside class="info">
    <h2>What you are seeing</h2>
    <p>
      Each dot is one of {ui.cellCount.toLocaleString()} tracer red blood cells, sampled from the body's ~25 trillion and coloured by
      how much oxygen its haemoglobin carries. They move at simulated physiological speed: at 1× a cell takes
      {Math.round(ui.meanCirculationTime)} s on average to get round the body and back to the heart.
    </p>
    <p>
      Vessels are coloured by the average saturation of the blood inside. The default colours are a code, as in textbook
      diagrams: real blood is never blue. Oxygen-rich blood is bright scarlet and oxygen-poor blood dark red (veins only
      look blue through skin). Switch to <i>True colour</i> under the colour bar to see it that way. Capillary beds (the short, thin loops in each organ)
      are drawn hugely enlarged: real capillaries are 5–8 µm wide and under 1 mm long. Cells are drawn about 600× too big.
    </p>
    <p>
      The magnifier opens a capillary bed at true scale: real cell sizes, capillary widths and speeds, with each white dot standing
      for a billion O₂ molecules crossing the capillary wall.
    </p>
    <p>
      Tap near an organ to zoom into its capillaries, or tap any cell (or the target button) to follow one. The panel then shows its oxygen saturation, where it is, how fast it moves,
      how long its current trip round the body has taken, and one of its haemoglobin molecules. At 1× the four binding sites flip
      faster than the eye can follow (the last O₂ stays bound for ~7 ms on average); slow down to 0.01× to watch them.
    </p>
    <p>
      The running figure sets the activity level, from rest to maximal exercise. Heart rate, cardiac output, O₂ use and where
      the blood goes all change; working leg muscle can take over 80 % of the flow and pull venous blood below 20 % saturation.
      Blood picks up CO₂ as it gives up O₂, and working muscle adds acid and heat. That shifts the O₂ curve right (the Bohr
      effect) and helps unloading; the followed cell's panel shows pH, PCO₂, temperature and P50 change along each capillary.
      Each heartbeat ejects blood only for about a third of the beat, so cells in the aorta surge and pause, while flow in
      capillaries and veins stays almost steady.
    </p>
    <p>Drag to rotate, pinch or scroll to zoom, two-finger drag or right-drag to pan.</p>
    <h2>Where the numbers come from</h2>
    <p class="sources">
      Blood volume, flows and organ O₂ use: Guyton &amp; Hall; Ganong. Lung diffusion and transit: West, Respiratory Physiology.
      O₂ dissociation curve: Severinghaus 1979. Haemoglobin binding steps: Imai's Adair constants; on/off rates within Gibson's
      measured T- and R-state ranges. Red cell shape: Evans &amp; Fung 1972. Capillary haematocrit: Pries et al. 1990. Arterial and
      venous saturations, circuit times and per-organ O₂ extraction are not set by hand: they emerge from the model and are checked by
      automated tests.
    </p>
    <button class="close" onclick={() => (ui.infoOpen = false)}>Close</button>
  </aside>
{/if}

<style>
  .brand,
  .clock,
  .dock,
  .info,
  .loading {
    pointer-events: auto;
  }
  .brand {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 14px);
    left: 16px;
    pointer-events: none;
  }
  h1 {
    margin: 0;
    font-size: 21px;
    font-weight: 650;
    font-stretch: 78%;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }
  .brand p {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 12px;
  }
  .clock {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 14px);
    right: 16px;
    display: grid;
    justify-items: end;
    pointer-events: none;
  }
  @media (max-width: 480px) {
    /* Speeds get their own full-width row on phones. */
    .row {
      flex-wrap: wrap;
      justify-content: space-between;
      row-gap: 8px;
    }
    .row .speeds {
      order: -1;
      flex: 1 0 100%;
    }
  }
  .follow-wrap {
    display: contents;
  }
  .hint {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 150px);
    width: min(420px, calc(100% - 32px));
    padding: 12px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-size: 13px;
  }
  .hint p {
    margin: 0 0 6px;
  }
  .hint ul {
    margin: 0 0 10px;
    padding-left: 18px;
    color: #c4ccd8;
    display: grid;
    gap: 3px;
  }
  .hint button {
    padding: 5px 14px;
  }
  @media (max-width: 480px) {
    .hint {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 190px);
    }
  }
  @media (max-width: 820px) {
    .follow-wrap.micro {
      display: none;
    }
  }
  .icon.on,
  .follow.on {
    background: var(--steel);
    color: #0b1220;
  }
  @media (max-width: 820px) {
    .brand.following,
    .clock.following {
      display: none;
    }
  }
  @media (min-width: 821px) {
    .brand.following {
      display: none;
    }
  }
  .clock .label,
  .clock .sub {
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .beat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 3px;
    font: 12px var(--font-data);
    color: #f0838a;
  }
  .beat svg {
    width: 13px;
    height: 13px;
  }
  .clock .value {
    font: 500 22px/1.15 var(--font-data);
    font-variant-numeric: tabular-nums;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    color: var(--muted);
  }
  .pulse {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--steel);
    animation: beat 0.86s ease-in-out infinite;
  }
  @keyframes beat {
    0%, 100% { transform: scale(0.7); opacity: 0.5; }
    20% { transform: scale(1.15); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; }
  }
  .dock {
    position: absolute;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
    transform: translateX(-50%);
    width: min(560px, calc(100% - 32px));
    display: grid;
    gap: 10px;
    padding: 10px 12px 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  button {
    font: inherit;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--steel);
    outline-offset: 2px;
  }
  .icon {
    width: 36px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .icon svg {
    width: 16px;
    height: 16px;
  }
  .speeds {
    flex: 1;
    min-width: 0;
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .speeds button {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 0;
    height: 32px;
    padding: 0;
    font: 500 11px var(--font-data);
    color: var(--muted);
  }
  .speeds button + button {
    border-left: 1px solid var(--line);
  }
  .speeds button.active {
    background: var(--steel);
    color: #0b1220;
  }
  .legend .bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
  }
  .legend .bar i {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 14px;
    margin-left: -1px;
    background: var(--text);
    border-radius: 1px;
  }
  .scale {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
  }
  .scale p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 11px;
    line-height: 1.3;
    color: var(--muted);
  }
  .scales {
    flex: none;
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .scales button {
    border: 0;
    border-radius: 0;
    height: 26px;
    padding: 0 9px;
    font: 500 11px var(--font-ui);
    color: var(--muted);
  }
  .scales button + button {
    border-left: 1px solid var(--line);
  }
  .scales button.active {
    background: var(--steel);
    color: #0b1220;
  }
  .ticks {
    position: relative;
    height: 16px;
    margin-top: 3px;
    font: 11px var(--font-data);
    color: var(--muted);
  }
  .ticks span {
    position: absolute;
    top: 0;
    white-space: nowrap;
  }
  .ticks .mid {
    left: 26%;
    transform: translateX(-50%);
    font-family: var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 10px;
  }
  .ticks .mark {
    transform: translateX(-100%);
    padding-right: 4px;
    color: var(--text);
  }
  .ticks .mark.right {
    transform: none;
    padding: 0 0 0 4px;
  }
  .ticks .mark.art {
    left: auto !important;
    right: 0;
    transform: none;
    padding: 0;
  }
  .info {
    position: absolute;
    right: 16px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 130px);
    width: min(360px, calc(100% - 32px));
    max-height: calc(100% - 220px);
    overflow-y: auto;
    padding: 14px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .info h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-stretch: 85%;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .info p {
    margin: 0 0 10px;
    color: #c4ccd8;
    font-size: 13px;
  }
  .close {
    padding: 5px 12px;
  }
  .info h2 + .sources,
  .sources {
    font-size: 12px;
    color: var(--muted);
  }
  .info h2:not(:first-child) {
    margin-top: 14px;
  }
</style>
