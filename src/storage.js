// localStorage persistence: settings, run history, custom scenarios.

const KEYS = {
  settings: 'aimforge.settings.v1',
  runs: 'aimforge.runs.v1',
  custom: 'aimforge.custom.v1',
  overrides: 'aimforge.overrides.v1',
};

export const DEFAULT_SETTINGS = {
  theme: 'forge',
  onboarded: false,   // true once the first-run intro has been played or dismissed
  calibrated: false,  // true once the first-run mouse wizard has been completed/skipped
  sens: 1.0,          // CS/Apex scale (0.022 deg per count at sens 1)
  dpi: 800,
  fov: 103,           // horizontal FOV, 16:9 style
  durationOverride: 0, // 0 = scenario default
  targetColor: '#2dd4bf',
  volume: 0.5,
  hitSound: true,
  crosshair: {
    style: 'crossdot',
    color: '#00ff66',
    size: 10,
    thickness: 2,
    gap: 4,
    outline: true,
  },
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
}

export function loadSettings() {
  const saved = readJSON(KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(saved.crosshair || {}) },
  };
}

export function saveSettings(settings) {
  writeJSON(KEYS.settings, settings);
}

export function resetSettings() {
  localStorage.removeItem(KEYS.settings);
}

// ---- runs ----
// run: { scenarioId, scenarioName, score, accuracy, hits, misses, kills, duration, date, meta }

export function loadRuns() {
  return readJSON(KEYS.runs, []);
}

export function addRun(run) {
  const runs = loadRuns();
  runs.push(run);
  // Keep history bounded so localStorage never fills up.
  if (runs.length > 2000) runs.splice(0, runs.length - 2000);
  writeJSON(KEYS.runs, runs);
  return runs;
}

export function runsFor(scenarioId) {
  return loadRuns().filter((r) => r.scenarioId === scenarioId);
}

export function personalBest(scenarioId) {
  const runs = runsFor(scenarioId);
  if (!runs.length) return null;
  return runs.reduce((best, r) => (r.score > best.score ? r : best));
}

export function wipeProgress() {
  localStorage.removeItem(KEYS.runs);
}

// ---- custom scenarios ----

export function loadCustomScenarios() {
  return readJSON(KEYS.custom, []);
}

export function saveCustomScenario(def) {
  const list = loadCustomScenarios();
  const i = list.findIndex((s) => s.id === def.id);
  if (i >= 0) list[i] = def;
  else list.push(def);
  writeJSON(KEYS.custom, list);
}

export function deleteCustomScenario(id) {
  writeJSON(KEYS.custom, loadCustomScenarios().filter((s) => s.id !== id));
}

// ---- per-scenario setting overrides ----
// { [scenarioId]: { duration?, radius?, count?, moveSpeed?, botCount?, distance? } }

export function loadOverrides() {
  return readJSON(KEYS.overrides, {});
}

export function setOverride(id, patch) {
  const all = loadOverrides();
  all[id] = { ...all[id], ...patch };
  writeJSON(KEYS.overrides, all);
  return all[id];
}

export function clearOverride(id) {
  const all = loadOverrides();
  delete all[id];
  writeJSON(KEYS.overrides, all);
}

// ---- export / import ----

export function exportAll() {
  return JSON.stringify(
    {
      app: 'aimforge',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: loadSettings(),
      runs: loadRuns(),
      custom: loadCustomScenarios(),
      overrides: loadOverrides(),
    },
    null,
    2
  );
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (data.app !== 'aimforge') throw new Error('Not an AimForge export file');
  if (data.settings) writeJSON(KEYS.settings, data.settings);
  if (Array.isArray(data.runs)) writeJSON(KEYS.runs, data.runs);
  if (Array.isArray(data.custom)) writeJSON(KEYS.custom, data.custom);
  if (data.overrides && typeof data.overrides === 'object') writeJSON(KEYS.overrides, data.overrides);
}
