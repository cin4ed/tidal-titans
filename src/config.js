// Scene / render tuning — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const config = {
  waves: {
    spatialScale: 7.85,
    ampScale: 0.4,
    wave1: { freq: 0.5, speed: 1.2, amp: 0.2 },
    wave2: { freq: 0.7, speed: 0.8, amp: 0.4 },
    wave3: { freq: 0.3, speed: 1.5, amp: 0.3 },
    wave4: { freq: 1.5, speed: 2, amp: 0.15 },
  },

  water: {
    colorDeep:  '#0487e2',
    colorLight: '#74ccf4',
    waveVisualScale: 1,
    noiseSpeed: 0.8,
    worleyScale0: 3.45,
    worleyScale1: 0.4,
    refractionStrength: 0.183,
  },

  sky: {
    horizon: '#0487e2',
    zenith:  '#0066ff',
  },

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
    distanceInitial: 25.5,
    distanceMin:  5,
    distanceMax:  50,
    distanceStep: 1,
  },
};

export default config;
