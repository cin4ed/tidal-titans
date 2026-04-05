import { Pane } from 'tweakpane';

function serializeConfig(config) {
  const n = (v, d = 4) => Number(v.toFixed(d));
  const w = config.waves;
  const water = config.water;
  const depth = config.depth;
  const fog = config.fog;
  const sky = config.sky;
  const cam = config.camera;
  const cbt = config.combat;
  return `// Scene / render tuning — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const config = {
  waves: {
    spatialScale: ${n(w.spatialScale)},
    ampScale: ${n(w.ampScale)},
    wave1: { freq: ${n(w.wave1.freq)}, speed: ${n(w.wave1.speed)}, amp: ${n(w.wave1.amp)} },
    wave2: { freq: ${n(w.wave2.freq)}, speed: ${n(w.wave2.speed)}, amp: ${n(w.wave2.amp)} },
    wave3: { freq: ${n(w.wave3.freq)}, speed: ${n(w.wave3.speed)}, amp: ${n(w.wave3.amp)} },
    wave4: { freq: ${n(w.wave4.freq)}, speed: ${n(w.wave4.speed)}, amp: ${n(w.wave4.amp)} },
  },

  water: {
    colorDeep:  '${water.colorDeep}',
    colorLight: '${water.colorLight}',
    waveVisualScale: ${n(water.waveVisualScale)},
    noiseSpeed: ${n(water.noiseSpeed)},
    worleyScale0: ${n(water.worleyScale0)},
    worleyScale1: ${n(water.worleyScale1)},
    refractionStrength: ${n(water.refractionStrength)},
  },

  sky: {
    horizon: '${sky.horizon}',
    zenith:  '${sky.zenith}',
  },

  depth: {
    near: ${n(depth.near)},
    far:   ${n(depth.far)},
  },

  fog: {
    enabled: ${fog.enabled},
    near: ${n(fog.near, 1)},
    far:  ${n(fog.far, 1)},
  },

  camera: {
    distanceInitial: ${n(cam.distanceInitial, 2)},
    distanceMin:  ${n(cam.distanceMin, 1)},
    distanceMax:  ${n(cam.distanceMax, 1)},
    distanceStep: ${n(cam.distanceStep, 2)},
  },

  combat: {
    muzzleSpeed: ${n(cbt.muzzleSpeed, 2)},
    gravity: ${n(cbt.gravity, 2)},
    volleyStagger: ${n(cbt.volleyStagger, 4)},
    cooldown: ${n(cbt.cooldown, 3)},
    powerMin: ${n(cbt.powerMin, 3)},
    powerMax: ${n(cbt.powerMax, 3)},
    maxChargeTime: ${n(cbt.maxChargeTime, 3)},
    rangeAtMinPower: ${n(cbt.rangeAtMinPower, 1)},
    rangeAtMaxPower: ${n(cbt.rangeAtMaxPower, 1)},
    trajectoryPreviewMuzzleIndex: ${Math.round(cbt.trajectoryPreviewMuzzleIndex)},
    trajectorySampleDt: ${n(cbt.trajectorySampleDt, 5)},
    trajectoryMaxSteps: ${Math.round(cbt.trajectoryMaxSteps)},
  },
};

export default config;
`;
}

export function mountDevPanel(config, options = {}) {
  const { onCameraInitialZoomChange } = options;
  const pane = new Pane({ title: 'Scene', expanded: false });

  // ——— Boat wave physics ———
  const wavesFolder = pane.addFolder({ title: 'Boat Wave Physics', expanded: false });
  wavesFolder.addBinding(config.waves, 'spatialScale', {
    label: 'Spatial scale',
    min: 0.25,
    max: 8,
    step: 0.05,
  });
  wavesFolder.addBinding(config.waves, 'ampScale', {
    label: 'All layers amp',
    min: 0,
    max: 4,
    step: 0.02,
  });
  [1, 2, 3, 4].forEach((i) => {
    const key = `wave${i}`;
    const wf = wavesFolder.addFolder({ title: `Layer ${i}`, expanded: false });
    wf.addBinding(config.waves[key], 'freq',  { label: 'freq',  min: 0.0, max: 3.0, step: 0.01 });
    wf.addBinding(config.waves[key], 'speed', { label: 'speed', min: 0.0, max: 5.0, step: 0.01 });
    wf.addBinding(config.waves[key], 'amp',   { label: 'amp',   min: 0.0, max: 2.0, step: 0.01 });
  });

  // ——— Water appearance ———
  const waterFolder = pane.addFolder({ title: 'Water Appearance', expanded: true });
  waterFolder.addBinding(config.water, 'colorDeep',  { label: 'Deep color',  view: 'color' });
  waterFolder.addBinding(config.water, 'colorLight', { label: 'Light color', view: 'color' });
  waterFolder.addBinding(config.water, 'waveVisualScale', {
    label: 'Wave height',
    min: 0.0, max: 2.0, step: 0.01,
  });
  waterFolder.addBinding(config.water, 'noiseSpeed', {
    label: 'Noise speed',
    min: 0.0, max: 3.0, step: 0.01,
  });
  waterFolder.addBinding(config.water, 'worleyScale0', {
    label: 'Worley scale 0',
    min: 0.1, max: 16, step: 0.05,
  });
  waterFolder.addBinding(config.water, 'worleyScale1', {
    label: 'Worley scale 1',
    min: 0.1, max: 16, step: 0.05,
  });
  waterFolder.addBinding(config.water, 'refractionStrength', {
    label: 'Refraction',
    min: 0.0, max: 0.3, step: 0.001,
  });

  // ——— Sky ———
  const skyFolder = pane.addFolder({ title: 'Sky', expanded: false });
  skyFolder.addBinding(config.sky, 'horizon', { label: 'Horizon', view: 'color' });
  skyFolder.addBinding(config.sky, 'zenith', { label: 'Zenith', view: 'color' });

  // ——— Depth effect ———
  const depthFolder = pane.addFolder({ title: 'Depth Effect', expanded: false });
  depthFolder.addBinding(config.depth, 'near', { label: 'near', min: -0.01, max: 0.0, step: 0.0001 });
  depthFolder.addBinding(config.depth, 'far',  { label: 'far',  min: 0.01,  max: 0.2, step: 0.001  });

  // ——— Fog ———
  const fogFolder = pane.addFolder({ title: 'Fog', expanded: false });
  fogFolder.addBinding(config.fog, 'enabled', { label: 'Enabled' });
  fogFolder.addBinding(config.fog, 'near', { label: 'near', min: 1,  max: 50,  step: 1 });
  fogFolder.addBinding(config.fog, 'far',  { label: 'far',  min: 10, max: 200, step: 1 });

  // ——— Camera / Orbit ———
  const cameraFolder = pane.addFolder({ title: 'Camera / Orbit', expanded: false });
  const initialZoomBinding = cameraFolder.addBinding(config.camera, 'distanceInitial', {
    label: 'Initial zoom',
    min: 1, max: 120, step: 0.5,
  });
  if (onCameraInitialZoomChange) {
    initialZoomBinding.on('change', () => {
      onCameraInitialZoomChange(config.camera.distanceInitial);
    });
  }
  cameraFolder.addBinding(config.camera, 'distanceMin', {
    label: 'Zoom min',
    min: 1, max: 80, step: 0.5,
  });
  cameraFolder.addBinding(config.camera, 'distanceMax', {
    label: 'Zoom max',
    min: 5, max: 120, step: 0.5,
  });
  cameraFolder.addBinding(config.camera, 'distanceStep', {
    label: 'Step size',
    min: 0.25, max: 5, step: 0.25,
  });

  // ——— Combat / cannons ———
  const combatFolder = pane.addFolder({ title: 'Combat / Cannons', expanded: false });
  const cb = config.combat;
  combatFolder.addBinding(cb, 'muzzleSpeed', {
    label: 'Muzzle speed',
    min: 5,
    max: 120,
    step: 1,
  });
  combatFolder.addBinding(cb, 'gravity', {
    label: 'Ball gravity',
    min: 0,
    max: 40,
    step: 0.5,
  });
  combatFolder.addBinding(cb, 'volleyStagger', {
    label: 'Volley stagger',
    min: 0,
    max: 0.35,
    step: 0.01,
  });
  combatFolder.addBinding(cb, 'cooldown', {
    label: 'Cooldown (s)',
    min: 0.1,
    max: 3,
    step: 0.05,
  });
  combatFolder.addBinding(cb, 'powerMin', {
    label: 'Power min (tap)',
    min: 0.1,
    max: 1,
    step: 0.05,
  });
  combatFolder.addBinding(cb, 'powerMax', {
    label: 'Power max (full)',
    min: 0.5,
    max: 2,
    step: 0.05,
  });
  combatFolder.addBinding(cb, 'maxChargeTime', {
    label: 'Max charge (s)',
    min: 0.2,
    max: 3,
    step: 0.05,
  });
  combatFolder.addBinding(cb, 'rangeAtMinPower', {
    label: 'Range @ min power',
    min: 20,
    max: 200,
    step: 5,
  });
  combatFolder.addBinding(cb, 'rangeAtMaxPower', {
    label: 'Range @ max power',
    min: 50,
    max: 400,
    step: 10,
  });
  combatFolder.addBinding(cb, 'trajectoryPreviewMuzzleIndex', {
    label: 'Preview muzzle',
    min: 0,
    max: 2,
    step: 1,
  });
  combatFolder.addBinding(cb, 'trajectorySampleDt', {
    label: 'Preview Δt',
    min: 0.004,
    max: 0.05,
    step: 0.001,
  });
  combatFolder.addBinding(cb, 'trajectoryMaxSteps', {
    label: 'Preview max steps',
    min: 50,
    max: 800,
    step: 10,
  });

  // ——— Export config ———
  pane.addBlade({ view: 'separator' });
  const exportBtn = pane.addButton({ title: 'Export Config' });
  exportBtn.on('click', () => {
    const output = serializeConfig(config);
    navigator.clipboard.writeText(output).then(() => {
      exportBtn.title = 'Copied!';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2000);
    }).catch(() => {
      console.log('%c[config.js — paste into src/config.js]', 'font-weight:bold');
      console.log(output);
      exportBtn.title = 'See console';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2500);
    });
  });
}
