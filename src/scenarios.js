import * as THREE from 'three';

// ============================== Ranks ==============================

export const RANKS = [
  { name: 'Iron', color: '#9aa0a8' },
  { name: 'Bronze', color: '#cd7f32' },
  { name: 'Silver', color: '#c8cfd9' },
  { name: 'Gold', color: '#f5c542' },
  { name: 'Platinum', color: '#4fd1c5' },
  { name: 'Diamond', color: '#7aa2ff' },
  { name: 'Master', color: '#c084fc' },
  { name: 'Grandmaster', color: '#ff5c5c' },
];

// benchmarks: ascending score thresholds, one per rank.
export function rankFor(score, benchmarks) {
  if (!benchmarks || !benchmarks.length) return null;
  let idx = -1;
  for (let i = 0; i < benchmarks.length; i++) {
    if (score >= benchmarks[i]) idx = i;
  }
  if (idx === -1) {
    return {
      name: 'Unranked', color: '#6b7280',
      index: -1,
      progress: { from: 0, to: benchmarks[0], pct: Math.max(0, Math.min(1, score / benchmarks[0])) },
      nextName: RANKS[0].name,
    };
  }
  const rank = RANKS[idx];
  const next = idx + 1 < benchmarks.length ? benchmarks[idx + 1] : null;
  return {
    name: rank.name, color: rank.color, index: idx,
    progress: next
      ? { from: benchmarks[idx], to: next, pct: (score - benchmarks[idx]) / (next - benchmarks[idx]) }
      : { from: benchmarks[idx], to: benchmarks[idx], pct: 1 },
    nextName: next ? RANKS[idx + 1].name : null,
  };
}

// ============================== Target ==============================

class Target {
  constructor(scene, { shape = 'sphere', radius = 0.8, color = 0x2dd4bf, hp = 1 }) {
    this.scene = scene;
    this.radius = radius;
    this.shape = shape;
    this.hp = hp;
    this.maxHp = hp;
    this.velocity = new THREE.Vector3();
    this.spawnedAt = 0;
    this.cell = -1;

    const geo = shape === 'tile'
      ? new THREE.BoxGeometry(radius * 2, radius * 2, 0.12)
      : new THREE.SphereGeometry(radius, 26, 18);
    const c = new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.35,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.target = this;
    scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  setGlow(on) {
    this.mesh.material.emissiveIntensity = on ? 0.9 : 0.35;
  }

  damageFlash() {
    this.mesh.material.emissiveIntensity = 1.2;
    setTimeout(() => { if (this.mesh.material) this.mesh.material.emissiveIntensity = 0.35; }, 60);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ============================== Base scenario ==============================

export class ScenarioBase {
  constructor(engine, sfx, def, settings) {
    this.engine = engine;
    this.sfx = sfx;
    this.def = def;
    this.p = def.params || {};
    this.settings = settings;
    this.targetColor = new THREE.Color(settings.targetColor);

    this.targets = [];
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.elapsed = 0;
  }

  get meshes() { return this.targets.map((t) => t.mesh); }
  get region() {
    const { width = 14, height = 5, distance = 20, yCenter = 2.9 } = this.p;
    return { w: width, h: height, dist: distance, yc: yCenter };
  }

  randomPos(avoid = [], minGapFactor = 2.2) {
    const r = this.region;
    const radius = this.p.radius ?? 0.8;
    for (let tries = 0; tries < 40; tries++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * r.w,
        r.yc + (Math.random() - 0.5) * r.h,
        -r.dist
      );
      pos.y = Math.max(pos.y, radius + 0.3);
      let ok = true;
      for (const a of avoid) {
        if (a && pos.distanceTo(a) < radius * minGapFactor) { ok = false; break; }
      }
      if (ok) return pos;
    }
    return new THREE.Vector3((Math.random() - 0.5) * r.w, r.yc, -r.dist);
  }

  addTarget(pos, opts = {}) {
    const t = new Target(this.engine.scene, {
      shape: this.p.shape || 'sphere',
      radius: this.p.radius ?? 0.8,
      color: this.targetColor,
      hp: this.p.killHits ?? 1,
      ...opts,
    });
    t.position.copy(pos);
    t.spawnedAt = this.elapsed;
    this.targets.push(t);
    return t;
  }

  removeTarget(t, killed) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
    if (killed) this.engine.spawnKillEffect(t.position, this.targetColor);
    t.dispose();
  }

  accuracy() { return this.shots > 0 ? this.hits / this.shots : 1; }

  hudAccLabel() { return 'ACC'; }
  hudAccValue() { return Math.round(this.accuracy() * 100) + '%'; }

  start() {}
  update(dt) {}
  onTriggerDown() {}
  end() {
    for (const t of [...this.targets]) t.dispose();
    this.targets = [];
  }

  baseResult() {
    return {
      score: Math.max(0, Math.round(this.score)),
      accuracy: this.accuracy(),
      hits: this.hits,
      misses: this.shots - this.hits,
      shots: this.shots,
      kills: this.kills,
    };
  }

  resultStats() {
    const r = this.baseResult();
    return [
      { label: 'Accuracy', value: Math.round(r.accuracy * 100) + '%' },
      { label: 'Kills', value: r.kills },
      { label: 'Hits', value: r.hits },
      { label: 'Misses', value: r.misses },
      { label: 'Kills/sec', value: (r.kills / Math.max(1, this.elapsed)).toFixed(2) },
    ];
  }

  resultMeta() { return {}; }
}

// ============================== Clicking ==============================

class ClickScenario extends ScenarioBase {
  start() {
    const count = this.p.count ?? 3;
    if (this.p.grid) this.initGrid();
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  initGrid() {
    const { rows = 4, cols = 4, cellSize = 1.6 } = this.p.grid;
    const r = this.region;
    this.cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.cells.push(new THREE.Vector3(
          (x - (cols - 1) / 2) * cellSize,
          r.yc + ((rows - 1) / 2 - y) * cellSize,
          -r.dist
        ));
      }
    }
  }

  spawnOne() {
    if (this.cells) {
      const used = new Set(this.targets.map((t) => t.cell));
      const free = this.cells.map((_, i) => i).filter((i) => !used.has(i));
      const cell = free[Math.floor(Math.random() * free.length)];
      const t = this.addTarget(this.cells[cell]);
      t.cell = cell;
      return t;
    }
    const avoid = this.targets.map((t) => t.position);
    const t = this.addTarget(this.randomPos(avoid));
    if (this.p.moveSpeed) {
      const ang = Math.random() * Math.PI * 2;
      t.velocity.set(Math.cos(ang) * this.p.moveSpeed, Math.sin(ang) * this.p.moveSpeed * 0.5, 0);
    }
    return t;
  }

  update(dt) {
    if (!this.p.moveSpeed) return;
    const r = this.region;
    for (const t of this.targets) {
      t.position.addScaledVector(t.velocity, dt);
      const xLim = r.w / 2, yMin = Math.max(0.6, r.yc - r.h / 2), yMax = r.yc + r.h / 2;
      if (t.position.x > xLim) { t.position.x = xLim; t.velocity.x *= -1; }
      if (t.position.x < -xLim) { t.position.x = -xLim; t.velocity.x *= -1; }
      if (t.position.y > yMax) { t.position.y = yMax; t.velocity.y *= -1; }
      if (t.position.y < yMin) { t.position.y = yMin; t.velocity.y *= -1; }
    }
  }

  onTriggerDown() {
    this.shots++;
    const hit = this.engine.raycast(this.meshes);
    if (hit) {
      this.hits++;
      const t = hit.object.userData.target;
      t.hp--;
      if (t.hp <= 0) {
        this.kills++;
        this.score += this.p.pointsPerKill ?? 100;
        this.sfx.kill();
        this.removeTarget(t, true);
        this.spawnOne();
      } else {
        this.score += 25;
        t.damageFlash();
        this.sfx.hit();
      }
    } else {
      this.score -= this.p.missPenalty ?? 25;
      this.sfx.miss();
    }
  }
}

// Spidershot-style: one target alternating between center and a random position.
class AlternatingClickScenario extends ClickScenario {
  start() {
    this.atCenter = true;
    this.spawnOne();
  }
  spawnOne() {
    const r = this.region;
    const pos = this.atCenter
      ? new THREE.Vector3(0, r.yc, -r.dist)
      : this.randomPos([new THREE.Vector3(0, r.yc, -r.dist)], 4);
    this.atCenter = !this.atCenter;
    return this.addTarget(pos);
  }
}

// ============================== Flicking ==============================

class FlickScenario extends ScenarioBase {
  start() {
    this.respawnTimer = 0;
    this.ttks = [];
    this.spawn();
  }
  spawn() {
    const t = this.addTarget(this.randomPos(this.lastKillPos ? [this.lastKillPos] : [], 5));
    t.spawnedAt = this.elapsed;
  }
  update(dt) {
    if (this.targets.length === 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawn();
    }
  }
  onTriggerDown() {
    this.shots++;
    const hit = this.engine.raycast(this.meshes);
    if (hit) {
      this.hits++;
      this.kills++;
      const t = hit.object.userData.target;
      const ttkMs = (this.elapsed - t.spawnedAt) * 1000;
      this.ttks.push(ttkMs);
      this.score += Math.round(Math.min(350, Math.max(60, 350 - ttkMs * 0.5)));
      this.lastKillPos = t.position.clone();
      this.sfx.kill();
      this.removeTarget(t, true);
      this.respawnTimer = 0.15;
    } else {
      this.score -= this.p.missPenalty ?? 15;
      this.sfx.miss();
    }
  }
  avgTtk() {
    return this.ttks.length ? this.ttks.reduce((a, b) => a + b, 0) / this.ttks.length : 0;
  }
  resultStats() {
    return [
      { label: 'Accuracy', value: Math.round(this.accuracy() * 100) + '%' },
      { label: 'Kills', value: this.kills },
      { label: 'Avg flick time', value: Math.round(this.avgTtk()) + ' ms' },
      { label: 'Misses', value: this.shots - this.hits },
    ];
  }
  resultMeta() { return { avgTtkMs: Math.round(this.avgTtk()) }; }
}

// ============================== Tracking ==============================

class TrackScenario extends ScenarioBase {
  start() {
    this.onTime = 0;
    this.heldTime = 0;
    this.changeTimer = 0;
    const r = this.region;
    this.bot = this.addTarget(new THREE.Vector3(0, r.yc, -r.dist));
    this.pickVelocity();
  }

  pickVelocity() {
    const speed = (this.p.moveSpeed ?? 7) * (0.7 + Math.random() * 0.6);
    if (this.p.air) {
      const ang = Math.random() * Math.PI * 2;
      const vy = (Math.random() - 0.5) * speed * 0.8;
      this.bot.velocity.set(Math.cos(ang) * speed, vy, 0);
    } else {
      const dir = this.bot.velocity.x >= 0 ? -1 : 1; // strafe: flip direction
      this.bot.velocity.set(dir * speed, 0, 0);
    }
    this.changeTimer = 0.3 + Math.random() * (this.p.air ? 0.9 : 0.6);
  }

  update(dt) {
    const r = this.region;
    const b = this.bot;
    this.changeTimer -= dt;
    if (this.changeTimer <= 0) this.pickVelocity();

    b.position.addScaledVector(b.velocity, dt);
    const xLim = r.w / 2;
    const yMin = Math.max(b.radius + 0.3, r.yc - r.h / 2);
    const yMax = r.yc + r.h / 2;
    if (b.position.x > xLim) { b.position.x = xLim; b.velocity.x = -Math.abs(b.velocity.x); }
    if (b.position.x < -xLim) { b.position.x = -xLim; b.velocity.x = Math.abs(b.velocity.x); }
    if (b.position.y > yMax) { b.position.y = yMax; b.velocity.y = -Math.abs(b.velocity.y); }
    if (b.position.y < yMin) { b.position.y = yMin; b.velocity.y = Math.abs(b.velocity.y); }

    if (this.engine.shooting) {
      this.heldTime += dt;
      const hit = this.engine.raycast(this.meshes);
      if (hit) {
        this.onTime += dt;
        this.score += dt * 100;
        b.setGlow(true);
      } else {
        b.setGlow(false);
      }
    } else {
      b.setGlow(false);
    }
  }

  hudAccLabel() { return 'ON TARGET'; }
  hudAccValue() {
    const pct = this.elapsed > 0 ? (this.onTime / this.elapsed) * 100 : 0;
    return Math.round(pct) + '%';
  }
  accuracy() { return this.elapsed > 0 ? this.onTime / this.elapsed : 0; }

  resultStats() {
    return [
      { label: 'Time on target', value: this.onTime.toFixed(1) + ' s' },
      { label: 'On target', value: Math.round(this.accuracy() * 100) + '%' },
      { label: 'Fire held', value: this.heldTime.toFixed(1) + ' s' },
    ];
  }
  resultMeta() { return { timeOnTarget: +this.onTime.toFixed(2) }; }
  baseResult() {
    return {
      score: Math.max(0, Math.round(this.score)),
      accuracy: this.accuracy(),
      hits: 0, misses: 0, shots: 0, kills: 0,
    };
  }
}

// ============================== Reaction ==============================

class ReactionScenario extends ScenarioBase {
  start() {
    this.state = 'waiting';
    this.stateTimer = this.nextDelay();
    this.times = [];
    this.spawnAt = 0;
  }
  nextDelay() { return 0.6 + Math.random() * 1.4; }

  update(dt) {
    this.stateTimer -= dt;
    if (this.state === 'waiting' && this.stateTimer <= 0) {
      const r = this.region;
      this.addTarget(new THREE.Vector3(
        (Math.random() - 0.5) * r.w,
        r.yc + (Math.random() - 0.5) * r.h,
        -r.dist
      ));
      this.spawnAt = this.elapsed;
      this.state = 'active';
    } else if (this.state === 'gap' && this.stateTimer <= 0) {
      this.state = 'waiting';
      this.stateTimer = this.nextDelay();
    }
  }

  onTriggerDown() {
    this.shots++;
    if (this.state !== 'active') {
      // fired early — small penalty
      this.score -= 10;
      this.sfx.miss();
      return;
    }
    const hit = this.engine.raycast(this.meshes);
    if (hit) {
      this.hits++;
      this.kills++;
      const ms = (this.elapsed - this.spawnAt) * 1000;
      this.times.push(ms);
      this.score += Math.round(Math.min(350, Math.max(50, ms <= 150 ? 350 : 350 - (ms - 150) * 0.5)));
      this.sfx.kill();
      this.removeTarget(hit.object.userData.target, true);
      this.state = 'gap';
      this.stateTimer = 0.35;
    } else {
      this.score -= 15;
      this.sfx.miss();
    }
  }

  avgMs() { return this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0; }
  bestMs() { return this.times.length ? Math.min(...this.times) : 0; }

  hudAccLabel() { return 'AVG REACT'; }
  hudAccValue() { return this.times.length ? Math.round(this.avgMs()) + 'ms' : '—'; }

  resultStats() {
    return [
      { label: 'Avg reaction', value: Math.round(this.avgMs()) + ' ms' },
      { label: 'Best reaction', value: Math.round(this.bestMs()) + ' ms' },
      { label: 'Targets hit', value: this.kills },
      { label: 'Accuracy', value: Math.round(this.accuracy() * 100) + '%' },
    ];
  }
  resultMeta() { return { avgReactionMs: Math.round(this.avgMs()), bestReactionMs: Math.round(this.bestMs()) }; }
}

// ============================== Registry ==============================

const MODES = {
  click: ClickScenario,
  alternating: AlternatingClickScenario,
  flick: FlickScenario,
  track: TrackScenario,
  reaction: ReactionScenario,
};

export const SCENARIOS = [
  {
    id: 'gridshot', name: 'Gridshot', cat: 'Clicking', duration: 60,
    desc: 'Three floating orbs at all times. Kill one, another spawns. The classic speed-clicking warmup.',
    mode: 'click',
    params: { count: 3, radius: 0.9, width: 14, height: 5, yCenter: 2.9, distance: 20 },
    benchmarks: [3000, 6000, 9000, 12000, 15000, 18000, 21000, 24000],
  },
  {
    id: 'tilefrenzy', name: 'Tile Frenzy', cat: 'Clicking', duration: 60,
    desc: 'A wall of tiles — three light up at a time. Pure click speed on a fixed grid.',
    mode: 'click',
    params: { count: 3, radius: 0.72, shape: 'tile', width: 8, height: 8, yCenter: 3.2, distance: 18, grid: { rows: 4, cols: 4, cellSize: 1.65 } },
    benchmarks: [4000, 7000, 10000, 13000, 16000, 19000, 22000, 25000],
  },
  {
    id: 'sixshot', name: 'Sixshot', cat: 'Clicking', duration: 60,
    desc: 'Six small static targets on screen at once. Clear them fast, keep your accuracy up.',
    mode: 'click',
    params: { count: 6, radius: 0.45, width: 10, height: 4.5, yCenter: 2.9, distance: 20 },
    benchmarks: [2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000],
  },
  {
    id: 'microshot', name: 'Microshot', cat: 'Clicking', duration: 60,
    desc: 'Tiny targets in a tight area. Precision over speed — every miss costs you.',
    mode: 'click',
    params: { count: 3, radius: 0.33, width: 8, height: 3.5, yCenter: 2.9, distance: 20, missPenalty: 40 },
    benchmarks: [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000],
  },
  {
    id: 'spidershot', name: 'Spidershot', cat: 'Clicking', duration: 60,
    desc: 'One target alternating between center and a random position. Train recentering flicks.',
    mode: 'alternating',
    params: { radius: 0.55, width: 12, height: 5, yCenter: 2.9, distance: 20 },
    benchmarks: [1500, 3000, 4500, 6000, 7500, 9000, 10500, 12000],
  },
  {
    id: 'motionstrike', name: 'Motion Strike', cat: 'Clicking', duration: 60,
    desc: 'Two targets drifting and bouncing around the arena. Click moving targets under pressure.',
    mode: 'click',
    params: { count: 2, radius: 0.7, width: 14, height: 4, yCenter: 2.9, distance: 20, moveSpeed: 6 },
    benchmarks: [1500, 3000, 4500, 6000, 7500, 9000, 10500, 12000],
  },
  {
    id: 'flickshot', name: 'Flickshot', cat: 'Flicking', duration: 60,
    desc: 'One target at a time, far from your crosshair. Scored on how fast you flick and kill.',
    mode: 'flick',
    params: { radius: 0.6, width: 16, height: 5, yCenter: 2.9, distance: 18 },
    benchmarks: [2000, 4000, 6000, 8000, 10000, 12000, 13500, 15000],
  },
  {
    id: 'strafetrack', name: 'Strafe Track', cat: 'Tracking', duration: 60,
    desc: 'A bot strafing left and right with sudden direction changes. Hold fire and stay glued to it.',
    mode: 'track',
    params: { radius: 0.8, width: 16, height: 0, yCenter: 2.6, distance: 16, moveSpeed: 8 },
    benchmarks: [1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400],
  },
  {
    id: 'airtrack', name: 'Air Track', cat: 'Tracking', duration: 60,
    desc: 'A target floating freely in 2D space — smooth pursuit in every direction.',
    mode: 'track',
    params: { radius: 0.9, width: 16, height: 6, yCenter: 3.2, distance: 18, moveSpeed: 6, air: true },
    benchmarks: [1000, 1600, 2200, 2800, 3400, 4000, 4600, 5200],
  },
  {
    id: 'reflexshot', name: 'Reflex Shot', cat: 'Reaction', duration: 60,
    desc: 'Nothing… nothing… TARGET. Hit it the instant it appears. Scored on reaction time.',
    mode: 'reaction',
    params: { radius: 0.55, width: 7, height: 3, yCenter: 2.9, distance: 18 },
    benchmarks: [2000, 3500, 5000, 6000, 7000, 8000, 8800, 9500],
  },
];

export const PLAYLISTS = [
  {
    id: 'daily-warmup',
    name: 'Daily Warmup',
    desc: '6 scenarios · ~6 min · clicking, flicking, tracking and reaction in one routine',
    ids: ['gridshot', 'spidershot', 'flickshot', 'strafetrack', 'microshot', 'reflexshot'],
  },
];

export function customToDef(c) {
  const modeMap = { click: 'click', moving: 'click', flick: 'flick', track: 'track' };
  return {
    id: c.id,
    name: c.name,
    cat: 'Custom',
    duration: c.duration,
    desc: `Custom ${c.mode} scenario — ${c.count}× size ${c.size} targets at distance ${c.distance}.`,
    mode: modeMap[c.mode] || 'click',
    custom: true,
    params: {
      count: c.count,
      radius: c.size,
      width: c.width,
      height: c.height,
      yCenter: Math.max(1.2, Math.min(6, 1.2 + c.height / 2)),
      distance: c.distance,
      moveSpeed: c.mode === 'moving' || c.mode === 'track' ? c.speed : 0,
      killHits: c.hits,
      air: c.mode === 'track' && c.height > 1,
    },
    benchmarks: null,
  };
}

export function createScenario(def, engine, sfx, settings) {
  const Cls = MODES[def.mode] || ClickScenario;
  return new Cls(engine, sfx, def, settings);
}
