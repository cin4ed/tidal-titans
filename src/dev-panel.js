import { Pane } from 'tweakpane';

function serializeConfig(config) {
  const n = (v, d = 4) => Number(v.toFixed(d));
  return `// Ocean configuration — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const oceanConfig = {
  // Wave layers used by JS physics for boat bobbing (waveHeight / waveNormal).
  // These are NOT visual — the water surface is rendered via TSL refraction.
  wave1: { freq: ${n(config.wave1.freq)}, speed: ${n(config.wave1.speed)}, amp: ${n(config.wave1.amp)} },
  wave2: { freq: ${n(config.wave2.freq)}, speed: ${n(config.wave2.speed)}, amp: ${n(config.wave2.amp)} },
  wave3: { freq: ${n(config.wave3.freq)}, speed: ${n(config.wave3.speed)}, amp: ${n(config.wave3.amp)} },
  wave4: { freq: ${n(config.wave4.freq)}, speed: ${n(config.wave4.speed)}, amp: ${n(config.wave4.amp)} },

  // Water surface colors (hex)
  waterColorDeep:  '${config.waterColorDeep}',
  waterColorLight: '${config.waterColorLight}',

  // Visual wave displacement scale (1.0 = same amplitude as boat physics, 0 = flat)
  waveVisualScale: ${n(config.waveVisualScale)},

  // How fast the worley noise scrolls (controls wave animation speed)
  noiseSpeed: ${n(config.noiseSpeed)},

  // Worley noise spatial scale (higher = finer cells on the water)
  worleyScale0: ${n(config.worleyScale0)},
  worleyScale1: ${n(config.worleyScale1)},

  // Refraction distortion amount (0 = no distortion, 0.15 = strong)
  refractionStrength: ${n(config.refractionStrength)},

  // Depth range for the depth-blend effect
  depthNear: ${n(config.depthNear)},
  depthFar:   ${n(config.depthFar)},

  // Fog
  fogNear: ${n(config.fogNear, 1)},
  fogFar:  ${n(config.fogFar, 1)},
};

export default oceanConfig;
`;
}

export function mountDevPanel(config) {
  const pane = new Pane({ title: 'Ocean Shader', expanded: false });

  // ——— Boat wave physics ———
  const wavesFolder = pane.addFolder({ title: 'Boat Wave Physics', expanded: false });
  [1, 2, 3, 4].forEach((i) => {
    const key = `wave${i}`;
    const wf = wavesFolder.addFolder({ title: `Layer ${i}`, expanded: false });
    wf.addBinding(config[key], 'freq',  { label: 'freq',  min: 0.0, max: 3.0, step: 0.01 });
    wf.addBinding(config[key], 'speed', { label: 'speed', min: 0.0, max: 5.0, step: 0.01 });
    wf.addBinding(config[key], 'amp',   { label: 'amp',   min: 0.0, max: 2.0, step: 0.01 });
  });

  // ——— Water appearance ———
  const waterFolder = pane.addFolder({ title: 'Water Appearance', expanded: true });
  waterFolder.addBinding(config, 'waterColorDeep',  { label: 'Deep color',  view: 'color' });
  waterFolder.addBinding(config, 'waterColorLight', { label: 'Light color', view: 'color' });
  waterFolder.addBinding(config, 'waveVisualScale', {
    label: 'Wave height',
    min: 0.0, max: 2.0, step: 0.01,
  });
  waterFolder.addBinding(config, 'noiseSpeed', {
    label: 'Noise speed',
    min: 0.0, max: 3.0, step: 0.01,
  });
  waterFolder.addBinding(config, 'worleyScale0', {
    label: 'Worley scale 0',
    min: 0.1, max: 16, step: 0.05,
  });
  waterFolder.addBinding(config, 'worleyScale1', {
    label: 'Worley scale 1',
    min: 0.1, max: 16, step: 0.05,
  });
  waterFolder.addBinding(config, 'refractionStrength', {
    label: 'Refraction',
    min: 0.0, max: 0.3, step: 0.001,
  });

  // ——— Depth effect ———
  const depthFolder = pane.addFolder({ title: 'Depth Effect', expanded: false });
  depthFolder.addBinding(config, 'depthNear', { label: 'near', min: -0.01, max: 0.0, step: 0.0001 });
  depthFolder.addBinding(config, 'depthFar',  { label: 'far',  min: 0.01,  max: 0.2, step: 0.001  });

  // ——— Fog ———
  const fogFolder = pane.addFolder({ title: 'Fog', expanded: false });
  fogFolder.addBinding(config, 'fogNear', { label: 'near', min: 1,  max: 50,  step: 1 });
  fogFolder.addBinding(config, 'fogFar',  { label: 'far',  min: 10, max: 200, step: 1 });

  // ——— Export config ———
  pane.addBlade({ view: 'separator' });
  const exportBtn = pane.addButton({ title: 'Export Config' });
  exportBtn.on('click', () => {
    const output = serializeConfig(config);
    navigator.clipboard.writeText(output).then(() => {
      exportBtn.title = 'Copied!';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2000);
    }).catch(() => {
      console.log('%c[Ocean Config — paste into src/config.js]', 'font-weight:bold');
      console.log(output);
      exportBtn.title = 'See console';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2500);
    });
  });
}
