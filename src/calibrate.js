// Mouse calibration wizard.
//
// Browsers can't read mouse DPI, so instead of asking for numbers we measure
// the user's natural "180° turn" flick in raw pointer-lock counts and set
// sensitivity so that flick rotates exactly 180°. While capturing we also
// estimate polling rate, detect trackpad-like input, and detect whether raw
// (unaccelerated) input is available.

import { BASE_DEG_PER_COUNT, cm360 } from './engine.js';

const MIN_FLICK_COUNTS = 150;  // below this a burst isn't a real flick
const SMALL_BURST_COUNTS = 40; // above this we at least coach the user
const BURST_GAP_MS = 200;      // idle gap that ends a burst
const TRACKPAD_PEAK = 6;       // flicks whose per-event peak is tiny → trackpad

export function initCalibration({ onApply, sfx }) {
  const $ = (s) => document.querySelector(s);
  const modal = $('#cal-modal');
  const steps = {
    choose: $('#cal-choose'),
    import: $('#cal-import'),
    auto: $('#cal-auto'),
    result: $('#cal-result'),
  };
  const capture = $('#cal-capture');
  const captureMsg = $('#cal-capture-msg');
  const feedback = $('#cal-feedback');

  let samples = [];        // |net dx| per accepted flick
  let burst = null;        // { sumX, absX, peak, intervals, lastT }
  let idleTimer = null;
  let lockActive = false;
  let warnings = new Set();
  let pollingHz = 0;
  let resultSens = null;
  let resultCounts = null;

  // ---------- step plumbing ----------

  function show(step) {
    Object.entries(steps).forEach(([k, el]) => el.classList.toggle('hidden', k !== step));
  }

  function open(step = 'choose') {
    modal.classList.remove('hidden');
    if (step === 'auto') resetAuto();
    show(step);
  }

  function close(applied) {
    modal.classList.add('hidden');
    stopCapture();
    // Any exit from the wizard counts as onboarded — it never nags again.
    if (!applied) onApply({});
  }

  function resetAuto() {
    samples = [];
    burst = null;
    warnings = new Set();
    pollingHz = 0;
    updateDots();
    feedback.textContent = 'Waiting for flick 1 of 3…';
    captureMsg.classList.remove('hidden');
    capture.classList.remove('locked');
  }

  function updateDots() {
    modal.querySelectorAll('.cal-dot').forEach((d, i) =>
      d.classList.toggle('done', i < samples.length)
    );
  }

  // ---------- pointer lock capture ----------

  function requestLock() {
    try {
      const p = capture.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          warnings.add('accel');
          try { capture.requestPointerLock(); } catch {}
        });
      }
    } catch {
      // older API shape: no options / no promise
      warnings.add('accel');
      try { capture.requestPointerLock(); } catch {}
    }
  }

  function stopCapture() {
    if (document.pointerLockElement === capture) document.exitPointerLock();
    lockActive = false;
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
  }

  capture.addEventListener('click', () => {
    if (!lockActive) requestLock();
  });

  document.addEventListener('pointerlockchange', () => {
    const wasActive = lockActive;
    lockActive = document.pointerLockElement === capture;
    capture.classList.toggle('locked', lockActive);
    if (lockActive) {
      captureMsg.innerHTML = 'Mouse locked — do a natural <b>180° flick</b>. (Esc to release)';
      if (!idleTimer) idleTimer = setInterval(checkIdle, 60);
    } else if (wasActive && samples.length < 3 && !steps.auto.classList.contains('hidden')) {
      captureMsg.innerHTML = '<b>Click here</b> to resume calibration.';
      if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!lockActive || steps.auto.classList.contains('hidden')) return;
    handleMove(e.movementX, performance.now());
  });

  function handleMove(dx, now) {
    if (!burst) {
      burst = { sumX: 0, absX: 0, peak: 0, intervals: [], lastT: now };
    } else {
      const gap = now - burst.lastT;
      if (gap > BURST_GAP_MS) { endBurst(); burst = { sumX: 0, absX: 0, peak: 0, intervals: [], lastT: now }; }
      else if (gap > 0 && gap < 30) burst.intervals.push(gap);
      burst.lastT = now;
    }
    burst.sumX += dx;
    burst.absX += Math.abs(dx);
    burst.peak = Math.max(burst.peak, Math.abs(dx));
  }

  function checkIdle() {
    if (burst && performance.now() - burst.lastT > BURST_GAP_MS) endBurst();
  }

  function endBurst() {
    if (!burst) return;
    const b = burst;
    burst = null;
    const counts = Math.abs(b.sumX);
    if (counts >= MIN_FLICK_COUNTS) {
      samples.push(counts);
      if (b.peak < TRACKPAD_PEAK) warnings.add('trackpad');
      if (b.intervals.length >= 4) {
        const sorted = [...b.intervals].sort((x, y) => x - y);
        const med = sorted[Math.floor(sorted.length / 2)];
        if (med > 0) pollingHz = Math.round(1000 / med);
      }
      updateDots();
      sfx && sfx.tick();
      if (samples.length >= 3) {
        finishAuto();
      } else {
        feedback.textContent = `Flick ${samples.length} captured (${Math.round(counts)} counts) — ${3 - samples.length} to go`;
      }
    } else if (b.absX > SMALL_BURST_COUNTS) {
      feedback.textContent = 'A bit small — make one full, fast, natural flick';
    }
  }

  // ---------- result ----------

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function finishAuto() {
    stopCapture();
    resultCounts = median(samples);
    const degPerCount = 180 / resultCounts;
    resultSens = Math.min(15, Math.max(0.05, +(degPerCount / BASE_DEG_PER_COUNT).toFixed(2)));

    $('#cal-result-sens').textContent = resultSens;
    $('#cal-result-info').textContent =
      `Your natural flick measured ~${Math.round(resultCounts)} counts, so we set sensitivity so that ` +
      `exact motion turns you 180°.` +
      (pollingHz ? ` Mouse polling ≈ ${pollingHz >= 900 ? '1000' : pollingHz >= 400 ? '500' : pollingHz >= 200 ? '250' : '125'} Hz.` : '');
    renderResultCm();
    renderWarnings();
    show('result');
    sfx && sfx.go();
  }

  function renderResultCm() {
    const dpi = parseInt($('#cal-dpi').value) || 800;
    $('#cal-result-cm').textContent =
      `≈ ${cm360(resultSens, dpi).toFixed(1)} cm per 360° at ${dpi} DPI`;
  }

  function renderWarnings() {
    const texts = {
      trackpad: '🖱️ That input looks like a trackpad. Calibration was applied, but for real aim training an external mouse is strongly recommended.',
      accel: '⚠️ Raw input isn\'t available in this browser, so OS pointer acceleration may affect your aim. On Windows, disable "Enhance pointer precision" for consistent results.',
    };
    $('#cal-warnings').innerHTML = [...warnings]
      .map((w) => `<div class="cal-warning">${texts[w]}</div>`)
      .join('');
  }

  // ---------- wiring ----------

  $('#cal-opt-auto').addEventListener('click', () => { resetAuto(); show('auto'); });
  $('#cal-opt-import').addEventListener('click', () => show('import'));
  $('#cal-opt-skip').addEventListener('click', () => close(false));
  modal.querySelectorAll('.cal-back').forEach((b) =>
    b.addEventListener('click', () => { stopCapture(); show('choose'); })
  );

  $('#cal-import-apply').addEventListener('click', () => {
    const gameSens = parseFloat($('#cal-game-sens').value);
    if (!gameSens || gameSens <= 0) return;
    const degPerCount = parseFloat($('#cal-game').value) * gameSens;
    const sens = Math.min(15, Math.max(0.05, +(degPerCount / BASE_DEG_PER_COUNT).toFixed(2)));
    const dpi = parseInt($('#cal-import-dpi').value) || null;
    onApply({ sens, dpi });
    close(true);
  });

  $('#cal-dpi').addEventListener('input', renderResultCm);
  $('#cal-accept').addEventListener('click', () => {
    onApply({ sens: resultSens, dpi: parseInt($('#cal-dpi').value) || null });
    close(true);
  });
  $('#cal-redo').addEventListener('click', () => { resetAuto(); show('auto'); });

  return {
    open,
    // dev-only test hook: feed synthetic movement without real pointer lock
    _test: { handleMove, endBurst, get samples() { return samples; }, get resultSens() { return resultSens; }, forceActive() { lockActive = true; } },
  };
}
