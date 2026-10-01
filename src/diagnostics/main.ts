/**
 * Milestone 1 diagnostics page: shows the simulation core's emergent numbers
 * and lets you follow one red cell. No 3D yet.
 */
import { HEMOGLOBIN_STEP_COLORS, saturationCss } from '../color/saturation';
import { TISSUES, type Tissue } from '../physiology/params';
import { Simulation } from '../sim/simulation';
import { CellTracker, CirculationRecorder } from '../sim/tracking';

const app = document.getElementById('app')!;
app.innerHTML = '<p class="lead">Solving steady state…</p>';

// Let the message paint before the ~1 s calibration.
setTimeout(init, 20);

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;

function init(): void {
  const sim = new Simulation({ cellCount: 2000, seed: 1 });
  const circ = sim.circulation;
  const ss = sim.steady;
  const recorder = new CirculationRecorder(sim);
  let tracker = new CellTracker(sim, pickCell(sim));

  const venousOf = (tissue: Tissue) => {
    const caps = circ.segments.filter((s) => s.exchange?.type === 'tissue' && s.tissue === tissue);
    const flow = caps.reduce((a, s) => a + s.flow, 0);
    const content = caps.reduce((a, s) => a + ss.segments[s.index].contentOut * s.flow, 0) / flow;
    const sat = caps.reduce((a, s) => a + ss.segments[s.index].saturationOut * s.flow, 0) / flow;
    return { content, sat };
  };

  const markers: [number, string][] = [
    [ss.arterial.saturationIn, 'arterial'],
    [ss.mixedVenous.saturationIn, 'mixed venous'],
    [ss.segments[circ.get('coronary_sinus').index].saturationIn, 'coronary sinus'],
  ];
  const gradient = Array.from({ length: 21 }, (_, i) => `${saturationCss(i / 20)} ${i * 5}%`).join(', ');

  app.innerHTML = `
    <h1>Bloodstream: simulation core</h1>
    <p class="lead">A resting adult. ${sim.count.toLocaleString()} tracer red cells, timed in physiological seconds. Milestone 1 diagnostics; the 3D view comes next.</p>
    <div class="grid">
      <section>
        <h2>Whole body</h2>
        <div class="stats">
          <div class="stat"><b>${((circ.cardiacOutput * 60) / 1000).toFixed(1)} L/min</b><span>cardiac output</span></div>
          <div class="stat"><b>${(circ.totalVolume / 1000).toFixed(2)} L</b><span>blood volume</span></div>
          <div class="stat"><b>${circ.meanRbcCirculationTime.toFixed(0)} s</b><span>mean red-cell circulation</span></div>
          <div class="stat"><b>${pct(ss.arterial.saturationIn)}</b><span>arterial SO₂ (${ss.arterial.po2In.toFixed(0)} mmHg)</span></div>
          <div class="stat"><b>${pct(ss.mixedVenous.saturationIn)}</b><span>mixed venous SO₂ (${ss.mixedVenous.po2In.toFixed(0)} mmHg)</span></div>
          <div class="stat"><b>${circ.get('lung_L.cap').transit.toFixed(2)} s</b><span>lung capillary transit</span></div>
        </div>
      </section>
      <section>
        <h2>Saturation colour scale</h2>
        <div class="legend" style="background: linear-gradient(to right, ${gradient})"></div>
        <div class="ticks">${[0, 0.25, 0.5, 0.75, 1].map((s) => `<div style="left:${s * 100}%">${s * 100}%</div>`).join('')}</div>
        <div class="muted" style="font-size:12px">${markers.map(([s, n]) => `<span class="swatch" style="background:${saturationCss(s)}"></span>${n} ${pct(s, 0)}`).join(' &nbsp; ')}</div>
        <div class="hb">${HEMOGLOBIN_STEP_COLORS.map((c, n) => `<div style="background:${c}">${n}/4 O₂</div>`).join('')}</div>
      </section>
    </div>
    <div class="grid" style="margin-top:16px">
      <section>
        <h2>Follow one red cell</h2>
        <div class="controls">
          <label>Speed <select id="speed">
            <option value="0.01">0.01×</option><option value="0.1">0.1×</option><option value="1" selected>1× (real time)</option><option value="10">10×</option>
          </select></label>
          <button id="pause">Pause</button>
          <button id="another">Follow another cell</button>
        </div>
        <div class="row">
          <div class="molecule" id="molecule" title="One haemoglobin tetramer: α1 β1 / α2 β2"></div>
          <div id="cell" style="flex:1;min-width:200px"></div>
        </div>
        <ul class="route" id="route"></ul>
      </section>
      <section>
        <h2>Round-trip times (left ventricle → left ventricle)</h2>
        <canvas id="hist"></canvas>
        <div id="laps" class="muted" style="font-size:12px"></div>
      </section>
    </div>
    <section style="margin-top:16px">
      <h2>Organs at rest</h2>
      <div class="scroll"><table>
        <thead><tr><th>Tissue</th><th>Flow</th><th>VO₂</th><th>Capillary transit</th><th>Venous SO₂</th><th>Extraction</th></tr></thead>
        <tbody>${(Object.keys(TISSUES) as Tissue[])
          .map((t) => {
            const v = venousOf(t);
            const p = TISSUES[t];
            const inflow = circ.segments
              .filter((s) => s.exchange?.type === 'tissue' && s.tissue === t)
              .reduce((a, s) => a + ss.segments[s.index].contentIn * s.flow, 0);
            const flow = circ.segments.filter((s) => s.exchange?.type === 'tissue' && s.tissue === t).reduce((a, s) => a + s.flow, 0);
            return `<tr><td>${t}</td><td>${pct(p.flowFraction, 1)}</td><td>${p.vo2} mL/min</td><td>${p.capillaryTransit.toFixed(1)} s</td>
              <td><span class="swatch" style="background:${saturationCss(v.sat)}"></span>${pct(v.sat, 0)}</td><td>${pct(1 - v.content / (inflow / flow), 0)}</td></tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </section>`;

  const speedSel = document.getElementById('speed') as HTMLSelectElement;
  const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
  const cellEl = document.getElementById('cell')!;
  const moleculeEl = document.getElementById('molecule')!;
  const routeEl = document.getElementById('route')!;
  const lapsEl = document.getElementById('laps')!;
  const canvas = document.getElementById('hist') as HTMLCanvasElement;

  let paused = false;
  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  };
  document.getElementById('another')!.onclick = () => {
    tracker.dispose();
    tracker = new CellTracker(sim, pickCell(sim));
  };

  const SITE_NAMES = ['α1', 'β1', 'α2', 'β2'];
  let last = performance.now();
  let lastHist = 0;

  const frame = (now: number) => {
    const wall = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      const dt = wall * Number(speedSel.value);
      sim.step(dt);
      tracker.stepMolecule(dt);
    }
    renderCell();
    if (now - lastHist > 1000) {
      lastHist = now;
      renderHistogram();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function renderCell(): void {
    const c = tracker.cell;
    const seg = circ.segments[sim.segment[c]];
    const s = sim.saturation(c);
    const speed = sim.speed(c);
    const lap = tracker.timeSinceLapStart;
    cellEl.innerHTML = `
      <div><span class="swatch" style="background:${saturationCss(s)}"></span><b>${pct(s, 1)}</b> SO₂ · ${sim.po2[c].toFixed(0)} mmHg</div>
      <div>${seg.name}</div>
      <div class="muted">${speed >= 10 ? `${(speed / 10).toFixed(1)} cm/s` : `${speed.toFixed(2)} mm/s`} · ${pct(sim.progress(c), 0)} through ·
        ${Number.isNaN(lap) ? 'waiting to reach the left ventricle' : `${lap.toFixed(1)} s into this circuit`}</div>
      <div class="muted">Previous circuits: ${tracker.lapTimes.slice(-5).map((t) => `${t.toFixed(1)} s`).join(', ') || '—'}</div>
      <div class="muted">Of this cell's ~270 million Hb: ${tracker.hemoglobinDistribution.map((f, n) => `${n}: ${pct(f, 0)}`).join(' · ')}</div>`;
    moleculeEl.innerHTML = tracker.molecule.sites
      .map((on, i) => `<div class="${on ? 'on' : ''}" style="background:${on ? HEMOGLOBIN_STEP_COLORS[tracker.molecule.bound] : 'transparent'}">${SITE_NAMES[i]}</div>`)
      .join('');
    const items = tracker.route
      .slice(-12)
      .reverse()
      .map((r) => {
        const sg = circ.segments[r.segment];
        const dur = r.exit !== undefined ? `${(r.exit - r.enter).toFixed(2)} s` : '…';
        const sat = `${pct(r.saturationIn, 0)}${r.saturationOut !== undefined ? ` → ${pct(r.saturationOut, 0)}` : ''}`;
        return `<li><span class="swatch" style="background:${saturationCss(r.saturationOut ?? s)}"></span>${sg.name} · ${dur} · ${sat}</li>`;
      });
    routeEl.innerHTML = items.join('');
  }

  function renderHistogram(): void {
    const laps = recorder.laps;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const fg = getComputedStyle(document.body).color;
    const maxT = 180;
    const bins = 36;
    const counts = new Array(bins).fill(0);
    for (const l of laps) counts[Math.min(bins - 1, Math.floor((l.duration / maxT) * bins))]++;
    const peak = Math.max(1, ...counts);
    const bw = w / bins;
    ctx.fillStyle = saturationCss(0.97);
    counts.forEach((n, i) => {
      const bh = ((h - 18) * n) / peak;
      ctx.fillRect(i * bw + 1, h - 18 - bh, bw - 2, bh);
    });
    ctx.fillStyle = fg;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    for (let t = 0; t <= maxT; t += 30) ctx.fillText(`${t}s`, Math.min(w - 14, Math.max(8, (t / maxT) * w)), h - 4);
    const sorted = laps.map((l) => l.duration).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]?.toFixed(0) ?? '—';
    lapsEl.textContent = laps.length
      ? `${laps.length.toLocaleString()} circuits so far · median ${q(0.5)} s · 10th–90th percentile ${q(0.1)}–${q(0.9)} s. Short circuits go through the heart wall, brain and kidneys; long ones through the legs, skin and gut→liver. Long circuits are under-counted until the simulation has run for a few minutes.`
      : 'Collecting circuits… at 1× the first ones take about 15 s.';
  }
}

/** Start following a cell that is about to leave the left ventricle, so the first circuit is complete. */
function pickCell(sim: Simulation): number {
  const lv = sim.circulation.root.index;
  for (let i = 0; i < sim.count; i++) {
    const k = Math.floor(Math.random() * sim.count);
    if (sim.segment[k] === lv) return k;
  }
  return Math.floor(Math.random() * sim.count);
}
