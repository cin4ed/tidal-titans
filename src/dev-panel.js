import { Pane } from 'tweakpane';

function serializeConfig(config) {
  const n = (v, d = 4) => Number(v.toFixed(d));
  const w = config.waves;
  const water = config.water;
  const depth = config.depth;
  const fog = config.fog;
  const cam = config.camera;
  return `// Scene / render tuning — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const config = {
  waves: {
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
};

export default config;
`;
}

export function mountDevPanel(config) {
  const pane = new Pane({ title: 'Scene', expanded: false });

  // ——— Boat wave physics ———
  const wavesFolder = pane.addFolder({ title: 'Boat Wave Physics', expanded: false });
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
  cameraFolder.addBinding(config.camera, 'distanceInitial', {
    label: 'Initial zoom',
    min: 1, max: 120, step: 0.5,
  });
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
