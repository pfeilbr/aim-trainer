// Data-driven theming. One object drives everything:
//   ui     → CSS custom properties (colors, corner radius, font)
//   arena  → the 3D room: sky/fog, walls, floor, grid, strip lights, lighting
//   targetColor → default target/kill-effect color for the theme
//   sfx    → which synthesized sound profile to use (see audio.js)

export const THEMES = [
  {
    id: 'forge', name: 'Forge', emoji: '🔥',
    desc: 'Industrial steel and ember orange — the AimForge standard.',
    ui: {
      accent: '#ff7a18', accentHover: '#ff9142', accent2: '#2dd4bf',
      bg: '#0c0f14', bg2: '#12161d', panel: '#171c25', panel2: '#1d232e',
      border: '#262e3b', text: '#e8ecf1', textDim: '#8b95a5',
      radius: '10px', font: null,
    },
    arena: {
      sky: '#11151c', wall: '#252d3a', back: '#1c222d', floor: '#1a202a',
      gridCenter: '#2a3342', grid: '#222a37', strip: '#ff7a18',
      hemiSky: '#cfdcee', hemiGround: '#39404c', hemiIntensity: 1.6,
      dirIntensity: 1.6, fogNear: 45, fogFar: 90,
    },
    targetColor: '#2dd4bf',
    sfx: 'forge',
  },
  {
    id: 'neon', name: 'Neon Vice', emoji: '🌆',
    desc: 'Synthwave nights — magenta lasers, cyan chrome, zap sounds.',
    ui: {
      accent: '#ff2ec4', accentHover: '#ff5cd3', accent2: '#22d3ee',
      bg: '#0a0616', bg2: '#110a24', panel: '#160e2e', panel2: '#1e1440',
      border: '#33205a', text: '#f2e9ff', textDim: '#9f8fc4',
      radius: '14px', font: null,
    },
    arena: {
      sky: '#0d0722', wall: '#1c1042', back: '#150b31', floor: '#100924',
      gridCenter: '#4a2a90', grid: '#2a1a55', strip: '#ff2ec4',
      hemiSky: '#b39aff', hemiGround: '#241645', hemiIntensity: 1.5,
      dirIntensity: 1.2, fogNear: 40, fogFar: 85,
    },
    targetColor: '#22d3ee',
    sfx: 'laser',
  },
  {
    id: 'arctic', name: 'Arctic', emoji: '❄️',
    desc: 'Bright glacial range — coral targets on ice, soft chimes.',
    ui: {
      accent: '#38bdf8', accentHover: '#67d1fb', accent2: '#f472b6',
      bg: '#0d141d', bg2: '#131c27', panel: '#182432', panel2: '#1f2d3d',
      border: '#2b3d51', text: '#eaf3fa', textDim: '#8fa5b8',
      radius: '10px', font: null,
    },
    arena: {
      sky: '#dfeaf2', wall: '#c2d4e2', back: '#afc4d6', floor: '#9fb6c9',
      gridCenter: '#8ba6bc', grid: '#a8bfd0', strip: '#38bdf8',
      hemiSky: '#ffffff', hemiGround: '#8899aa', hemiIntensity: 2.2,
      dirIntensity: 1.8, fogNear: 50, fogFar: 110,
    },
    targetColor: '#ff5c7a',
    sfx: 'soft',
  },
  {
    id: 'crimson', name: 'Crimson Ops', emoji: '🎯',
    desc: 'Blackout range, blood-red hostiles, punchy impacts. All business.',
    ui: {
      accent: '#ef4444', accentHover: '#f87171', accent2: '#f59e0b',
      bg: '#0d0808', bg2: '#140d0d', panel: '#1a1111', panel2: '#221616',
      border: '#3a2020', text: '#f5eaea', textDim: '#a08b8b',
      radius: '6px', font: null,
    },
    arena: {
      sky: '#0c0808', wall: '#1c1416', back: '#140e10', floor: '#120d0e',
      gridCenter: '#3a2226', grid: '#241618', strip: '#ef4444',
      hemiSky: '#d8c8c8', hemiGround: '#2a1c1c', hemiIntensity: 1.3,
      dirIntensity: 1.5, fogNear: 38, fogFar: 80,
    },
    targetColor: '#ff4757',
    sfx: 'punch',
  },
  {
    id: 'retro', name: 'Retro Terminal', emoji: '👾',
    desc: '8-bit phosphor arcade — square corners, mono font, bleeps included.',
    ui: {
      accent: '#22ff55', accentHover: '#6bff8f', accent2: '#ffe066',
      bg: '#040704', bg2: '#081008', panel: '#0a140a', panel2: '#0f1d0f',
      border: '#1d3a1d', text: '#d8ffdf', textDim: '#6faa78',
      radius: '2px', font: '"Menlo", "Consolas", "Courier New", monospace',
    },
    arena: {
      sky: '#050905', wall: '#0a140a', back: '#071007', floor: '#061006',
      gridCenter: '#2a6a2a', grid: '#143414', strip: '#22ff55',
      hemiSky: '#bfffcc', hemiGround: '#0a2a12', hemiIntensity: 1.5,
      dirIntensity: 1.2, fogNear: 42, fogFar: 95,
    },
    targetColor: '#ffcc00',
    sfx: 'chip',
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

const DEFAULT_FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const VAR_MAP = {
  accent: '--accent', accentHover: '--accent-hover', accent2: '--accent2',
  bg: '--bg', bg2: '--bg2', panel: '--panel', panel2: '--panel2',
  border: '--border', text: '--text', textDim: '--text-dim', radius: '--radius',
};

export function applyUITheme(theme) {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    root.setProperty(cssVar, theme.ui[key]);
  }
  root.setProperty('--font', theme.ui.font || DEFAULT_FONT);
}
