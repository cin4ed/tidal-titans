// Scene / render tuning — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const config = {
  // Wave layers used by JS physics for boat bobbing (waveHeight / waveNormal).
  // These are NOT visual — the water surface is rendered via TSL refraction.
  waves: {
    wave1: { freq: 0.5, speed: 1.2, amp: 0.2 },
    wave2: { freq: 0.7, speed: 0.8, amp: 0.4 },
    wave3: { freq: 0.3, speed: 1.5, amp: 0.3 },
    wave4: { freq: 1.5, speed: 2, amp: 0.15 },
  },

  water: {
    // Surface tint (hex) — Worley mix in TSL; keep scene fog in sync when retuning
    colorDeep:  '#0487e2',
    colorLight: '#74ccf4',
    // Visual wave displacement scale (1.0 = same amplitude as boat physics, 0 = flat)
    waveVisualScale: 1,
    // How fast the worley noise scrolls (controls wave animation speed)
    noiseSpeed: 0.8,
    // Worley noise spatial scale (higher = finer cells on the water)
    worleyScale0: 3.45,
    worleyScale1: 0.4,
    // Refraction distortion amount (0 = no distortion, 0.15 = strong)
    refractionStrength: 0.183,
  },

  // Depth range for the depth-blend effect (linear depth units)
  depth: {
    near: -0.0088,
    far:   0.01,
  },

  fog: {
    enabled: true,
    near: 1,
    far:  200,
  },

  camera: {
    distanceInitial: 12,
    distanceMin:  5,
    distanceMax:  50,
    distanceStep: 1,
  },
};

export default config;
