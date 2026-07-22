import * as THREE from 'three';

// Sensitivity model: at sens 1 the camera turns 0.022° per mouse count (CS/Apex scale).
export const BASE_DEG_PER_COUNT = 0.022;

export function cm360(sens, dpi) {
  const degPerCount = BASE_DEG_PER_COUNT * sens;
  if (degPerCount <= 0 || dpi <= 0) return 0;
  return (360 / (degPerCount * dpi)) * 2.54;
}

// User-facing FOV is horizontal at 16:9; three.js wants vertical FOV.
function verticalFov(hDeg, aspect) {
  const h = THREE.MathUtils.degToRad(hDeg);
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  return THREE.MathUtils.radToDeg(v);
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11151c);
    this.scene.fog = new THREE.Fog(0x11151c, 45, 90);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;
    this.fovH = 103;

    this.sens = 1;
    this.pointerLocked = false;
    this.shooting = false;      // LMB currently held
    this.inputEnabled = false;  // only true while a run is live

    this.raycaster = new THREE.Raycaster();
    this.centerNDC = new THREE.Vector2(0, 0);

    // callbacks wired by game controller
    this.onTriggerDown = null;
    this.onPointerLockLost = null;

    this.effects = []; // transient kill-pop animations

    this.buildRoom();
    this.bindEvents();
    this.resize();
  }

  buildRoom() {
    const room = new THREE.Group();

    const W = 44, H = 12, D = 70; // gameplay space: player near z=+10, targets around z=-20..-30
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x252d3a, roughness: 0.95 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x1c222d, roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a202a, roughness: 1 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    room.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), backMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    room.add(ceil);

    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      room.add(m);
    };
    mkWall(W, H, 0, H / 2, -D / 2 + 10, 0);            // front wall (behind targets)
    mkWall(W, H, 0, H / 2, D / 2, Math.PI);            // back wall
    mkWall(D, H, -W / 2, H / 2, 0, Math.PI / 2);       // left
    mkWall(D, H, W / 2, H / 2, 0, -Math.PI / 2);       // right

    // floor grid
    const grid = new THREE.GridHelper(Math.max(W, D), 34, 0x2a3342, 0x222a37);
    grid.position.y = 0.01;
    room.add(grid);

    // subtle grid on the front wall for spatial reference
    const wallGrid = new THREE.GridHelper(W, 22, 0x2a3342, 0x232b38);
    wallGrid.rotation.x = Math.PI / 2;
    wallGrid.position.set(0, H / 2, -D / 2 + 10.05);
    wallGrid.scale.y = H / W;
    room.add(wallGrid);

    // accent strip lights along wall/floor edges
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xff7a18 });
    const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, D), stripMat);
    stripL.position.set(-W / 2 + 0.1, 0.08, 0);
    room.add(stripL);
    const stripR = stripL.clone();
    stripR.position.x = W / 2 - 0.1;
    room.add(stripR);

    this.scene.add(room);

    this.scene.add(new THREE.HemisphereLight(0xcfdcee, 0x39404c, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(6, 14, 8);
    this.scene.add(dir);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this.inputEnabled) {
        this.onPointerLockLost && this.onPointerLockLost();
      }
    });

    document.addEventListener('mousemove', (e) => {
      // Aim whenever a run is live; pointer lock is preferred but not required,
      // so the game stays playable where lock is unavailable (e.g. iframes).
      if (!this.inputEnabled) return;
      const radPerCount = THREE.MathUtils.degToRad(BASE_DEG_PER_COUNT * this.sens);
      this.yaw -= e.movementX * radPerCount;
      this.pitch -= e.movementY * radPerCount;
      const lim = THREE.MathUtils.degToRad(89);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -lim, lim);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.inputEnabled) return;
      this.shooting = true;
      this.onTriggerDown && this.onTriggerDown();
      if (!this.pointerLocked) this.requestLock();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shooting = false;
    });
  }

  requestLock() {
    if (this.pointerLocked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch {} });
    } catch {
      try { this.canvas.requestPointerLock(); } catch (e) { console.warn('pointer lock unavailable', e); }
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resetView() {
    this.yaw = 0;
    this.pitch = 0;
    this.camera.rotation.set(0, 0, 0);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return; // hidden/zero-size layout — keep last valid projection
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = verticalFov(this.fovH, Math.max(this.camera.aspect, 1e-3));
    this.camera.updateProjectionMatrix();
  }

  applySettings(settings) {
    this.sens = settings.sens;
    this.fovH = settings.fov;
    this.resize();
  }

  // Ray from screen center against the given meshes. Returns closest intersection or null.
  raycast(meshes) {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.centerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0] : null;
  }

  // Quick shrinking-ring effect at a kill position.
  spawnKillEffect(position, color) {
    const geo = new THREE.RingGeometry(0.25, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.lookAt(this.camera.position);
    this.scene.add(mesh);
    this.effects.push({ mesh, t: 0, dur: 0.22 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.t += dt;
      const k = fx.t / fx.dur;
      if (k >= 1) {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        fx.mesh.material.dispose();
        this.effects.splice(i, 1);
      } else {
        fx.mesh.scale.setScalar(1 + k * 2.2);
        fx.mesh.material.opacity = 0.9 * (1 - k);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
