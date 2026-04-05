// Ocean configuration — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const oceanConfig = {
  // Wave layers used by JS physics for boat bobbing (waveHeight / waveNormal).
  // These are NOT visual — the water surface is rendered via TSL refraction.
  wave1: { freq: 0.5,  speed: 1.2,  amp: 0.60 },
  wave2: { freq: 0.7,  speed: 0.8,  amp: 0.40 },
  wave3: { freq: 0.3,  speed: 1.5,  amp: 0.30 },
  wave4: { freq: 1.5,  speed: 2.0,  amp: 0.15 },

  // Water surface colors (hex)
  waterColorDeep:  '#0487e2',
  waterColorLight: '#74ccf4',

  // How fast the worley noise scrolls (controls wave animation speed)
  noiseSpeed: 0.8,

  // Worley noise spatial scale (world-space frequency). Higher = smaller / finer
  // cells on the water (more “caustic-like” detail); lower = larger blobs.
  worleyScale0: 4,
  worleyScale1: 2,

  // Refraction distortion amount (0 = no distortion, 0.15 = strong)
  refractionStrength: 0.1,

  // Depth range for the depth-blend effect
  depthNear: -0.002,
  depthFar:   0.04,

  // Fog
  fogNear: 7,
  fogFar:  25,
};

export default oceanConfig;
