// Scene / render tuning — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const config = {
  waves: {
    spatialScale: 7.85,
    ampScale: 0.4,
    // Gerstner components (4-wave sum).
    // - dirX/dirZ: travel direction (normalized at runtime)
    // - wavelength: in scaled-space units (x/spatialScale, z/spatialScale)
    // - speed: angular phase speed (radians/sec)
    // - amp: base amplitude (scaled by spatialScale * ampScale in main.js)
    // - steepness: choppiness (0–~1), clamped for stability
    wave1: { dirX:  1.0, dirZ:  0.2, wavelength: 3.2, speed: 1.25, amp: 0.22, steepness: 0.35 },
    wave2: { dirX: -0.4, dirZ:  1.0, wavelength: 2.1, speed: 0.90, amp: 0.42, steepness: 0.28 },
    wave3: { dirX:  0.9, dirZ:  0.9, wavelength: 4.4, speed: 1.55, amp: 0.30, steepness: 0.22 },
    wave4: { dirX:  1.0, dirZ: -0.6, wavelength: 1.5, speed: 2.05, amp: 0.16, steepness: 0.18 },
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

  boat: {
    maxSpeed: 14,
    accel: 10,
    drag: 2.2,
    turnSpeed: 2.4,
  },

  combat: {
    muzzleSpeed: 45,
    launchAngleDeg: 18,
    trajectoryRibbonWidth: 3.5,
    gravity: 15,
    volleyStagger: 0.07,
    cooldown: 0.65,
    powerMin: 0.4,
    powerMax: 1,
    maxChargeTime: 1.15,
    rangeAtMinPower: 70,
    rangeAtMaxPower: 220,
    trajectoryPreviewMuzzleIndex: 1,
    trajectoryPreviewStarboardMuzzleIndex: 1,
    trajectorySampleDt: 0.01667,
    trajectoryMaxSteps: 420,
  },
};

export default config;
