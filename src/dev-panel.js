import { Pane } from 'tweakpane';

// Serializes the current config back to a config.js file string.
function serializeConfig(config) {
  const n = (v, d = 4) => Number(v.toFixed(d));
  return `// Ocean shader configuration — single source of truth.
// Tweak values in the dev panel (npm run dev), then click "Export Config"
// and paste the result here to make your changes permanent.

const oceanConfig = {
  // Wave layers: each layer adds sin(x*freq + t*speed)*amp
  wave1: { freq: ${n(config.wave1.freq)}, speed: ${n(config.wave1.speed)}, amp: ${n(config.wave1.amp)} },
  wave2: { freq: ${n(config.wave2.freq)}, speed: ${n(config.wave2.speed)}, amp: ${n(config.wave2.amp)} },
  wave3: { freq: ${n(config.wave3.freq)}, speed: ${n(config.wave3.speed)}, amp: ${n(config.wave3.amp)} },
  wave4: { freq: ${n(config.wave4.freq)}, speed: ${n(config.wave4.speed)}, amp: ${n(config.wave4.amp)} },

  // Water colors (hex)
  deepColor:  '${config.deepColor}',
  midColor:   '${config.midColor}',
  lightColor: '${config.lightColor}',
  foamColor:  '${config.foamColor}',

  // Cel (toon) shading bands
  toonSteps: ${Math.round(config.toonSteps)},

  // Specular highlight
  specPower:     ${n(config.specPower)},
  specThreshold: ${n(config.specThreshold)},
  specIntensity: ${n(config.specIntensity)},

  // Fresnel rim
  fresnelPower:     ${n(config.fresnelPower)},
  fresnelIntensity: ${n(config.fresnelIntensity)},

  // Foam crest
  foamStart: ${n(config.foamStart)},
  foamEnd:   ${n(config.foamEnd)},
  foamMax:   ${n(config.foamMax)},

  // Distance fog
  fogNear: ${n(config.fogNear, 1)},
  fogFar:  ${n(config.fogFar, 1)},
};

export default oceanConfig;
`;
}

export function mountDevPanel(config) {
  const pane = new Pane({ title: 'Ocean Shader', expanded: false });

  // ——— Waves ———
  const wavesFolder = pane.addFolder({ title: 'Waves', expanded: false });

  [1, 2, 3, 4].forEach((i) => {
    const key = `wave${i}`;
    const wf = wavesFolder.addFolder({ title: `Layer ${i}`, expanded: false });
    wf.addBinding(config[key], 'freq',  { label: 'freq',  min: 0.0, max: 3.0, step: 0.01 });
    wf.addBinding(config[key], 'speed', { label: 'speed', min: 0.0, max: 5.0, step: 0.01 });
    wf.addBinding(config[key], 'amp',   { label: 'amp',   min: 0.0, max: 2.0, step: 0.01 });
  });

  // ——— Colors ———
  const colorsFolder = pane.addFolder({ title: 'Colors', expanded: false });
  colorsFolder.addBinding(config, 'deepColor',  { label: 'Deep',  view: 'color' });
  colorsFolder.addBinding(config, 'midColor',   { label: 'Mid',   view: 'color' });
  colorsFolder.addBinding(config, 'lightColor', { label: 'Light', view: 'color' });
  colorsFolder.addBinding(config, 'foamColor',  { label: 'Foam',  view: 'color' });

  // ——— Toon shading ———
  const toonFolder = pane.addFolder({ title: 'Toon Shading', expanded: false });
  toonFolder.addBinding(config, 'toonSteps', { label: 'bands', min: 1, max: 8, step: 1 });

  // ——— Specular ———
  const specFolder = pane.addFolder({ title: 'Specular', expanded: false });
  specFolder.addBinding(config, 'specPower',     { label: 'power',     min: 1,   max: 128, step: 1   });
  specFolder.addBinding(config, 'specThreshold', { label: 'threshold', min: 0.0, max: 1.0, step: 0.01 });
  specFolder.addBinding(config, 'specIntensity', { label: 'intensity', min: 0.0, max: 2.0, step: 0.01 });

  // ——— Fresnel ———
  const fresnelFolder = pane.addFolder({ title: 'Fresnel', expanded: false });
  fresnelFolder.addBinding(config, 'fresnelPower',     { label: 'power',     min: 0.5, max: 8.0, step: 0.1  });
  fresnelFolder.addBinding(config, 'fresnelIntensity', { label: 'intensity', min: 0.0, max: 1.0, step: 0.01 });

  // ——— Foam ———
  const foamFolder = pane.addFolder({ title: 'Foam', expanded: false });
  foamFolder.addBinding(config, 'foamStart', { label: 'start', min: -1.0, max: 2.0, step: 0.01 });
  foamFolder.addBinding(config, 'foamEnd',   { label: 'end',   min:  0.0, max: 3.0, step: 0.01 });
  foamFolder.addBinding(config, 'foamMax',   { label: 'max',   min:  0.0, max: 1.0, step: 0.01 });

  // ——— Fog ———
  const fogFolder = pane.addFolder({ title: 'Fog', expanded: false });
  fogFolder.addBinding(config, 'fogNear', { label: 'near', min:  1,  max: 100, step: 1 });
  fogFolder.addBinding(config, 'fogFar',  { label: 'far',  min: 50,  max: 300, step: 1 });

  // ——— Export config ———
  pane.addBlade({ view: 'separator' });

  const exportBtn = pane.addButton({ title: 'Export Config' });
  exportBtn.on('click', () => {
    const output = serializeConfig(config);
    navigator.clipboard.writeText(output).then(() => {
      exportBtn.title = 'Copied!';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2000);
    }).catch(() => {
      // Fallback: log to console if clipboard access is denied
      console.log('%c[Ocean Config — paste into src/config.js]', 'font-weight:bold');
      console.log(output);
      exportBtn.title = 'See console';
      setTimeout(() => { exportBtn.title = 'Export Config'; }, 2500);
    });
  });
}
