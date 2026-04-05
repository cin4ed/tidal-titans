import * as THREE from 'three/webgpu';
import {
  color,
  vec2,
  vec3,
  pass,
  linearDepth,
  normalWorld,
  objectPosition,
  screenUV,
  viewportLinearDepth,
  viewportDepthTexture,
  viewportSharedTexture,
  mx_worley_noise_float,
  positionLocal,
  positionWorld,
  sin,
  time,
  uniform,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { inject } from '@vercel/analytics';

import config from './config.js';
import { createPirateShip } from './models/pirateShip.js';

// Initialize Vercel Web Analytics
inject();

// ——— Wave height (CPU side, for boat physics only) ———
// The visual water is rendered via TSL refraction; this formula only drives
// the boat bobbing and tilt — so the GLSL/TSL sync constraint is gone.
function waveHeight(x, z, t) {
  const { wave1, wave2, wave3, wave4 } = config.waves;
  const s = Math.max(0.01, config.waves.spatialScale);
  const ampScale = Math.max(0, config.waves.ampScale);
  const sx = x / s;
  const sz = z / s;
  let h = 0;
  h += Math.sin(sx * wave1.freq + t * wave1.speed) * (wave1.amp * s * ampScale);
  h += Math.sin(sz * wave2.freq + t * wave2.speed) * (wave2.amp * s * ampScale);
  h += Math.sin((sx + sz) * wave3.freq + t * wave3.speed) * (wave3.amp * s * ampScale);
  h += Math.sin(sx * wave4.freq + sz * 0.8 + t * wave4.speed) * (wave4.amp * s * ampScale);
  return h;
}

function waveNormal(x, z, t, eps = 0.15) {
  const hx = waveHeight(x + eps, z, t) - waveHeight(x - eps, z, t);
  const hz = waveHeight(x, z + eps, t) - waveHeight(x, z - eps, t);
  const nx = -hx / (2 * eps);
  const nz = -hz / (2 * eps);
  const len = Math.hypot(nx, 1, nz) || 1;
  return new THREE.Vector3(nx / len, 1 / len, nz / len);
}

// ——— Main async init (WebGPU renderer requires await renderer.init()) ———
async function init() {
  // ——— Scene ———
  const scene = new THREE.Scene();
  if (config.fog.enabled) {
    scene.fog = new THREE.Fog(config.water.colorDeep, config.fog.near, config.fog.far);
  }

  // Water tint uniforms — synced each frame so dev-panel colors update TSL water
  const uWaterColorDeep = uniform(new THREE.Color(config.water.colorDeep));
  const uWaterColorLight = uniform(new THREE.Color(config.water.colorLight));

  // Sky gradient uniforms — separate from water colors
  const uSkyHorizon = uniform(new THREE.Color(config.sky.horizon));
  const uSkyZenith = uniform(new THREE.Color(config.sky.zenith));

  // TSL gradient sky — replaces the canvas texture sky
  scene.backgroundNode = normalWorld.y.mix(uSkyHorizon, uSkyZenith);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.25,
    500
  );

  // ——— WebGPU Renderer ———
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  // ——— Lights ———
  const sunDir = new THREE.Vector3(0.45, 0.85, 0.25).normalize();

  const sunLight = new THREE.DirectionalLight(0xffe499, 5);
  sunLight.position.copy(sunDir).multiplyScalar(80);
  scene.add(sunLight);

  const waterAmbient = new THREE.HemisphereLight(0x333366, 0x74ccf4, 5);
  scene.add(waterAmbient);

  const skyAmbient = new THREE.HemisphereLight(0x74ccf4, 0, 1);
  scene.add(skyAmbient);

  // Sun orb (decorative)
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(4, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffee88, fog: false })
  );
  sunMesh.position.copy(sunDir).multiplyScalar(140);
  scene.add(sunMesh);

  // ——— Underwater objects ———
  // These are visible beneath the water surface and showcase the refraction/depth effect.
  const underwaterGeo = new THREE.IcosahedronGeometry(1, 3);
  const underwaterMat = new THREE.MeshStandardMaterial({
    color: 0x0055aa,
    roughness: 0.4,
    metalness: 0.2,
  });

  const underwaterObjects = new THREE.Group();
  const count = 40;
  const spread = 80;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(underwaterGeo, underwaterMat);
    const angle = (i / count) * Math.PI * 2;
    const radius = 15 + Math.random() * (spread * 0.5);
    mesh.position.set(
      Math.cos(angle) * radius,
      -3 - Math.random() * 4,
      Math.sin(angle) * radius
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.scale.setScalar(0.5 + Math.random() * 0.8);
    underwaterObjects.add(mesh);
  }
  scene.add(underwaterObjects);

  // ——— TSL Water Material ———
  // TSL uniforms — updated every frame from config so dev-panel sliders work live.

  // Wave displacement uniforms (shared formula with JS waveHeight)
  const uW1Freq  = uniform(config.waves.wave1.freq);
  const uW1Speed = uniform(config.waves.wave1.speed);
  const uW1Amp   = uniform(config.waves.wave1.amp);
  const uW2Freq  = uniform(config.waves.wave2.freq);
  const uW2Speed = uniform(config.waves.wave2.speed);
  const uW2Amp   = uniform(config.waves.wave2.amp);
  const uW3Freq  = uniform(config.waves.wave3.freq);
  const uW3Speed = uniform(config.waves.wave3.speed);
  const uW3Amp   = uniform(config.waves.wave3.amp);
  const uW4Freq  = uniform(config.waves.wave4.freq);
  const uW4Speed = uniform(config.waves.wave4.speed);
  const uW4Amp   = uniform(config.waves.wave4.amp);
  const uWaveSpatialScale = uniform(config.waves.spatialScale);
  const uWaveAmpScale = uniform(config.waves.ampScale);
  const uWaveVisualScale = uniform(config.water.waveVisualScale);

  // Worley / refraction uniforms
  const uNoiseSpeed = uniform(config.water.noiseSpeed);
  const uWorleyScale0 = uniform(config.water.worleyScale0);
  const uWorleyScale1 = uniform(config.water.worleyScale1);

  // ——— TSL vertex wave displacement ———
  // Mirrors JS waveHeight() exactly; positionLocal is object-space (plane lies in XZ).
  const px = positionLocal.x.div(uWaveSpatialScale);
  const pz = positionLocal.z.div(uWaveSpatialScale);

  const wAmp = (a) => a.mul(uWaveSpatialScale).mul(uWaveAmpScale);

  const vY =
    sin(px.mul(uW1Freq).add(time.mul(uW1Speed))).mul(wAmp(uW1Amp))
    .add(sin(pz.mul(uW2Freq).add(time.mul(uW2Speed))).mul(wAmp(uW2Amp)))
    .add(sin(px.add(pz).mul(uW3Freq).add(time.mul(uW3Speed))).mul(wAmp(uW3Amp)))
    .add(sin(px.mul(uW4Freq).add(pz.mul(0.8)).add(time.mul(uW4Speed))).mul(wAmp(uW4Amp)));

  const displacedPosition = positionLocal.add(vec3(0, vY.mul(uWaveVisualScale), 0));

  // Worley noise for surface color + refraction (samples world position after displacement)
  const t = time.mul(uNoiseSpeed);
  const floorUV = positionWorld.xzy;

  const waterLayer0 = mx_worley_noise_float(floorUV.mul(uWorleyScale0).add(t));
  const waterLayer1 = mx_worley_noise_float(floorUV.mul(uWorleyScale1).add(t));
  const waterIntensity = waterLayer0.mul(waterLayer1);

  const waterColor = waterIntensity.mul(1.4).mix(uWaterColorDeep, uWaterColorLight);

  // linearDepth() = linear depth of this mesh's fragment
  const depth = linearDepth();

  // Depth of what's behind the water: viewportLinearDepth - depth
  const depthWater = viewportLinearDepth.sub(depth);
  const depthEffect = depthWater.remapClamp(config.depth.near, config.depth.far);

  // Refraction: offset screen UV by the water noise, then depth-test so
  // objects above the water surface are never refracted
  const uRefractionStrength = uniform(config.water.refractionStrength);
  const refractionUV = screenUV.add(
    vec2(0, waterIntensity.mul(uRefractionStrength))
  );
  const depthTestForRefraction = linearDepth(viewportDepthTexture(refractionUV)).sub(depth);
  const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1);

  // If refraction UV would sample something in front of the water, fall back to un-distorted UV
  const finalUV = depthTestForRefraction.lessThan(0).select(screenUV, refractionUV);

  const viewportTex = viewportSharedTexture(finalUV);

  const waterMaterial = new THREE.MeshBasicNodeMaterial();
  waterMaterial.positionNode = displacedPosition;
  waterMaterial.colorNode = waterColor;
  waterMaterial.backdropNode = depthEffect.mix(
    viewportSharedTexture(),
    viewportTex.mul(depthRefraction.mix(1, waterColor))
  );
  waterMaterial.backdropAlphaNode = depthRefraction.oneMinus();
  waterMaterial.transparent = true;

  // Subdivided plane gives enough vertices to show smooth rolling waves.
  const waterGeo = new THREE.PlaneGeometry(220, 220, 200, 200);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMaterial);
  water.position.set(0, 0, 0);
  scene.add(water);

  const boatObj = createPirateShip();
  const boat    = boatObj.group;
  boat.position.set(0, 0.5, 0);
  scene.add(boat);

  // ——— Input ———
  const keys = { w: false, a: false, s: false, d: false };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
  });

  // ——— Boat physics state ———
  let speed = 0;
  const maxSpeed = 14;
  const accel = 10;
  const drag = 2.2;
  const turnSpeed = 2.4;

  // ——— Camera orbit state ———
  const oc = config.camera;
  const camOrbit = {
    yaw: Math.PI,
    pitch: 0.42,
    distance: THREE.MathUtils.clamp(oc.distanceInitial ?? 12, oc.distanceMin, oc.distanceMax),
    sensitivity: 0.0022,
    pitchMin: 0.05,
    pitchMax: Math.PI / 2 - 0.05,
  };

  // ——— Pointer Lock ———
  let pointerLocked = false;

  renderer.domElement.addEventListener('click', () => {
    if (!pointerLocked) renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    const hint = document.getElementById('hint');
    if (hint) hint.classList.toggle('is-locked', pointerLocked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    camOrbit.yaw -= e.movementX * camOrbit.sensitivity;
    camOrbit.pitch += e.movementY * camOrbit.sensitivity;
    camOrbit.pitch = THREE.MathUtils.clamp(camOrbit.pitch, camOrbit.pitchMin, camOrbit.pitchMax);
  });

  // ——— Scroll-wheel zoom ———
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { distanceMin, distanceMax, distanceStep } = config.camera;
    camOrbit.distance += Math.sign(e.deltaY) * distanceStep;
    camOrbit.distance = THREE.MathUtils.clamp(camOrbit.distance, distanceMin, distanceMax);
  }, { passive: false });

  // ——— Resize ———
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ——— Reusable vectors ———
  const timer = new THREE.Timer();
  const boatForward = new THREE.Vector3();
  const camTarget   = new THREE.Vector3();
  const camDesired  = new THREE.Vector3();
  const worldUp     = new THREE.Vector3(0, 1, 0);
  const rightVec    = new THREE.Vector3();

  // ——— Post-processing pipeline ———
  // Depth-based blur: stronger blur underwater, vignette above.
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode();
  const scenePassDepth = scenePass.getLinearDepthNode().remapClamp(0.3, 0.5);

  // Mask: are we looking at the water surface (above) or below it?
  const waterMask = objectPosition(camera).y.greaterThan(
    screenUV.y.sub(0.5).mul(camera.near)
  );

  const scenePassColorBlurred = gaussianBlur(scenePassColor);
  scenePassColorBlurred.directionNode = waterMask.select(
    scenePassDepth,
    scenePass.getLinearDepthNode().mul(5)
  );

  const vignette = screenUV.distance(0.5).mul(1.35).clamp().oneMinus();

  const renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = waterMask.select(
    scenePassColorBlurred,
    scenePassColorBlurred.mul(color(0x74ccf4)).mul(vignette)
  );

  // ——— Animation loop ———
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const t = timer.getElapsed();

    // Sync TSL uniforms from config (live dev-panel + exported defaults)
    const w = config.waves;
    const water = config.water;
    uW1Freq.value  = w.wave1.freq;  uW1Speed.value = w.wave1.speed; uW1Amp.value = w.wave1.amp;
    uW2Freq.value  = w.wave2.freq;  uW2Speed.value = w.wave2.speed; uW2Amp.value = w.wave2.amp;
    uW3Freq.value  = w.wave3.freq;  uW3Speed.value = w.wave3.speed; uW3Amp.value = w.wave3.amp;
    uW4Freq.value  = w.wave4.freq;  uW4Speed.value = w.wave4.speed; uW4Amp.value = w.wave4.amp;
    uWaveSpatialScale.value = Math.max(0.01, w.spatialScale);
    uWaveAmpScale.value = Math.max(0, w.ampScale);
    uWaveVisualScale.value = water.waveVisualScale;
    uNoiseSpeed.value = water.noiseSpeed;
    uWorleyScale0.value = water.worleyScale0;
    uWorleyScale1.value = water.worleyScale1;
    uRefractionStrength.value = water.refractionStrength;
    uWaterColorDeep.value.set(water.colorDeep);
    uWaterColorLight.value.set(water.colorLight);
    const skyCfg = config.sky;
    uSkyHorizon.value.set(skyCfg.horizon);
    uSkyZenith.value.set(skyCfg.zenith);

    // Scene fog reads from THREE.Fog instance, not config — keep in sync with dev panel
    const fogCfg = config.fog;
    if (fogCfg.enabled) {
      if (!scene.fog) {
        scene.fog = new THREE.Fog(water.colorDeep, fogCfg.near, fogCfg.far);
      } else {
        scene.fog.near = fogCfg.near;
        scene.fog.far = fogCfg.far;
        scene.fog.color.set(water.colorDeep);
      }
    } else {
      scene.fog = null;
    }

    // Animate underwater objects
    for (const obj of underwaterObjects.children) {
      obj.position.y += Math.sin(t * 0.7 + obj.id) * 0.003;
      obj.rotation.y += dt * 0.15;
    }

    // ——— Sail & flag flutter ———
    // Sails gently tilt toward the "wind" (+X in ship-local space) and oscillate slightly.
    const windBase   = 0.08;  // base lean angle (radians)
    const flutterAmp = 0.03;  // oscillation amplitude
    const flutterHz  = 1.1;   // oscillation speed
    const sailLean   = windBase + Math.sin(t * flutterHz) * flutterAmp;
    // Sail flutter: tilt on local X (broad face catches wind along ship length)
    boatObj.mainSail.rotation.x = sailLean * 0.6;
    boatObj.topSail.rotation.x  = sailLean * 0.8;
    boatObj.foreSail.rotation.x = sailLean * 0.7;
    // Flag waves: oscillate its Z-rotation like a flapping cloth
    const flagFlap = Math.sin(t * 3.5) * 0.12 + Math.sin(t * 5.1) * 0.05;
    boatObj.flagMain.rotation.z = flagFlap;
    boatObj.flagMain.position.z = boatObj.mainSailBaseZ + Math.abs(flagFlap) * 0.15;

    // Boat movement
    if (keys.w) speed += accel * dt;
    if (keys.s) speed -= accel * dt * 0.7;
    speed *= Math.exp(-drag * dt);
    speed = THREE.MathUtils.clamp(speed, -maxSpeed * 0.35, maxSpeed);

    if (keys.a) boat.rotation.y += turnSpeed * dt * (speed >= 0 ? 1 : -1);
    if (keys.d) boat.rotation.y -= turnSpeed * dt * (speed >= 0 ? 1 : -1);

    boatForward.set(Math.sin(boat.rotation.y), 0, Math.cos(boat.rotation.y));
    boat.position.x += boatForward.x * speed * dt;
    boat.position.z += boatForward.z * speed * dt;

    const wx = boat.position.x;
    const wz = boat.position.z;
    boat.position.y = waveHeight(wx, wz, t) + 0.35;

    const n = waveNormal(wx, wz, t);
    rightVec.crossVectors(boatForward, worldUp).normalize();
    const boatPitch = Math.asin(THREE.MathUtils.clamp(-n.dot(boatForward), -0.35, 0.35));
    const boatRoll  = Math.asin(THREE.MathUtils.clamp(n.dot(rightVec), -0.4, 0.4));
    boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, boatPitch, 0.12);
    boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, boatRoll, 0.12);

    // Orbit camera — clamp distance each frame so live Tweakpane changes take effect immediately
    camOrbit.distance = THREE.MathUtils.clamp(
      camOrbit.distance,
      config.camera.distanceMin,
      config.camera.distanceMax,
    );
    const sinYaw   = Math.sin(camOrbit.yaw);
    const cosYaw   = Math.cos(camOrbit.yaw);
    const sinPitch = Math.sin(camOrbit.pitch);
    const cosPitch = Math.cos(camOrbit.pitch);

    camTarget.copy(boat.position);
    camTarget.y += 1.5;

    camDesired.set(
      camTarget.x + camOrbit.distance * cosPitch * sinYaw,
      camTarget.y + camOrbit.distance * sinPitch,
      camTarget.z + camOrbit.distance * cosPitch * cosYaw
    );

    camera.position.lerp(camDesired, 0.1);
    camera.lookAt(camTarget);

    renderPipeline.render();
  });

  // ——— Dev panel (development only) ———
  if (import.meta.env.DEV) {
    import('./dev-panel.js').then(({ mountDevPanel }) => {
      mountDevPanel(config, {
        onCameraInitialZoomChange: (d) => {
          camOrbit.distance = THREE.MathUtils.clamp(
            d,
            config.camera.distanceMin,
            config.camera.distanceMax,
          );
        },
      });
    });
  }
}

init().catch(console.error);
