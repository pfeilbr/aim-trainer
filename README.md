# AimForge

A free, browser-based FPS aim trainer inspired by [KovaaK's](https://store.steampowered.com/app/824270/KovaaKs/). 100% client-side — no account, no server, no tracking. All progress and settings live in your browser's localStorage.

**Play it: https://pfeilbr.github.io/aim-trainer/**

## Features

- **10 built-in scenarios** across four categories:
  - *Clicking* — Gridshot, Tile Frenzy, Sixshot, Microshot, Spidershot, Motion Strike
  - *Flicking* — Flickshot (scored on flick speed)
  - *Tracking* — Strafe Track, Air Track (hold fire, stay on target)
  - *Reaction* — Reflex Shot (scored on reaction time)
- **Daily Warmup playlist** — a 6-scenario routine covering every skill
- **Benchmarks & ranks** — Iron → Grandmaster thresholds per scenario, with progress bars toward the next rank
- **Progress tracking** — score history charts, personal bests, per-scenario averages, recent runs, lifetime stats
- **Custom scenario editor** — build your own scenarios (mode, target count/size, spawn area, speed, hits-to-kill, duration)
- **Real sensitivity model** — CS/Apex-scale sensitivity (0.022°/count), cm/360 display, and importers for Valorant, Overwatch 2, Fortnite, and Quake sens
- **Crosshair editor** — style, color, size, gap, thickness, outline, with live preview
- **Customization** — FOV (horizontal), target color, run-duration override, synthesized hit sounds (WebAudio, no assets)
- **Data portability** — export/import all data as JSON

## Tech

- [Three.js](https://threejs.org/) for the 3D arena, pointer-lock mouse look, raycast hit detection
- [Vite](https://vitejs.dev/) for dev/build
- Vanilla JS + CSS — no UI framework
- localStorage for settings, run history, and custom scenarios

## Development

```bash
npm install
npm run dev     # dev server at http://localhost:5173
npm run build   # static build in dist/
```

Deployed to GitHub Pages automatically on push to `main` via GitHub Actions.
