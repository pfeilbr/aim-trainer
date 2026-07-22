import { Engine, cm360, BASE_DEG_PER_COUNT } from './engine.js';
import { SCENARIOS, PLAYLISTS, RANKS, rankFor, customToDef, createScenario } from './scenarios.js';
import * as store from './storage.js';
import { Sfx } from './audio.js';
import { drawLineChart } from './charts.js';
import { applyCrosshair } from './crosshair.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ============================== App state ==============================

let settings = store.loadSettings();
const sfx = new Sfx(settings);
const engine = new Engine($('#game-canvas'));
engine.applySettings(settings);

let currentDef = null;      // scenario def being played
let scenario = null;        // live scenario instance
let gameState = 'menu';     // menu | countdown | playing | paused | results
let countdownT = 0;
let timeLeft = 0;
let lastTime = 0;
let playlist = null;        // { def: playlistDef, index }
let activeCategory = 'All';

// ============================== Helpers ==============================

function allScenarioDefs() {
  return [...SCENARIOS, ...store.loadCustomScenarios().map(customToDef)];
}

function defById(id) {
  return allScenarioDefs().find((d) => d.id === id);
}

function runDuration(def) {
  return settings.durationOverride > 0 ? settings.durationOverride : def.duration;
}

function showScreen(name) {
  $('#screen-menu').classList.toggle('hidden', name !== 'menu');
  $('#screen-game').classList.toggle('hidden', name !== 'game');
  $('#screen-results').classList.toggle('hidden', name !== 'results');
  if (name === 'game') engine.resize();
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ============================== Menu: scenario cards ==============================

function rankBadgeHTML(def) {
  const pb = store.personalBest(def.id);
  if (!pb) return `<span class="rank-badge" style="color:#6b7280">NO RUNS</span>`;
  const rank = rankFor(pb.score, def.benchmarks);
  if (!rank) return `<span class="rank-badge" style="color:var(--accent2)">PB ${pb.score.toLocaleString()}</span>`;
  return `<span class="rank-badge" style="color:${rank.color}">${rank.name.toUpperCase()}</span>`;
}

function renderScenarioGrid() {
  const grid = $('#scenario-grid');
  grid.innerHTML = '';
  const defs = allScenarioDefs().filter(
    (d) => activeCategory === 'All' || d.cat === activeCategory
  );

  for (const def of defs) {
    const pb = store.personalBest(def.id);
    const runs = store.runsFor(def.id);
    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.innerHTML = `
      <span class="cat-badge">${def.cat}</span>
      <h3>${def.name}</h3>
      <p>${def.desc}</p>
      <div class="scenario-meta">
        ${rankBadgeHTML(def)}
        <span>${pb ? 'PB ' + pb.score.toLocaleString() : ''}</span>
        <span>${runs.length ? runs.length + ' runs' : ''}</span>
        <span>${runDuration(def)}s</span>
      </div>
      <div class="card-actions">
        <button class="btn primary play-btn">▶ Play</button>
        ${def.custom ? '<button class="btn edit-btn">Edit</button><button class="btn danger-outline del-btn">✕</button>' : ''}
      </div>`;
    card.querySelector('.play-btn').addEventListener('click', () => startScenario(def));
    if (def.custom) {
      card.querySelector('.edit-btn').addEventListener('click', () => openEditor(def.id));
      card.querySelector('.del-btn').addEventListener('click', () => {
        store.deleteCustomScenario(def.id);
        renderScenarioGrid();
      });
    }
    grid.appendChild(card);
  }

  if (activeCategory === 'All' || activeCategory === 'Custom') {
    const add = document.createElement('button');
    add.className = 'new-scenario-card';
    add.textContent = '+ Create custom scenario';
    add.addEventListener('click', () => openEditor(null));
    grid.appendChild(add);
  }
}

function renderPlaylists() {
  const row = $('#playlist-row');
  row.innerHTML = '';
  if (activeCategory !== 'All') return;
  for (const pl of PLAYLISTS) {
    const el = document.createElement('div');
    el.className = 'playlist-card';
    el.innerHTML = `
      <div class="pl-info"><h3>⚡ ${pl.name}</h3><p>${pl.desc}</p></div>
      <button class="btn primary big">Start routine ▶</button>`;
    el.querySelector('button').addEventListener('click', () => {
      playlist = { def: pl, index: 0 };
      startScenario(defById(pl.ids[0]));
    });
    row.appendChild(el);
  }
}

function renderProfileSummary() {
  const runs = store.loadRuns();
  const total = runs.length;
  const time = runs.reduce((a, r) => a + (r.duration || 0), 0);
  $('#profile-summary').innerHTML = total
    ? `<b>${total.toLocaleString()}</b> runs<br/><b>${Math.round(time / 60)}</b> min trained`
    : 'No runs yet.<br/>Start with Daily Warmup!';
}

function refreshMenu() {
  renderScenarioGrid();
  renderPlaylists();
  renderProfileSummary();
}

// nav + category tabs
$$('.nav-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    $(`#panel-${btn.dataset.panel}`).classList.add('active');
    if (btn.dataset.panel === 'stats') renderStats();
  })
);
$$('#category-tabs .tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('#category-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    activeCategory = tab.dataset.cat;
    renderScenarioGrid();
    renderPlaylists();
  })
);

// ============================== Game flow ==============================

function startScenario(def) {
  currentDef = def;
  scenario = createScenario(def, engine, sfx, settings);
  timeLeft = runDuration(def);
  engine.applySettings(settings);
  engine.resetView();
  engine.inputEnabled = false;

  $('#hud-scenario-name').textContent =
    def.name + (playlist ? `  ·  ${playlist.index + 1}/${playlist.def.ids.length}` : '');
  $('#hud-acc-label').textContent = scenario.hudAccLabel();
  applyCrosshair($('#crosshair'), settings.crosshair);
  $('#pause-overlay').classList.add('hidden');

  showScreen('game');
  gameState = 'countdown';
  countdownT = 3;
  $('#countdown').classList.remove('hidden');
  $('#countdown').textContent = '3';
  scenario.start();
  updateHUD();
  engine.requestLock();
}

function beginPlay() {
  $('#countdown').classList.add('hidden');
  gameState = 'playing';
  engine.inputEnabled = true;
  sfx.go();
}

function pauseGame() {
  if (gameState !== 'playing' && gameState !== 'countdown') return;
  gameState = 'paused';
  engine.inputEnabled = false;
  engine.releaseLock();
  $('#countdown').classList.add('hidden');
  $('#pause-overlay').classList.remove('hidden');
}

function resumeGame() {
  $('#pause-overlay').classList.add('hidden');
  gameState = 'countdown';
  countdownT = Math.min(3, Math.max(1.2, countdownT));
  countdownT = 1.5;
  $('#countdown').classList.remove('hidden');
  engine.requestLock();
}

function quitToMenu() {
  endScenarioCleanup();
  playlist = null;
  gameState = 'menu';
  showScreen('menu');
  refreshMenu();
}

function endScenarioCleanup() {
  if (scenario) scenario.end();
  scenario = null;
  engine.inputEnabled = false;
  engine.releaseLock();
}

function finishRun() {
  gameState = 'results';
  engine.inputEnabled = false;
  engine.releaseLock();
  sfx.end();

  const result = scenario.baseResult();
  const stats = scenario.resultStats();
  const meta = scenario.resultMeta();
  const prevPB = store.personalBest(currentDef.id);

  const run = {
    scenarioId: currentDef.id,
    scenarioName: currentDef.name,
    score: result.score,
    accuracy: +result.accuracy.toFixed(4),
    hits: result.hits,
    misses: result.misses,
    kills: result.kills,
    duration: runDuration(currentDef),
    date: new Date().toISOString(),
    meta,
  };
  store.addRun(run);

  renderResults(run, stats, prevPB);
  scenario.end();
  scenario = null;
  showScreen('results');
}

function renderResults(run, stats, prevPB) {
  $('#res-scenario').textContent = run.scenarioName;
  $('#res-score').textContent = run.score.toLocaleString();

  // delta vs previous PB
  const deltaEl = $('#res-delta');
  if (prevPB) {
    const d = run.score - prevPB.score;
    if (d > 0) { deltaEl.textContent = `▲ NEW PB (+${d.toLocaleString()})`; deltaEl.className = 'up'; }
    else { deltaEl.textContent = `PB ${prevPB.score.toLocaleString()}`; deltaEl.className = 'down'; }
  } else {
    deltaEl.textContent = '★ First run';
    deltaEl.className = 'up';
  }

  // rank
  const rank = rankFor(run.score, currentDef.benchmarks);
  const rankEl = $('#res-rank');
  const progEl = $('#res-rank-progress');
  if (rank) {
    rankEl.innerHTML = `<div class="rank-label">RANK</div><div class="rank-name" style="color:${rank.color}">${rank.name}</div>`;
    const pct = Math.round(Math.min(1, Math.max(0, rank.progress.pct)) * 100);
    progEl.innerHTML = rank.nextName
      ? `<div class="bar"><div class="fill" style="width:${pct}%"></div></div>
         <div class="bar-label"><span>${rank.name}</span><span>${pct}% → ${rank.nextName} (${rank.progress.to.toLocaleString()})</span></div>`
      : `<div class="bar"><div class="fill" style="width:100%"></div></div>
         <div class="bar-label"><span>Top rank reached — legend.</span><span></span></div>`;
  } else {
    rankEl.innerHTML = `<div class="rank-label">CUSTOM</div><div class="rank-name" style="color:var(--accent2)">—</div>`;
    progEl.innerHTML = '';
  }

  // stat cards
  $('#res-stats').innerHTML = stats
    .map((s) => `<div class="stat-card"><label>${s.label}</label><span>${s.value}</span></div>`)
    .join('');

  // playlist progress + next button
  const nextBtn = $('#res-next');
  if (playlist) {
    const total = playlist.def.ids.length;
    $('#res-playlist-progress').textContent = `${playlist.def.name} · ${playlist.index + 1}/${total}`;
    nextBtn.classList.toggle('hidden', playlist.index >= total - 1);
    if (playlist.index >= total - 1) {
      $('#res-playlist-progress').textContent = `${playlist.def.name} · complete! 🏁`;
    }
  } else {
    $('#res-playlist-progress').textContent = '';
    nextBtn.classList.add('hidden');
  }

  // history chart
  const scores = store.runsFor(run.scenarioId).slice(-20).map((r) => r.score);
  drawLineChart($('#res-chart'), scores);
}

// ============================== Main loop ==============================

function tick(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (gameState === 'countdown') {
    const prev = Math.ceil(countdownT);
    countdownT -= dt;
    const cur = Math.ceil(countdownT);
    if (countdownT <= 0) beginPlay();
    else {
      if (cur !== prev) sfx.tick();
      $('#countdown').textContent = String(cur);
    }
  }

  if (gameState === 'playing' && scenario) {
    scenario.elapsed += dt;
    timeLeft -= dt;
    scenario.update(dt);
    updateHUD();
    if (timeLeft <= 0) {
      finishRun();
    }
  }

  if (gameState === 'countdown' || gameState === 'playing' || gameState === 'paused') {
    engine.updateEffects(dt);
    engine.render();
  }
}

function updateHUD() {
  $('#hud-score').textContent = Math.max(0, Math.round(scenario.score)).toLocaleString();
  $('#hud-timer').textContent = Math.max(0, timeLeft).toFixed(1);
  $('#hud-acc').textContent = scenario.hudAccValue();
}

engine.onTriggerDown = () => {
  if (gameState === 'playing' && scenario) scenario.onTriggerDown();
};
engine.onPointerLockLost = () => {
  if (gameState === 'playing' || gameState === 'countdown') pauseGame();
};

// clicking the canvas while paused shouldn't shoot; clicking when countdown w/o lock re-requests
$('#game-canvas').addEventListener('click', () => {
  if (gameState === 'countdown' && !engine.pointerLocked) engine.requestLock();
});

// keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (gameState === 'results') { backToMenuFromResults(); }
    // pointer lock exit already triggers pause during play
  }
  if (e.key === 'r' || e.key === 'R') {
    if (gameState === 'paused' || gameState === 'playing' || gameState === 'countdown') {
      endScenarioCleanup();
      startScenario(currentDef);
    } else if (gameState === 'results') {
      startScenario(currentDef);
    }
  }
});

$('#btn-resume').addEventListener('click', resumeGame);
$('#btn-restart').addEventListener('click', () => { endScenarioCleanup(); startScenario(currentDef); });
$('#btn-quit').addEventListener('click', quitToMenu);

function backToMenuFromResults() {
  playlist = null;
  gameState = 'menu';
  showScreen('menu');
  refreshMenu();
}

$('#res-retry').addEventListener('click', () => startScenario(currentDef));
$('#res-menu').addEventListener('click', backToMenuFromResults);
$('#res-next').addEventListener('click', () => {
  if (!playlist) return;
  playlist.index++;
  const def = defById(playlist.def.ids[playlist.index]);
  if (def) startScenario(def);
  else backToMenuFromResults();
});

// ============================== Stats panel ==============================

function renderStats() {
  const runs = store.loadRuns();

  // summary cards
  const totalShots = runs.reduce((a, r) => a + (r.hits || 0) + (r.misses || 0), 0);
  const totalHits = runs.reduce((a, r) => a + (r.hits || 0), 0);
  const totalTime = runs.reduce((a, r) => a + (r.duration || 0), 0);
  const counts = {};
  runs.forEach((r) => (counts[r.scenarioName] = (counts[r.scenarioName] || 0) + 1));
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  $('#stats-summary').innerHTML = `
    <div class="stat-card"><label>Total runs</label><span>${runs.length.toLocaleString()}</span></div>
    <div class="stat-card"><label>Time trained</label><span>${(totalTime / 60).toFixed(0)}<small> min</small></span></div>
    <div class="stat-card"><label>Shots fired</label><span>${totalShots.toLocaleString()}</span></div>
    <div class="stat-card"><label>Overall accuracy</label><span>${totalShots ? Math.round((totalHits / totalShots) * 100) + '%' : '—'}</span></div>
    <div class="stat-card"><label>Favorite scenario</label><span style="font-size:1rem">${favorite ? favorite[0] : '—'}</span></div>`;

  // scenario select
  const sel = $('#stats-scenario-select');
  const defs = allScenarioDefs();
  const prev = sel.value;
  sel.innerHTML = defs.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  if (defs.some((d) => d.id === prev)) sel.value = prev;
  renderStatsChart();

  // recent runs
  const recent = [...runs].reverse().slice(0, 30);
  $('#recent-runs').innerHTML = recent.length
    ? recent.map((r) => `
        <div class="run-row">
          <span class="rr-name">${r.scenarioName}</span>
          <span class="rr-score">${r.score.toLocaleString()}</span>
          <span class="rr-dim">${Math.round((r.accuracy || 0) * 100)}%</span>
          <span class="rr-dim">${fmtDate(r.date)}</span>
        </div>`).join('')
    : '<div class="hint">No runs recorded yet.</div>';
}

function renderStatsChart() {
  const id = $('#stats-scenario-select').value;
  const def = defById(id);
  if (!def) return;
  const runs = store.runsFor(id);
  drawLineChart($('#stats-chart'), runs.slice(-40).map((r) => r.score));

  const pb = store.personalBest(id);
  const avg = runs.length ? Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length) : 0;
  const rank = pb ? rankFor(pb.score, def.benchmarks) : null;
  $('#stats-scenario-info').innerHTML = runs.length
    ? `<span>PB <b>${pb.score.toLocaleString()}</b></span>
       <span>Average <b>${avg.toLocaleString()}</b></span>
       <span>Runs <b>${runs.length}</b></span>
       ${rank ? `<span>Rank <b style="color:${rank.color}">${rank.name}</b></span>` : ''}`
    : '';
}

$('#stats-scenario-select').addEventListener('change', renderStatsChart);

// ============================== Settings panel ==============================

function bindSettings() {
  const s = settings;

  // sensitivity
  $('#set-sens').value = s.sens;
  $('#set-sens-slider').value = Math.min(5, s.sens);
  $('#set-dpi').value = s.dpi;
  const syncSens = (v) => {
    s.sens = Math.max(0.01, parseFloat(v) || 1);
    $('#set-sens').value = s.sens;
    $('#set-sens-slider').value = Math.min(5, s.sens);
    updateCm360();
    persist();
  };
  $('#set-sens').addEventListener('change', (e) => syncSens(e.target.value));
  $('#set-sens-slider').addEventListener('input', (e) => syncSens(e.target.value));
  $('#set-dpi').addEventListener('change', (e) => {
    s.dpi = Math.max(50, parseInt(e.target.value) || 800);
    updateCm360();
    persist();
  });

  function updateCm360() {
    const cm = cm360(s.sens, s.dpi);
    $('#cm360-display').textContent =
      `${cm.toFixed(1)} cm / 360°  ·  ${(BASE_DEG_PER_COUNT * s.sens).toFixed(4)}° per count @ ${s.dpi} DPI`;
  }
  updateCm360();

  // game sens converter
  $('#conv-apply').addEventListener('click', () => {
    const degPerCount = parseFloat($('#conv-game').value);
    const gameSens = parseFloat($('#conv-value').value);
    if (!gameSens || gameSens <= 0) return;
    syncSens((degPerCount * gameSens) / BASE_DEG_PER_COUNT);
  });

  // display
  $('#set-fov').value = s.fov;
  $('#set-fov-slider').value = s.fov;
  const syncFov = (v) => {
    s.fov = Math.min(140, Math.max(60, parseInt(v) || 103));
    $('#set-fov').value = s.fov;
    $('#set-fov-slider').value = s.fov;
    persist();
  };
  $('#set-fov').addEventListener('change', (e) => syncFov(e.target.value));
  $('#set-fov-slider').addEventListener('input', (e) => syncFov(e.target.value));

  $('#set-duration').value = String(s.durationOverride);
  $('#set-duration').addEventListener('change', (e) => {
    s.durationOverride = parseInt(e.target.value);
    persist();
    renderScenarioGrid();
  });
  $('#set-target-color').value = s.targetColor;
  $('#set-target-color').addEventListener('input', (e) => {
    s.targetColor = e.target.value;
    persist();
  });

  // crosshair
  const ch = s.crosshair;
  $('#ch-style').value = ch.style;
  $('#ch-color').value = ch.color;
  $('#ch-size').value = ch.size;
  $('#ch-thickness').value = ch.thickness;
  $('#ch-gap').value = ch.gap;
  $('#ch-outline').checked = ch.outline;
  const refreshCh = () => {
    applyCrosshair($('#crosshair-preview'), ch);
    persist();
  };
  $('#ch-style').addEventListener('change', (e) => { ch.style = e.target.value; refreshCh(); });
  $('#ch-color').addEventListener('input', (e) => { ch.color = e.target.value; refreshCh(); });
  $('#ch-size').addEventListener('input', (e) => { ch.size = parseInt(e.target.value); refreshCh(); });
  $('#ch-thickness').addEventListener('input', (e) => { ch.thickness = parseInt(e.target.value); refreshCh(); });
  $('#ch-gap').addEventListener('input', (e) => { ch.gap = parseInt(e.target.value); refreshCh(); });
  $('#ch-outline').addEventListener('change', (e) => { ch.outline = e.target.checked; refreshCh(); });
  applyCrosshair($('#crosshair-preview'), ch);

  // audio
  $('#set-volume').value = s.volume;
  $('#set-volume').addEventListener('input', (e) => {
    s.volume = parseFloat(e.target.value);
    persist();
    sfx.tick();
  });
  $('#set-hitsound').checked = s.hitSound;
  $('#set-hitsound').addEventListener('change', (e) => { s.hitSound = e.target.checked; persist(); });

  // data
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aimforge-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importAll(await file.text());
      settings = store.loadSettings();
      engine.applySettings(settings);
      alert('Import complete.');
      location.reload();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });
  $('#btn-reset-settings').addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults?')) return;
    store.resetSettings();
    location.reload();
  });
  $('#btn-reset-progress').addEventListener('click', () => {
    if (!confirm('Delete ALL run history? This cannot be undone.')) return;
    store.wipeProgress();
    refreshMenu();
    renderStats();
  });

  function persist() {
    store.saveSettings(s);
    engine.applySettings(s);
    sfx.settings = s;
  }
}

// ============================== Custom scenario editor ==============================

let editingId = null;

function openEditor(id) {
  editingId = id;
  const existing = id ? store.loadCustomScenarios().find((c) => c.id === id) : null;
  $('#editor-title').textContent = existing ? 'Edit scenario' : 'New custom scenario';
  $('#ed-name').value = existing?.name || '';
  $('#ed-mode').value = existing?.mode || 'click';
  $('#ed-count').value = existing?.count ?? 3;
  $('#ed-size').value = existing?.size ?? 0.9;
  $('#ed-duration').value = existing?.duration ?? 60;
  $('#ed-distance').value = existing?.distance ?? 20;
  $('#ed-width').value = existing?.width ?? 14;
  $('#ed-height').value = existing?.height ?? 6;
  $('#ed-speed').value = existing?.speed ?? 6;
  $('#ed-hits').value = existing?.hits ?? 1;
  $('#editor-modal').classList.remove('hidden');
}

$('#ed-save').addEventListener('click', () => {
  const name = $('#ed-name').value.trim() || 'Custom scenario';
  const def = {
    id: editingId || 'custom-' + Date.now().toString(36),
    name,
    mode: $('#ed-mode').value,
    count: Math.max(1, parseInt($('#ed-count').value) || 3),
    size: Math.max(0.05, parseFloat($('#ed-size').value) || 0.9),
    duration: Math.max(10, parseInt($('#ed-duration').value) || 60),
    distance: Math.max(5, parseFloat($('#ed-distance').value) || 20),
    width: Math.max(2, parseFloat($('#ed-width').value) || 14),
    height: Math.max(1, parseFloat($('#ed-height').value) || 6),
    speed: Math.max(0, parseFloat($('#ed-speed').value) || 0),
    hits: Math.max(1, parseInt($('#ed-hits').value) || 1),
  };
  store.saveCustomScenario(def);
  $('#editor-modal').classList.add('hidden');
  activeCategory = 'Custom';
  $$('#category-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.cat === 'Custom'));
  renderScenarioGrid();
  renderPlaylists();
});
$('#ed-cancel').addEventListener('click', () => $('#editor-modal').classList.add('hidden'));

// ============================== Boot ==============================

bindSettings();
refreshMenu();
showScreen('menu');

// Main loop: rAF when available, with an interval fallback so the game
// keeps stepping if rAF is throttled (background/embedded tabs).
function rafLoop(now) {
  tick(now);
  requestAnimationFrame(rafLoop);
}
requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(rafLoop);
});
setInterval(() => {
  const now = performance.now();
  if (now - lastTime > 60) tick(now);
}, 40);

// dev-only hook for automated testing
if (import.meta.env.DEV) {
  window.__AF = {
    engine,
    get scenario() { return scenario; },
    get gameState() { return gameState; },
    get timeLeft() { return timeLeft; },
    set timeLeft(v) { timeLeft = v; },
    resume: () => { $('#pause-overlay').classList.add('hidden'); gameState = 'playing'; engine.inputEnabled = true; },
    startScenario,
    defById,
  };
}
