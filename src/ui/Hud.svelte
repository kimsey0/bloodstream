<script lang="ts">
  import { saturationCss, type ColorScale } from '../color/saturation';
  import ActivityPanel from './ActivityPanel.svelte';
  import BudgetPanel from './BudgetPanel.svelte';
  import BedInset from './BedInset.svelte';
  import BedPicker from './BedPicker.svelte';
  import DisplayPanel from './DisplayPanel.svelte';
  import FollowPanel from './FollowPanel.svelte';
  import MicroPanel from './MicroPanel.svelte';
  import TapMenu from './TapMenu.svelte';
  import WhatIfPanel from './WhatIfPanel.svelte';
  import Sheet from './Sheet.svelte';
  import { isNormalScenario, type Scenario } from '../physiology/scenario';
  import { SPEEDS, ui } from './state.svelte';

  interface Props {
    onSpeed: (speed: number) => void;
    onPause: (paused: boolean) => void;
    onResetView: () => void;
    onFollowRandom: () => void;
    onStopFollow: () => void;
    onOpenBed: (capillary: number) => void;
    onExpandInset: () => void;
    onDismissInset: () => void;
    onBackToBody: () => void;
    onMicroReset: () => void;
    onFollowCell: (cell: number) => void;
    onActivity: (level: number) => void;
    onScenario: (scenario: Scenario, level?: number) => void;
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
    onExpandInset,
    onDismissInset,
    onBackToBody,
    onMicroReset,
    onFollowCell,
    onActivity,
    onScenario,
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
  const VENOUS_TIP = 'Venous: blood returning to the heart from the whole body (mixed venous), before the lungs refill it';
  const ARTERIAL_TIP = 'Arterial: blood leaving the lungs and heart for the organs';
  /** Short description of the "what if" scenario, or '' when normal. */
  let scenarioText = $derived.by(() => {
    const s = ui.scenario;
    if (isNormalScenario(s)) return s.compensate ? '' : 'no compensation';
    const parts: string[] = [];
    if (Math.abs(s.hb - 15) > 1e-9) parts.push(`Hb ${s.hb.toFixed(1)}`);
    if (s.altitude > 0) parts.push(`${Math.round(s.altitude).toLocaleString('en-GB')} m`);
    if (s.coFraction > 0) parts.push(`CO ${Math.round(s.coFraction * 100)} %`);
    if (Math.abs(s.p50 - 26.86) > 1e-9) parts.push(`P50 ${s.p50.toFixed(0)}`);
    if (!s.compensate) parts.push('no compensation');
    return parts.join(' · ');
  });
  type SheetFlag = 'activityOpen' | 'whatIfOpen' | 'pickerOpen' | 'budgetOpen' | 'displayOpen' | 'infoOpen';
  /** Open one dock sheet (or close it if open), closing the others. */
  function toggleSheet(sheet: SheetFlag): void {
    const open = !ui[sheet];
    ui.activityOpen = ui.whatIfOpen = ui.pickerOpen = ui.budgetOpen = ui.displayOpen = ui.infoOpen = false;
    ui[sheet] = open;
  }
  /** Escape closes the topmost thing; Space pauses unless a control has focus. */
  function onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const inControl = !!target?.closest('input, button, select, textarea, [role="menu"]');
    if (e.key === 'Escape') {
      if (ui.tapMenu) ui.tapMenu = null;
      else if (ui.activityOpen || ui.whatIfOpen || ui.pickerOpen || ui.budgetOpen || ui.displayOpen || ui.infoOpen)
        ui.activityOpen = ui.whatIfOpen = ui.pickerOpen = ui.budgetOpen = ui.displayOpen = ui.infoOpen = false;
      else if (ui.hintOpen) onDismissHint();
      else if (ui.view === 'micro') onBackToBody();
      else return;
      e.preventDefault();
    } else if (e.key === ' ' && !inControl && ui.ready) {
      e.preventDefault();
      onPause(!ui.paused);
    }
  }
  /** Touch-first devices get tap and pinch wording; mice get click and scroll. */
  const touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const tap = touch ? 'Tap' : 'Click';
  // The heart icon swells with each ejection.
  let heartScale = $derived(ui.beatPhase < ui.systole ? 1 + 0.25 * Math.sin((Math.PI * ui.beatPhase) / ui.systole) : 1);
</script>

<svelte:window onkeydown={onKey} />

{#if ui.follow}
  <div class="follow-wrap" class:micro={ui.view === 'micro'}>
    <FollowPanel info={ui.follow} onStop={onStopFollow} onZoom={ui.view === 'body' && ui.followBed >= 0 ? () => onOpenBed(ui.followBed) : undefined} />
  </div>
{/if}

{#if ui.view === 'body'}
  <BedInset onExpand={onExpandInset} onDismiss={onDismissInset} />
{/if}

{#if ui.view === 'micro' && ui.micro}
  <MicroPanel info={ui.micro} onBack={onBackToBody} onResetView={onMicroReset} />
{/if}

{#if ui.activityOpen}
  <ActivityPanel onApply={onActivity} />
{/if}

{#if ui.whatIfOpen}
  <WhatIfPanel onApply={onScenario} />
{/if}

{#if ui.displayOpen}
  <DisplayPanel {onColorScale} />
{/if}

{#if ui.budgetOpen && ui.budget}
  <BudgetPanel budget={ui.budget} />
{/if}

{#if ui.pickerOpen}
  <BedPicker {capillaryIndex} {allBeds} onPick={(c) => onOpenBed(c)} />
{/if}

{#if ui.hover && !ui.tapMenu}
  <div class="hover" style:left={`${ui.hover.x + 14}px`} style:top={`${ui.hover.y + 16}px`} aria-hidden="true">{ui.hover.text}</div>
{/if}

{#if ui.tapMenu && ui.view === 'body'}
  <TapMenu menu={ui.tapMenu} onFollow={onFollowCell} onOpenBed={(c) => onOpenBed(c)} />
{/if}

{#if ui.hintOpen && ui.ready && ui.view === 'body' && !ui.follow && !ui.pickerOpen}
  <aside class="hint" aria-label="How to use">
    <div class="hint-body">
    <p>
      <b>Each dot is a red blood cell</b>, moving at real speed and coloured by how much oxygen it carries: red when full,
      blue when it has given some up. (Blue is only a code: real blood is never blue.)
    </p>
    <ul>
      <li>{tap} a cell to ride along with it round the body, or {tap.toLowerCase()} near an organ to look inside its capillaries.</li>
      <li>{touch ? 'Drag to rotate, pinch to zoom, two fingers to pan.' : 'Drag to rotate, scroll to zoom, right-drag to pan.'}</li>
      <li>The buttons below change the speed, exercise level and conditions such as altitude.</li>
    </ul>
    </div>
    <div class="hint-actions">
      <button class="primary" onclick={() => (onDismissHint(), onFollowRandom())}>Follow a red cell</button>
      <button onclick={onDismissHint}>Explore on my own</button>
    </div>
  </aside>
{/if}

<header class="brand" class:following={!!ui.follow || ui.view === 'micro'}>
  <h1>Bloodstream</h1>
  <p>{ui.activity.label} · heart pumps {(ui.cardiacOutput * 0.06).toFixed(1)} L/min · {(ui.bloodVolume / 1000).toFixed(1)} L of blood</p>
  {#if scenarioText}<p class="whatif">What if: {scenarioText}</p>{/if}
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
    <div class="speeds" role="group" aria-label="Playback">
      <button class="pause" class:active={ui.paused} aria-label={ui.paused ? 'Play' : 'Pause'} aria-pressed={ui.paused} onclick={() => onPause(!ui.paused)}>
        {#if ui.paused}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
        {/if}
      </button>
      {#each SPEEDS as s (s)}
        <button
          aria-pressed={ui.speed === s}
          aria-label={`${speedLabel(s)} speed`}
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
    <span class="lbl" aria-hidden="true">{ui.follow ? 'Stop' : 'Follow'}</span>
    </button>
    <button
      class="icon"
      class:on={ui.activityOpen || ui.activity.level > 0}
      aria-label="Activity level"
      title="Activity level"
      aria-expanded={ui.activityOpen}
      onclick={() => toggleSheet('activityOpen')}
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
    <span class="lbl" aria-hidden="true">Activity</span>
    </button>
    <button
      class="icon"
      class:on={ui.whatIfOpen || !isNormalScenario(ui.scenario) || !ui.scenario.compensate}
      aria-label="What if: change the blood or the altitude"
      title="What if: change the blood or the altitude"
      aria-expanded={ui.whatIfOpen}
      onclick={() => toggleSheet('whatIfOpen')}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><path
          d="M6 1.8h4M6.8 1.8v4.4L2.6 13a1.2 1.2 0 0 0 1 1.8h8.8a1.2 1.2 0 0 0 1-1.8L9.2 6.2V1.8"
          stroke="currentColor"
          stroke-width="1.5"
          fill="none"
          stroke-linejoin="round"
        /><path d="M4.3 10.4h7.4" stroke="currentColor" stroke-width="1.3" /></svg
      >
    <span class="lbl" aria-hidden="true">What if</span>
    </button>
    <button
      class="icon"
      class:on={ui.pickerOpen || ui.view === 'micro'}
      aria-label="Zoom into a capillary bed"
      title="Zoom into a capillary bed"
      aria-expanded={ui.pickerOpen}
      onclick={() => toggleSheet('pickerOpen')}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.6" fill="none" /><path
          d="M10 10l4.5 4.5"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        /><path d="M4.5 6.5h4M6.5 4.5v4" stroke="currentColor" stroke-width="1.3" /></svg
      >
    <span class="lbl" aria-hidden="true">Zoom in</span>
    </button>
    <button
      class="icon"
      class:on={ui.displayOpen}
      aria-label="Display: colours and organ close-ups"
      title={ui.colorScale === 'natural' ? 'Display: true colours, organ close-ups' : 'Display: colours (blue is only a code), organ close-ups'}
      aria-expanded={ui.displayOpen}
      onclick={() => toggleSheet('displayOpen')}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><path d="M1.2 8s2.5-4.6 6.8-4.6S14.8 8 14.8 8 12.3 12.6 8 12.6 1.2 8 1.2 8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" /><circle
          cx="8"
          cy="8"
          r="2.3"
          fill="currentColor"
        /></svg
      >
    <span class="lbl" aria-hidden="true">Display</span>
    </button>
    <button
      class="icon"
      class:on={ui.budgetOpen}
      aria-label="Oxygen budget: delivery, use and extraction"
      title="Oxygen budget: delivery, use and extraction"
      aria-expanded={ui.budgetOpen}
      onclick={() => toggleSheet('budgetOpen')}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><path d="M2 14.2h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path
          d="M3.5 12.6V7.5h2.4v5.1zM6.8 12.6V3.2h2.4v9.4zM10.1 12.6V9.4h2.4v3.2z"
          fill="currentColor"
        /></svg
      >
    <span class="lbl" aria-hidden="true"><span class="long">O₂ budget</span><span class="short">Budget</span></span>
    </button>
    <button class="icon" aria-label="Reset view" title={ui.follow ? 'Stop following and show the whole body' : 'Show the whole body'} onclick={() => (ui.view === 'micro' ? onMicroReset() : onResetView())}>
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7" stroke="currentColor" stroke-width="1.6" fill="none" /><path
          d="M1.8 2.8l1.1 3.7 3.6-1.2"
          stroke="currentColor"
          stroke-width="1.6"
          fill="none"
        /></svg
      >
    <span class="lbl" aria-hidden="true">Reset</span>
    </button>
    <button class="icon" class:on={ui.infoOpen} aria-label="About this view" title="What you are seeing, and where the numbers come from" aria-expanded={ui.infoOpen} onclick={() => toggleSheet('infoOpen')}>
      <svg viewBox="0 0 16 16" aria-hidden="true"
        ><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.5" fill="none" /><path
          d="M8 7v4.5M8 4.6v.1"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        /></svg
      >
    <span class="lbl" aria-hidden="true">About</span>
    </button>
  </div>
  <div class="legend">
    <div class="bar" style:background={`linear-gradient(to right, ${gradient})`}>
      {#if ui.ready}
        <i style:left={pct(ui.mixedVenousSaturation)} title={VENOUS_TIP}></i>
        <i style:left={pct(ui.arterialSaturation)} title={ARTERIAL_TIP}></i>
      {/if}
    </div>
    <div class="ticks">
      <span class="mid" class:crowded={ui.ready && ui.mixedVenousSaturation <= 0.45}>O₂ saturation</span>
      {#if ui.ready}
        <!-- Low venous saturation (exercise): put the label to the right of its mark. -->
        <span class="mark" class:right={ui.mixedVenousSaturation < 0.45} style:left={pct(ui.mixedVenousSaturation)} title={VENOUS_TIP}
          >venous {pct(ui.mixedVenousSaturation)}</span
        >
        <!-- Near 100 % the label is pinned to the right edge; lower (altitude, CO) it sits right of its mark. -->
        <span class="mark art" class:pinned={ui.arterialSaturation > 0.8} style:left={pct(ui.arterialSaturation)} title={ARTERIAL_TIP}>arterial {pct(ui.arterialSaturation)}</span>
        <!-- Narrow screens: no room to label each mark, so one line on the right. -->
        <span class="summary">venous {pct(ui.mixedVenousSaturation)} · arterial {pct(ui.arterialSaturation)}</span>
      {/if}
    </div>
  </div>
</div>

{#if ui.infoOpen}
  <Sheet title="About Bloodstream" onClose={() => (ui.infoOpen = false)} width={460}>
    <div class="info">
      <p>
        A model of how blood carries oxygen round the body. Each dot is one of {ui.cellCount.toLocaleString()} tracer red blood
        cells, sampled from the body's ~25 trillion and coloured by how much oxygen its haemoglobin carries. They move at
        simulated physiological speed: at 1× a cell takes {Math.round(ui.meanCirculationTime)} s on average to get round the
        body and back to the heart.
      </p>
      <h3>Colours and scale</h3>
      <p>
        Vessels are coloured by the average saturation of the blood inside. The default colours are a code, as in textbook
        diagrams: real blood is never blue. Oxygen-rich blood is bright scarlet and oxygen-poor blood dark red (veins only look
        blue through skin); <i>Display</i> switches to true colour. Capillary beds (the short, thin loops in each organ) and
        cells are drawn hugely enlarged: real capillaries are 5–8 µm wide and under 1 mm long, and cells are drawn about 600×
        too big.
      </p>
      <h3>Things to try</h3>
      <ul>
        <li>
          <b>Follow</b> a cell, or {tap.toLowerCase()} one. Its panel shows its oxygen, where it is and how long its trip round
          the body takes; <i>Details</i> adds the O₂ curve, blood chemistry and one of its haemoglobin molecules.
        </li>
        <li>
          <b>Zoom in</b>, or {tap.toLowerCase()} near an organ, to see its capillaries at true scale: real cell sizes, widths
          and speeds, with each white dot a billion O₂ molecules crossing the wall.
        </li>
        <li><b>Activity</b> goes from rest to maximal exercise: working leg muscle can take over 80 % of the blood flow.</li>
        <li><b>What if</b> changes the blood or the air: anaemia, altitude, carbon monoxide.</li>
        <li><b>O₂ budget</b> shows where the oxygen goes: at rest the body uses about a quarter of what the heart sends out.</li>
        <li>Slow to <b>0.01×</b> to watch blood load in the lungs, or single O₂ molecules bind to haemoglobin.</li>
      </ul>
      <h3>For physiology students</h3>
      <p>
        Blood picks up CO₂ as it gives up O₂, which makes it more acidic. That shifts the O₂ curve right (the Bohr effect) and
        helps unloading; the followed cell's <i>Details</i> show pH, PCO₂, temperature and P50 change along each capillary.
        Blood loses some O₂ before the capillaries, through the walls of the arterioles that feed them: in resting muscle
        about two-thirds of what it gives up, as measured in animals. In the lungs each cell passes one group of air sacs; some
        get less fresh air for their blood flow than others (V/Q mismatch), which lowers arterial PO₂ a little below that of
        the air.
      </p>
      <p>
        Each heartbeat ejects blood for only about a third of the beat, so cells in the aorta surge and pause while flow in
        capillaries and veins stays almost steady. The heart wall is the exception: contracting muscle squeezes its own
        vessels, so about three-quarters of its blood arrives in diastole, between beats. At 1× haemoglobin's four binding sites
        flip faster than the eye can follow (the last O₂ stays bound for ~7 ms on average).
      </p>
      <h3>Controls</h3>
      <p>
        {touch
          ? 'Drag to rotate, pinch to zoom, two-finger drag to pan.'
          : 'Drag to rotate, scroll to zoom, right-drag to pan. Space pauses; Escape closes panels and leaves the microscope.'}
      </p>
      <h3>Where the numbers come from</h3>
      <p class="sources">
        Blood volume, flows and organ O₂ use: Guyton &amp; Hall; Ganong. Lung diffusion and transit: West, Respiratory
        Physiology. O₂ dissociation curve: Severinghaus 1979. Haemoglobin binding steps: Imai's Adair constants; on/off rates
        within Gibson's measured T- and R-state ranges. Red cell shape: Evans &amp; Fung 1972. Capillary haematocrit: Pries et
        al. 1990. Arterial and venous saturations, circuit times and per-organ O₂ extraction are not set by hand: they emerge
        from the model and are checked by automated tests.
      </p>
      <p class="sources">
        <a href="https://github.com/kimsey0/bloodstream/blob/main/docs/SOURCES.md" target="_blank" rel="noopener">Every number and its source</a>
        · <a href="https://github.com/kimsey0/bloodstream" target="_blank" rel="noopener">Source code</a>
      </p>
    </div>
  </Sheet>
{/if}

<style>
  .brand,
  .clock,
  .dock,
  .loading {
    pointer-events: auto;
  }
  .brand {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 14px);
    left: 16px;
    /* Wrap before the clock on the right. */
    right: 130px;
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
  .brand p.whatif {
    color: var(--steel);
  }
  .clock {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 14px);
    right: 16px;
    display: grid;
    justify-items: end;
    pointer-events: none;
  }
  @media (max-width: 680px) {
    /* Speeds get their own full-width row on narrow screens: one row would squeeze them. */
    .row {
      flex-wrap: wrap;
      justify-content: space-between;
      row-gap: 8px;
      column-gap: 4px;
    }
    .row .icon {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
    }
    .row .speeds {
      order: -1;
      flex: 1 0 100%;
    }
    .row .speeds button {
      height: 34px;
    }
  }
  .follow-wrap {
    display: contents;
  }
  .hover {
    position: absolute;
    max-width: 260px;
    padding: 3px 8px;
    font-size: 12px;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    pointer-events: none;
    white-space: nowrap;
  }
  .hint {
    pointer-events: auto;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--dock-space, 150px) + 10px);
    width: min(420px, calc(100% - 32px));
    max-height: calc(100% - var(--dock-space, 150px) - 100px - env(safe-area-inset-top, 0px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-size: 13px;
  }
  .hint-body {
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px 4px;
  }
  .hint p {
    margin: 0 0 6px;
  }
  .hint ul {
    margin: 0 0 4px;
    padding-left: 18px;
    color: #c4ccd8;
    display: grid;
    gap: 3px;
  }
  .hint-actions {
    flex: none;
    padding: 6px 14px 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hint button {
    padding: 6px 14px;
  }
  .hint button.primary {
    background: var(--steel);
    border-color: var(--steel);
    color: #0b1220;
    font-weight: 600;
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
    width: min(760px, calc(100% - 32px));
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
    width: 50px;
    height: 42px;
    flex: none;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    padding: 0;
  }
  .icon .lbl {
    font-size: 10px;
    font-stretch: 75%;
    line-height: 1;
    white-space: nowrap;
    color: var(--muted);
  }
  .icon.on .lbl {
    color: inherit;
  }
  .lbl .short {
    display: none;
  }
  @media (max-width: 400px) {
    .lbl .long {
      display: none;
    }
    .lbl .short {
      display: inline;
    }
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
    height: 40px;
    padding: 0;
    font: 500 11px var(--font-data);
    color: var(--muted);
  }
  .speeds button + button {
    border-left: 1px solid var(--line);
  }
  .speeds .pause {
    flex: 0.7;
    display: grid;
    place-items: center;
    color: var(--text);
  }
  .speeds .pause svg {
    width: 13px;
    height: 13px;
  }
  .speeds button.active {
    background: var(--steel);
    color: #0b1220;
  }
  .legend .bar {
    position: relative;
    height: 6px;
    border-radius: 3px;
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
  .ticks {
    position: relative;
    height: 14px;
    margin-top: 2px;
    font: 11px var(--font-data);
    color: var(--muted);
  }
  .ticks span {
    position: absolute;
    top: 0;
    white-space: nowrap;
  }
  .ticks .mid {
    left: 0;
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
    transform: none;
    padding: 0 0 0 4px;
  }
  .ticks .mark.art.pinned {
    left: auto !important;
    right: 0;
    transform: none;
    padding: 0;
  }
  .ticks .mid.crowded {
    display: none;
  }
  .ticks .summary {
    display: none;
    right: 0;
    color: var(--text);
  }
  @media (max-width: 480px) {
    .ticks .mark {
      display: none;
    }
    .ticks .mid.crowded,
    .ticks .summary {
      display: inline;
    }
  }
  .info {
    display: grid;
    gap: 8px;
    font-size: 13px;
    color: #c4ccd8;
  }
  .info p,
  .info ul {
    margin: 0;
  }
  .info ul {
    padding-left: 18px;
    display: grid;
    gap: 4px;
  }
  .info b {
    color: var(--text);
    font-weight: 600;
  }
  .info h3 {
    margin: 6px 0 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--steel);
  }
  .sources {
    font-size: 12px;
    color: var(--muted);
  }
  .sources a {
    color: var(--steel);
  }
</style>
