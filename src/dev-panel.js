import { Pane } from 'tweakpane';

function serializeConfig(config) {
  const n = (v, d = 4) => Number(v.toFixed(d));
  const w = config.waves;
  const water = config.water;
  const depth = config.depth;
  const fog = config.fog;
  const sky = config.sky;
  const cam = config.camera;
  const boat = config.boat;
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

  boat: {
    maxSpeed: ${n(boat.maxSpeed, 2)},
    accel: ${n(boat.accel, 2)},
    drag: ${n(boat.drag, 2)},
    turnSpeed: ${n(boat.turnSpeed, 2)},
  },

  combat: {
    muzzleSpeed: ${n(cbt.muzzleSpeed, 2)},
    launchAngleDeg: ${n(cbt.launchAngleDeg ?? 0, 2)},
    trajectoryRibbonWidth: ${n(cbt.trajectoryRibbonWidth ?? 10, 2)},
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

  // Tweakpane rows are mostly interactive children (slider, input). Browsers often do not show
  // an ancestor's native `title` when the pointer is over those controls, so hints would appear
  // to "not work". Use a small fixed tooltip that follows the pointer instead.
  let hintTooltipEl;
  let hintHideTimer;
  function ensureHintTooltip() {
    if (hintTooltipEl) return hintTooltipEl;
    const el = document.createElement('div');
    el.id = 'tp-dev-binding-hint';
    el.setAttribute('role', 'tooltip');
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '100000',
      maxWidth: 'min(320px, calc(100vw - 24px))',
      padding: '8px 10px',
      fontSize: '12px',
      lineHeight: '1.45',
      fontFamily: 'system-ui, sans-serif',
      color: '#fff',
      background: 'rgba(22, 26, 34, 0.96)',
      borderRadius: '6px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
      visibility: 'hidden',
      opacity: '0',
      transition: 'opacity 0.08s ease',
    });
    document.body.appendChild(el);
    hintTooltipEl = el;
    return el;
  }

  function positionHintTooltip(el, clientX, clientY) {
    const pad = 14;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + tw > window.innerWidth - 10) x = clientX - tw - pad;
    if (y + th > window.innerHeight - 10) y = clientY - th - pad;
    x = Math.max(10, Math.min(x, window.innerWidth - tw - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - th - 10));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function bindRowHoverHint(rowEl, hint) {
    if (!hint) return;
    const tip = ensureHintTooltip();

    const onEnter = (e) => {
      clearTimeout(hintHideTimer);
      tip.textContent = hint;
      tip.style.visibility = 'visible';
      tip.style.opacity = '1';
      // Next frame: width/height are reliable after text/layout.
      requestAnimationFrame(() => {
        positionHintTooltip(tip, e.clientX, e.clientY);
      });
    };
    const onMove = (e) => {
      if (tip.style.visibility !== 'visible') return;
      positionHintTooltip(tip, e.clientX, e.clientY);
    };
    const onLeave = () => {
      hintHideTimer = window.setTimeout(() => {
        tip.style.opacity = '0';
        tip.style.visibility = 'hidden';
      }, 80);
    };

    rowEl.addEventListener('mouseenter', onEnter);
    rowEl.addEventListener('mousemove', onMove);
    rowEl.addEventListener('mouseleave', onLeave);
  }

  function bindWithHint(folder, target, key, params, hint) {
    const api = folder.addBinding(target, key, params);
    bindRowHoverHint(api.element, hint);
    return api;
  }

  // ——— Boat movement (WASD) ———
  const boatFolder = pane.addFolder({ title: 'Boat Movement', expanded: false });
  const bm = config.boat;
  bindWithHint(boatFolder, bm, 'maxSpeed', {
    label: 'Max speed',
    min: 2,
    max: 40,
    step: 0.5,
  }, 'Forward speed cap (W). Reverse is 35% of this (S).');
  bindWithHint(boatFolder, bm, 'accel', {
    label: 'Acceleration',
    min: 1,
    max: 40,
    step: 0.5,
  }, 'How quickly W/S change forward speed each second.');
  bindWithHint(boatFolder, bm, 'drag', {
    label: 'Drag',
    min: 0.1,
    max: 10,
    step: 0.1,
  }, 'Exponential slowdown when not accelerating (higher = ship stops faster).');
  bindWithHint(boatFolder, bm, 'turnSpeed', {
    label: 'Turn speed',
    min: 0.5,
    max: 8,
    step: 0.05,
  }, 'Yaw rate in rad/s for A/D; sign flips when moving astern.');

  // ——— Combat / cannons ———
  const combatFolder = pane.addFolder({ title: 'Combat / Cannons', expanded: false });
  const cb = config.combat;
  bindWithHint(combatFolder, cb, 'muzzleSpeed', {
    label: 'Muzzle speed',
    min: 5,
    max: 120,
    step: 1,
  }, 'Base speed along the active broadside (horizontal). Multiplied by charge power; boat forward speed is added to the shot.');
  bindWithHint(combatFolder, cb, 'launchAngleDeg', {
    label: 'Launch angle (°)',
    min: -5,
    max: 45,
    step: 0.5,
  }, 'Initial elevation angle of the shot above the horizon. Affects both the cannonballs and the trajectory preview.');
  bindWithHint(combatFolder, cb, 'trajectoryRibbonWidth', {
    label: 'Ribbon width',
    min: 0.5,
    max: 40,
    step: 0.5,
  }, 'World-space width of the trajectory preview ribbon.');
  bindWithHint(combatFolder, cb, 'gravity', {
    label: 'Ball gravity',
    min: 0,
    max: 40,
    step: 0.5,
  }, 'Downward acceleration on cannonballs and on the yellow trajectory preview (matches gameplay integration).');
  bindWithHint(combatFolder, cb, 'volleyStagger', {
    label: 'Volley stagger',
    min: 0,
    max: 0.35,
    step: 0.01,
  }, 'Delay between each of the three shots on that side after you release Q or E (seconds).');
  bindWithHint(combatFolder, cb, 'cooldown', {
    label: 'Cooldown (s)',
    min: 0.1,
    max: 3,
    step: 0.05,
  }, 'Seconds after firing a volley on one side before you can charge that side again; the other broadside has its own cooldown.');
  bindWithHint(combatFolder, cb, 'powerMin', {
    label: 'Power min (tap)',
    min: 0.1,
    max: 1,
    step: 0.05,
  }, 'Shot power when you release almost immediately (also scales muzzle speed, range, and projectile lifetime).');
  bindWithHint(combatFolder, cb, 'powerMax', {
    label: 'Power max (full)',
    min: 0.5,
    max: 2,
    step: 0.05,
  }, 'Shot power after holding the charge for max charge time (lerped from power min).');
  bindWithHint(combatFolder, cb, 'maxChargeTime', {
    label: 'Max charge (s)',
    min: 0.2,
    max: 3,
    step: 0.05,
  }, 'How long (seconds) to hold to reach max power; shorter holds linearly interpolate toward power min.');
  bindWithHint(combatFolder, cb, 'rangeAtMinPower', {
    label: 'Range @ min power',
    min: 20,
    max: 200,
    step: 5,
  }, 'Maximum horizontal distance from spawn before a cannonball is removed (at minimum power).');
  bindWithHint(combatFolder, cb, 'rangeAtMaxPower', {
    label: 'Range @ max power',
    min: 50,
    max: 400,
    step: 10,
  }, 'Same as range @ min power, at full charge; values in between are interpolated by power.');
  bindWithHint(combatFolder, cb, 'trajectoryPreviewMuzzleIndex', {
    label: 'Preview muzzle',
    min: 0,
    max: 2,
    step: 1,
  }, 'Which port muzzle (0–2) the yellow arc uses while you hold Q.');
  bindWithHint(combatFolder, cb, 'trajectoryPreviewStarboardMuzzleIndex', {
    label: 'Preview muzzle (stbd)',
    min: 0,
    max: 2,
    step: 1,
  }, 'Which starboard muzzle (0–2) the yellow arc uses while you hold E.');
  bindWithHint(combatFolder, cb, 'trajectorySampleDt', {
    label: 'Preview Δt',
    min: 0.004,
    max: 0.05,
    step: 0.001,
  }, 'Simulation timestep for the preview arc only (smaller = smoother, more CPU steps per frame).');
  bindWithHint(combatFolder, cb, 'trajectoryMaxSteps', {
    label: 'Preview max steps',
    min: 50,
    max: 800,
    step: 10,
  }, 'Cap on preview integration steps; also clamped by an internal buffer in main.js (longer arcs need a higher cap there).');

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
