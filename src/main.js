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
  cos,
  sin,
  time,
  uniform,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { inject } from '@vercel/analytics';

import config from './config.js';
import { createPirateShip } from './models/pirateShip.js';
import { createEnemyShip } from './models/enemyShip.js';
import { createEnemyHealthBar } from './models/enemyHealthBar.js';

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

  // Height-only sampling of the full Gerstner surface. We still include the
  // Gerstner choppiness terms in normals via analytic tangents below.
  //
  // Params are per-wave:
  // - wavelength: in "scaled space" units (i.e. applied to sx/sz)
  // - speed: angular phase speed (radians/sec)
  // - amp: base amplitude (scaled by s * ampScale to keep the old global knobs useful)
  // - steepness: choppiness (Q), clamped for stability
  let h = 0;
  const add = (w) => {
    const dirLen = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / dirLen;
    const dz = w.dirZ / dirLen;
    const A = (w.amp ?? 0) * s * ampScale;
    const k = (Math.PI * 2) / Math.max(0.001, w.wavelength ?? 1);
    const theta = k * (dx * sx + dz * sz) + (w.speed ?? 0) * t;
    h += A * Math.sin(theta);
  };

  add(wave1);
  add(wave2);
  add(wave3);
  add(wave4);
  return h;
}

function waveNormal(x, z, t, eps = 0.15) {
  const { wave1, wave2, wave3, wave4 } = config.waves;
  const s = Math.max(0.01, config.waves.spatialScale);
  const ampScale = Math.max(0, config.waves.ampScale);
  const sx = x / s;
  const sz = z / s;

  // Analytic Gerstner normal via tangents:
  // P(x,z) = [ x + Σ(Q A d.x cosθ), Σ(A sinθ), z + Σ(Q A d.z cosθ) ]
  //
  // Use scaled coordinates (sx, sz) for θ, then apply chain rule for ∂θ/∂x and ∂θ/∂z.
  // This keeps boat tilt consistent with the visible water mesh.
  let dPxdx = 1;
  let dPydx = 0;
  let dPzdx = 0;
  let dPxdz = 0;
  let dPydz = 0;
  let dPzdz = 1;

  const add = (w) => {
    const dirLen = Math.hypot(w.dirX, w.dirZ) || 1;
    const dx = w.dirX / dirLen;
    const dz = w.dirZ / dirLen;

    const A = (w.amp ?? 0) * s * ampScale;
    const k = (Math.PI * 2) / Math.max(0.001, w.wavelength ?? 1);
    const omega = w.speed ?? 0;

    // Clamp choppiness for stability; keep a small safety margin.
    const Q = THREE.MathUtils.clamp(w.steepness ?? 0, 0, 0.98);

    const theta = k * (dx * sx + dz * sz) + omega * t;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const dThetaDx = (k * dx) / s;
    const dThetaDz = (k * dz) / s;

    // ∂/∂x
    dPxdx += (-Q * A * dx * sinT) * dThetaDx;
    dPydx += (A * cosT) * dThetaDx;
    dPzdx += (-Q * A * dz * sinT) * dThetaDx;

    // ∂/∂z
    dPxdz += (-Q * A * dx * sinT) * dThetaDz;
    dPydz += (A * cosT) * dThetaDz;
    dPzdz += (-Q * A * dz * sinT) * dThetaDz;
  };

  add(wave1);
  add(wave2);
  add(wave3);
  add(wave4);

  // Tangents
  const dPdx = new THREE.Vector3(dPxdx, dPydx, dPzdx);
  const dPdz = new THREE.Vector3(dPxdz, dPydz, dPzdz);

  // Normal = normalize(dPdz × dPdx)
  const n = new THREE.Vector3().crossVectors(dPdz, dPdx);
  const len = n.length() || 1;
  n.multiplyScalar(1 / len);
  return n;
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

  // Gerstner wave displacement uniforms (mirrors CPU waveHeight/waveNormal)
  // We precompute k = 2π/λ on the CPU and sync it each frame for stability.
  const uG1DirX = uniform(config.waves.wave1.dirX);
  const uG1DirZ = uniform(config.waves.wave1.dirZ);
  const uG1K = uniform((Math.PI * 2) / Math.max(0.001, config.waves.wave1.wavelength));
  const uG1Speed = uniform(config.waves.wave1.speed);
  const uG1Amp = uniform(config.waves.wave1.amp);
  const uG1Steep = uniform(config.waves.wave1.steepness);

  const uG2DirX = uniform(config.waves.wave2.dirX);
  const uG2DirZ = uniform(config.waves.wave2.dirZ);
  const uG2K = uniform((Math.PI * 2) / Math.max(0.001, config.waves.wave2.wavelength));
  const uG2Speed = uniform(config.waves.wave2.speed);
  const uG2Amp = uniform(config.waves.wave2.amp);
  const uG2Steep = uniform(config.waves.wave2.steepness);

  const uG3DirX = uniform(config.waves.wave3.dirX);
  const uG3DirZ = uniform(config.waves.wave3.dirZ);
  const uG3K = uniform((Math.PI * 2) / Math.max(0.001, config.waves.wave3.wavelength));
  const uG3Speed = uniform(config.waves.wave3.speed);
  const uG3Amp = uniform(config.waves.wave3.amp);
  const uG3Steep = uniform(config.waves.wave3.steepness);

  const uG4DirX = uniform(config.waves.wave4.dirX);
  const uG4DirZ = uniform(config.waves.wave4.dirZ);
  const uG4K = uniform((Math.PI * 2) / Math.max(0.001, config.waves.wave4.wavelength));
  const uG4Speed = uniform(config.waves.wave4.speed);
  const uG4Amp = uniform(config.waves.wave4.amp);
  const uG4Steep = uniform(config.waves.wave4.steepness);

  const uWaveSpatialScale = uniform(config.waves.spatialScale);
  const uWaveAmpScale = uniform(config.waves.ampScale);
  const uWaveVisualScale = uniform(config.water.waveVisualScale);

  // Worley / refraction uniforms
  const uNoiseSpeed = uniform(config.water.noiseSpeed);
  const uWorleyScale0 = uniform(config.water.worleyScale0);
  const uWorleyScale1 = uniform(config.water.worleyScale1);

  // ——— TSL vertex Gerstner displacement ———
  // Mirrors CPU waveHeight/waveNormal parameters. Use world position for phase so
  // waves are world-locked (CPU sampling uses world x/z).
  const px = positionWorld.x.div(uWaveSpatialScale);
  const pz = positionWorld.z.div(uWaveSpatialScale);

  const wAmp = (a) => a.mul(uWaveSpatialScale).mul(uWaveAmpScale);

  const gAdd = (dirX, dirZ, k, speed, amp, steep) => {
    const dirLen = dirX.mul(dirX).add(dirZ.mul(dirZ)).sqrt().max(0.00001);
    const dx = dirX.div(dirLen);
    const dz = dirZ.div(dirLen);
    const A = wAmp(amp);
    const Q = steep.clamp(0.0, 0.98);
    const theta = k.mul(dx.mul(px).add(dz.mul(pz))).add(time.mul(speed));
    const c = cos(theta);
    const s = sin(theta);
    return vec3(
      Q.mul(A).mul(dx).mul(c),
      A.mul(s),
      Q.mul(A).mul(dz).mul(c),
    );
  };

  const gDisp =
    gAdd(uG1DirX, uG1DirZ, uG1K, uG1Speed, uG1Amp, uG1Steep)
      .add(gAdd(uG2DirX, uG2DirZ, uG2K, uG2Speed, uG2Amp, uG2Steep))
      .add(gAdd(uG3DirX, uG3DirZ, uG3K, uG3Speed, uG3Amp, uG3Steep))
      .add(gAdd(uG4DirX, uG4DirZ, uG4K, uG4Speed, uG4Amp, uG4Steep));

  // Note: waveVisualScale scales the full displacement (including choppiness) so
  // setting it to 0 fully flattens the water surface.
  const displacedPosition = positionLocal.add(gDisp.mul(uWaveVisualScale));

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

  const enemyObj = createEnemyShip();
  const enemyShip = enemyObj.group;
  enemyShip.position.set(32, 0.5, 28);
  scene.add(enemyShip);

  const enemyHealthBar = createEnemyHealthBar();
  scene.add(enemyHealthBar.sprite);
  let enemyHealth = 1;
  enemyHealthBar.setHealth(enemyHealth);

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
  /** @type {null | 'port' | 'starboard'} */
  let cannonChargingSide = null;

  renderer.domElement.addEventListener('click', () => {
    if (!pointerLocked) renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    if (!pointerLocked) cannonChargingSide = null;
    const hint = document.getElementById('hint');
    if (hint) hint.classList.toggle('is-locked', pointerLocked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    camOrbit.yaw -= e.movementX * camOrbit.sensitivity;
    camOrbit.pitch += e.movementY * camOrbit.sensitivity;
    camOrbit.pitch = THREE.MathUtils.clamp(camOrbit.pitch, camOrbit.pitchMin, camOrbit.pitchMax);
  });

  const timer = new THREE.Timer();

  // ——— Broadsides (pointer locked: hold Q = port / E = starboard, release to fire) ———
  // Tuning: config.combat (dev panel + Export Config).
  const CANNON_TRAJ_BUFFER_STEPS = 800;

  const cannonBallGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const cannonBallMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.85,
    metalness: 0.45,
    flatShading: true,
  });

  /** @type {{ mesh: THREE.Mesh, velocity: THREE.Vector3, age: number, spawnX: number, spawnZ: number, maxRangeSq: number, maxLife: number }[]} */
  const cannonProjectiles = [];
  /** @type {{ fireAt: number, muzzleIndex: number, powerScale: number, side: 'port' | 'starboard' }[]} */
  const cannonShotQueue = [];
  let cannonCooldownUntilPort = 0;
  let cannonCooldownUntilStarboard = 0;
  let cannonChargeStartWall = 0;

  const muzzleWorld = new THREE.Vector3();
  const broadsideDir = new THREE.Vector3();
  const boatVelAtFire = new THREE.Vector3();
  const cannonSpawnVel = new THREE.Vector3();
  const cannonHorizVel = new THREE.Vector3();
  const trajP = new THREE.Vector3();
  const trajV = new THREE.Vector3();
  const trajTangent = new THREE.Vector3();
  const trajCamDir = new THREE.Vector3();
  const trajWidthDir = new THREE.Vector3();
  const trajLeft = new THREE.Vector3();
  const trajRight = new THREE.Vector3();

  // Trajectory preview ribbon (replaces the thin line).
  // We keep a centerline buffer for sampling, then expand into a billboarded ribbon strip.
  const trajCenterVertCount = CANNON_TRAJ_BUFFER_STEPS + 2;
  const trajCenterPosArr = new Float32Array(trajCenterVertCount * 3);

  const trajRibbonVertCount = trajCenterVertCount * 2;
  const trajRibbonPosArr = new Float32Array(trajRibbonVertCount * 3);
  const trajRibbonGeom = new THREE.BufferGeometry();
  trajRibbonGeom.setAttribute('position', new THREE.BufferAttribute(trajRibbonPosArr, 3));

  const trajRibbonIndexCount = (trajCenterVertCount - 1) * 6;
  const trajRibbonIndexArr = new Uint32Array(trajRibbonIndexCount);
  {
    let w = 0;
    for (let i = 0; i < trajCenterVertCount - 1; i++) {
      const a0 = i * 2;
      const a1 = i * 2 + 1;
      const b0 = (i + 1) * 2;
      const b1 = (i + 1) * 2 + 1;
      // Two triangles for the quad segment.
      trajRibbonIndexArr[w++] = a0;
      trajRibbonIndexArr[w++] = a1;
      trajRibbonIndexArr[w++] = b0;
      trajRibbonIndexArr[w++] = a1;
      trajRibbonIndexArr[w++] = b1;
      trajRibbonIndexArr[w++] = b0;
    }
  }
  trajRibbonGeom.setIndex(new THREE.BufferAttribute(trajRibbonIndexArr, 1));
  trajRibbonGeom.setDrawRange(0, 0);

  const trajRibbonMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cannonTrajectoryRibbon = new THREE.Mesh(trajRibbonGeom, trajRibbonMat);
  cannonTrajectoryRibbon.visible = false;
  cannonTrajectoryRibbon.frustumCulled = false;
  cannonTrajectoryRibbon.renderOrder = 10_000;
  scene.add(cannonTrajectoryRibbon);

  function cannonPowerBounds() {
    const c = config.combat;
    const lo = Math.min(c.powerMin, c.powerMax);
    const hi = Math.max(c.powerMin, c.powerMax);
    return { lo, hi, span: Math.max(1e-4, hi - lo) };
  }

  function cannonPowerFromHoldSeconds(holdSec) {
    const c = config.combat;
    const { lo, hi } = cannonPowerBounds();
    const chargeT = Math.max(0.05, c.maxChargeTime);
    return THREE.MathUtils.lerp(lo, hi, THREE.MathUtils.clamp(holdSec / chargeT, 0, 1));
  }

  function cannonMaxRangeForPower(powerScale) {
    const c = config.combat;
    const { lo, span } = cannonPowerBounds();
    const u = THREE.MathUtils.clamp((powerScale - lo) / span, 0, 1);
    const r0 = Math.min(c.rangeAtMinPower, c.rangeAtMaxPower);
    const r1 = Math.max(c.rangeAtMinPower, c.rangeAtMaxPower);
    return THREE.MathUtils.lerp(r0, r1, u);
  }

  function cannonMaxLifeForPower(powerScale) {
    const { lo, span } = cannonPowerBounds();
    const u = THREE.MathUtils.clamp((powerScale - lo) / span, 0, 1);
    return THREE.MathUtils.lerp(4.5, 8.5, u);
  }

  function prepareCannonMuzzle(muzzleIndex, side) {
    const locals =
      side === 'port' ? boatObj.portCannonMuzzleLocal : boatObj.starboardCannonMuzzleLocal;
    if (!locals || muzzleIndex < 0 || muzzleIndex >= locals.length) return false;
    boat.updateMatrixWorld(true);
    muzzleWorld.copy(locals[muzzleIndex]).applyMatrix4(boat.matrixWorld);
    if (side === 'port') {
      broadsideDir.set(-rightVec.x, 0, -rightVec.z);
      if (broadsideDir.lengthSq() < 1e-8) broadsideDir.set(-1, 0, 0);
    } else {
      broadsideDir.set(rightVec.x, 0, rightVec.z);
      if (broadsideDir.lengthSq() < 1e-8) broadsideDir.set(1, 0, 0);
    }
    broadsideDir.normalize();
    muzzleWorld.addScaledVector(broadsideDir, 3);
    boatVelAtFire.copy(boatForward).multiplyScalar(speed);
    return true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    const side = k === 'q' ? 'port' : 'starboard';
    const tNow = timer.getElapsed();
    const cdUntil = side === 'port' ? cannonCooldownUntilPort : cannonCooldownUntilStarboard;
    if (tNow < cdUntil || cannonChargingSide !== null) return;
    cannonChargingSide = side;
    cannonChargeStartWall = performance.now();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    const side = k === 'q' ? 'port' : 'starboard';
    if (cannonChargingSide !== side) return;
    cannonChargingSide = null;
    if (document.pointerLockElement !== renderer.domElement) return;
    const tNow = timer.getElapsed();
    const holdSec = (performance.now() - cannonChargeStartWall) / 1000;
    const powerScale = cannonPowerFromHoldSeconds(holdSec);
    const cbt = config.combat;
    if (side === 'port') cannonCooldownUntilPort = tNow + cbt.cooldown;
    else cannonCooldownUntilStarboard = tNow + cbt.cooldown;
    const locals =
      side === 'port' ? boatObj.portCannonMuzzleLocal : boatObj.starboardCannonMuzzleLocal;
    if (!locals) return;
    for (let i = 0; i < locals.length; i++) {
      cannonShotQueue.push({ fireAt: tNow + i * cbt.volleyStagger, muzzleIndex: i, powerScale, side });
    }
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
  const boatForward = new THREE.Vector3();
  const camTarget   = new THREE.Vector3();
  const camDesired  = new THREE.Vector3();
  const worldUp     = new THREE.Vector3(0, 1, 0);
  const rightVec    = new THREE.Vector3();
  const enemyForward = new THREE.Vector3();
  const enemyRight   = new THREE.Vector3();
  const enemyHealthBarLocal = new THREE.Vector3(0, 6.35, 0);
  const enemyHealthBarWorld = new THREE.Vector3();

  function spawnCannonProjectile(muzzleIndex, powerScale, side) {
    if (!prepareCannonMuzzle(muzzleIndex, side)) return;

    const launchAngleRad = THREE.MathUtils.degToRad(config.combat.launchAngleDeg ?? 0);
    const muzzleV = config.combat.muzzleSpeed * powerScale;
    const cosA = Math.cos(launchAngleRad);
    const sinA = Math.sin(launchAngleRad);
    cannonHorizVel.copy(broadsideDir).multiplyScalar(muzzleV * cosA);
    cannonSpawnVel.copy(cannonHorizVel).addScaledVector(worldUp, muzzleV * sinA).add(boatVelAtFire);

    const mesh = new THREE.Mesh(cannonBallGeo, cannonBallMat);
    mesh.position.copy(muzzleWorld);
    scene.add(mesh);

    const maxR = cannonMaxRangeForPower(powerScale);
    cannonProjectiles.push({
      mesh,
      velocity: cannonSpawnVel.clone(),
      age: 0,
      spawnX: muzzleWorld.x,
      spawnZ: muzzleWorld.z,
      maxRangeSq: maxR * maxR,
      maxLife: cannonMaxLifeForPower(powerScale),
    });
  }

  function updateCannonTrajectoryPreview(t) {
    const side = cannonChargingSide;
    const cdOk =
      side === 'port'
        ? t >= cannonCooldownUntilPort
        : side === 'starboard'
          ? t >= cannonCooldownUntilStarboard
          : false;
    const show =
      side !== null &&
      pointerLocked &&
      cdOk &&
      document.pointerLockElement === renderer.domElement;
    if (!show) {
      cannonTrajectoryRibbon.visible = false;
      return;
    }

    const holdSec = (performance.now() - cannonChargeStartWall) / 1000;
    const powerScale = cannonPowerFromHoldSeconds(holdSec);

    const localsPreview =
      side === 'port' ? boatObj.portCannonMuzzleLocal : boatObj.starboardCannonMuzzleLocal;
    const idxSrc =
      side === 'port'
        ? config.combat.trajectoryPreviewMuzzleIndex
        : (config.combat.trajectoryPreviewStarboardMuzzleIndex ??
          config.combat.trajectoryPreviewMuzzleIndex);
    const previewMuzzle = localsPreview
      ? THREE.MathUtils.clamp(Math.round(idxSrc), 0, localsPreview.length - 1)
      : 1;
    if (!prepareCannonMuzzle(previewMuzzle, side)) {
      cannonTrajectoryRibbon.visible = false;
      return;
    }

    const spawnX = muzzleWorld.x;
    const spawnZ = muzzleWorld.z;
    const launchAngleRad = THREE.MathUtils.degToRad(config.combat.launchAngleDeg ?? 0);
    const muzzleV = config.combat.muzzleSpeed * powerScale;
    const cosA = Math.cos(launchAngleRad);
    const sinA = Math.sin(launchAngleRad);
    trajV.copy(broadsideDir).multiplyScalar(muzzleV * cosA).addScaledVector(worldUp, muzzleV * sinA).add(boatVelAtFire);
    trajP.copy(muzzleWorld);

    let w = 0;
    trajCenterPosArr[w++] = trajP.x;
    trajCenterPosArr[w++] = trajP.y;
    trajCenterPosArr[w++] = trajP.z;

    const previewMaxR = cannonMaxRangeForPower(powerScale);
    const previewMaxSq = previewMaxR * previewMaxR;
    const cbt = config.combat;
    const dtS = Math.max(0.001, cbt.trajectorySampleDt);
    const g = cbt.gravity;
    const maxSteps = Math.min(
      Math.max(1, Math.round(cbt.trajectoryMaxSteps)),
      CANNON_TRAJ_BUFFER_STEPS,
    );

    for (let step = 0; step < maxSteps; step++) {
      trajV.y -= g * dtS;
      trajP.x += trajV.x * dtS;
      trajP.y += trajV.y * dtS;
      trajP.z += trajV.z * dtS;

      const dx = trajP.x - spawnX;
      const dz = trajP.z - spawnZ;
      if (dx * dx + dz * dz > previewMaxSq) break;

      if (trajP.y < waveHeight(trajP.x, trajP.z, t)) break;

      if (w >= trajCenterPosArr.length - 3) break;
      trajCenterPosArr[w++] = trajP.x;
      trajCenterPosArr[w++] = trajP.y;
      trajCenterPosArr[w++] = trajP.z;
    }

    const centerVertCount = w / 3;
    const ribbonHalfWidth = Math.max(0.01, config.combat.trajectoryRibbonWidth ?? 10) * 0.5;

    // Expand centerline into a camera-facing ribbon.
    for (let i = 0; i < centerVertCount; i++) {
      const i3 = i * 3;
      const px = trajCenterPosArr[i3 + 0];
      const py = trajCenterPosArr[i3 + 1];
      const pz = trajCenterPosArr[i3 + 2];

      // Tangent: forward difference at ends, central difference otherwise.
      if (centerVertCount <= 1) {
        trajTangent.set(1, 0, 0);
      } else if (i === 0) {
        trajTangent.set(
          trajCenterPosArr[3] - px,
          trajCenterPosArr[4] - py,
          trajCenterPosArr[5] - pz,
        );
      } else if (i === centerVertCount - 1) {
        const j3 = (i - 1) * 3;
        trajTangent.set(
          px - trajCenterPosArr[j3 + 0],
          py - trajCenterPosArr[j3 + 1],
          pz - trajCenterPosArr[j3 + 2],
        );
      } else {
        const j3 = (i - 1) * 3;
        const k3 = (i + 1) * 3;
        trajTangent.set(
          trajCenterPosArr[k3 + 0] - trajCenterPosArr[j3 + 0],
          trajCenterPosArr[k3 + 1] - trajCenterPosArr[j3 + 1],
          trajCenterPosArr[k3 + 2] - trajCenterPosArr[j3 + 2],
        );
      }
      if (trajTangent.lengthSq() < 1e-10) trajTangent.set(1, 0, 0);
      trajTangent.normalize();

      // Ribbon width direction does NOT need to be camera-facing.
      // Use the ship's bow→stern axis (`boatForward`), orthogonalized against the trajectory tangent
      // so the ribbon stays "wide" relative to the arc instead of skewing along it.
      trajWidthDir.copy(boatForward);
      trajWidthDir.addScaledVector(trajTangent, -trajWidthDir.dot(trajTangent));
      if (trajWidthDir.lengthSq() < 1e-10) {
        // Fallback if tangent is nearly aligned with boatForward.
        trajWidthDir.crossVectors(trajTangent, worldUp);
      }
      if (trajWidthDir.lengthSq() < 1e-10) trajWidthDir.set(1, 0, 0);
      trajWidthDir.normalize();

      trajLeft.set(px, py, pz).addScaledVector(trajWidthDir, ribbonHalfWidth);
      trajRight.set(px, py, pz).addScaledVector(trajWidthDir, -ribbonHalfWidth);

      const vL3 = (i * 2 + 0) * 3;
      const vR3 = (i * 2 + 1) * 3;
      trajRibbonPosArr[vL3 + 0] = trajLeft.x;
      trajRibbonPosArr[vL3 + 1] = trajLeft.y;
      trajRibbonPosArr[vL3 + 2] = trajLeft.z;
      trajRibbonPosArr[vR3 + 0] = trajRight.x;
      trajRibbonPosArr[vR3 + 1] = trajRight.y;
      trajRibbonPosArr[vR3 + 2] = trajRight.z;
    }

    trajRibbonGeom.attributes.position.needsUpdate = true;
    trajRibbonGeom.setDrawRange(0, Math.max(0, (centerVertCount - 1) * 6));
    cannonTrajectoryRibbon.visible = centerVertCount >= 2;
  }

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
    uG1DirX.value = w.wave1.dirX; uG1DirZ.value = w.wave1.dirZ;
    uG1K.value = (Math.PI * 2) / Math.max(0.001, w.wave1.wavelength);
    uG1Speed.value = w.wave1.speed; uG1Amp.value = w.wave1.amp; uG1Steep.value = w.wave1.steepness;

    uG2DirX.value = w.wave2.dirX; uG2DirZ.value = w.wave2.dirZ;
    uG2K.value = (Math.PI * 2) / Math.max(0.001, w.wave2.wavelength);
    uG2Speed.value = w.wave2.speed; uG2Amp.value = w.wave2.amp; uG2Steep.value = w.wave2.steepness;

    uG3DirX.value = w.wave3.dirX; uG3DirZ.value = w.wave3.dirZ;
    uG3K.value = (Math.PI * 2) / Math.max(0.001, w.wave3.wavelength);
    uG3Speed.value = w.wave3.speed; uG3Amp.value = w.wave3.amp; uG3Steep.value = w.wave3.steepness;

    uG4DirX.value = w.wave4.dirX; uG4DirZ.value = w.wave4.dirZ;
    uG4K.value = (Math.PI * 2) / Math.max(0.001, w.wave4.wavelength);
    uG4Speed.value = w.wave4.speed; uG4Amp.value = w.wave4.amp; uG4Steep.value = w.wave4.steepness;

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
    const bm = config.boat;
    if (keys.w) speed += bm.accel * dt;
    if (keys.s) speed -= bm.accel * dt * 0.7;
    speed *= Math.exp(-bm.drag * dt);
    speed = THREE.MathUtils.clamp(speed, -bm.maxSpeed * 0.35, bm.maxSpeed);

    if (keys.a) boat.rotation.y += bm.turnSpeed * dt * (speed >= 0 ? 1 : -1);
    if (keys.d) boat.rotation.y -= bm.turnSpeed * dt * (speed >= 0 ? 1 : -1);

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

    const ex = enemyShip.position.x;
    const ez = enemyShip.position.z;
    enemyShip.position.y = waveHeight(ex, ez, t) + 0.32;
    const nEnemy = waveNormal(ex, ez, t);
    enemyForward.set(Math.sin(enemyShip.rotation.y), 0, Math.cos(enemyShip.rotation.y));
    enemyRight.crossVectors(enemyForward, worldUp).normalize();
    const enemyPitch = Math.asin(THREE.MathUtils.clamp(-nEnemy.dot(enemyForward), -0.35, 0.35));
    const enemyRoll = Math.asin(THREE.MathUtils.clamp(nEnemy.dot(enemyRight), -0.4, 0.4));
    enemyShip.rotation.x = THREE.MathUtils.lerp(enemyShip.rotation.x, enemyPitch, 0.12);
    enemyShip.rotation.z = THREE.MathUtils.lerp(enemyShip.rotation.z, enemyRoll, 0.12);

    enemyShip.updateMatrixWorld(true);
    enemyHealthBarWorld.copy(enemyHealthBarLocal).applyMatrix4(enemyShip.matrixWorld);
    enemyHealthBar.sprite.position.copy(enemyHealthBarWorld);

    for (let i = cannonShotQueue.length - 1; i >= 0; i--) {
      const q = cannonShotQueue[i];
      if (t >= q.fireAt) {
        spawnCannonProjectile(q.muzzleIndex, q.powerScale, q.side);
        cannonShotQueue.splice(i, 1);
      }
    }

    updateCannonTrajectoryPreview(t);

    for (let i = cannonProjectiles.length - 1; i >= 0; i--) {
      const p = cannonProjectiles[i];
      p.age += dt;
      p.velocity.y -= config.combat.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const dx = p.mesh.position.x - p.spawnX;
      const dz = p.mesh.position.z - p.spawnZ;
      if (p.age > p.maxLife || dx * dx + dz * dz > p.maxRangeSq) {
        scene.remove(p.mesh);
        cannonProjectiles.splice(i, 1);
      }
    }

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
