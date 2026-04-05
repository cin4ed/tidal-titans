import * as THREE from 'three/webgpu';
import {
  color,
  vec2,
  pass,
  linearDepth,
  normalWorld,
  objectPosition,
  screenUV,
  viewportLinearDepth,
  viewportDepthTexture,
  viewportSharedTexture,
  mx_worley_noise_float,
  positionWorld,
  time,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

import oceanConfig from './config.js';

// ——— Wave height (CPU side, for boat physics only) ———
// The visual water is rendered via TSL refraction; this formula only drives
// the boat bobbing and tilt — so the GLSL/TSL sync constraint is gone.
function waveHeight(x, z, t) {
  const { wave1, wave2, wave3, wave4 } = oceanConfig;
  let h = 0;
  h += Math.sin(x * wave1.freq + t * wave1.speed) * wave1.amp;
  h += Math.sin(z * wave2.freq + t * wave2.speed) * wave2.amp;
  h += Math.sin((x + z) * wave3.freq + t * wave3.speed) * wave3.amp;
  h += Math.sin(x * wave4.freq + z * 0.8 + t * wave4.speed) * wave4.amp;
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
  scene.fog = new THREE.Fog(0x0487e2, oceanConfig.fogNear, oceanConfig.fogFar);

  // TSL gradient sky — replaces the canvas texture sky
  scene.backgroundNode = normalWorld.y.mix(
    color(oceanConfig.waterColorDeep),
    color(0x0066ff)
  );

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
  // Animating worley noise drives both the surface color and refraction UV offset.
  const t = time.mul(oceanConfig.noiseSpeed);
  const floorUV = positionWorld.xzy;

  const waterLayer0 = mx_worley_noise_float(floorUV.mul(4).add(t));
  const waterLayer1 = mx_worley_noise_float(floorUV.mul(2).add(t));
  const waterIntensity = waterLayer0.mul(waterLayer1);

  const waterColorDeep  = color(oceanConfig.waterColorDeep);
  const waterColorLight = color(oceanConfig.waterColorLight);
  const waterColor = waterIntensity.mul(1.4).mix(waterColorDeep, waterColorLight);

  // linearDepth() = linear depth of this mesh's fragment
  const depth = linearDepth();

  // Depth of what's behind the water: viewportLinearDepth - depth
  const depthWater = viewportLinearDepth.sub(depth);
  const depthEffect = depthWater.remapClamp(oceanConfig.depthNear, oceanConfig.depthFar);

  // Refraction: offset screen UV by the water noise, then depth-test so
  // objects above the water surface are never refracted
  const refractionUV = screenUV.add(
    vec2(0, waterIntensity.mul(oceanConfig.refractionStrength))
  );
  const depthTestForRefraction = linearDepth(viewportDepthTexture(refractionUV)).sub(depth);
  const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1);

  // If refraction UV would sample something in front of the water, fall back to un-distorted UV
  const finalUV = depthTestForRefraction.lessThan(0).select(screenUV, refractionUV);

  const viewportTex = viewportSharedTexture(finalUV);

  const waterMaterial = new THREE.MeshBasicNodeMaterial();
  waterMaterial.colorNode = waterColor;
  waterMaterial.backdropNode = depthEffect.mix(
    viewportSharedTexture(),
    viewportTex.mul(depthRefraction.mix(1, waterColor))
  );
  waterMaterial.backdropAlphaNode = depthRefraction.oneMinus();
  waterMaterial.transparent = true;

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(220, 0.001, 220),
    waterMaterial
  );
  water.position.set(0, 0, 0);
  scene.add(water);

  // ——— Boat (procedural) ———
  function createBoat() {
    const boat = new THREE.Group();

    const wood = new THREE.MeshStandardMaterial({
      color: 0x5c3d2e,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });
    const woodLight = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.8,
      metalness: 0.05,
      flatShading: true,
    });
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e6,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const flagMat = new THREE.MeshBasicMaterial({
      color: 0xe63946,
      side: THREE.DoubleSide,
    });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 4.2), wood);
    hull.position.y = 0.35;
    boat.add(hull);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 4), wood);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.35, 2.35);
    boat.add(bow);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 2.8), woodLight);
    deck.position.set(0, 0.62, -0.2);
    boat.add(deck);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8), woodLight);
    mast.position.set(0, 2.0, 0.2);
    boat.add(mast);

    const sailGeo = new THREE.PlaneGeometry(1.6, 2.4, 6, 8);
    const pos = sailGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const bulge = Math.sin((y + 1.2) * 1.2) * 0.12 * (1.0 - Math.abs(x) * 0.35);
      pos.setZ(i, pos.getZ(i) + bulge);
    }
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0.15, 2.2, 0.35);
    sail.rotation.y = Math.PI / 2;
    boat.add(sail);

    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), flagMat);
    flag.position.set(0, 3.35, 0.2);
    flag.rotation.y = Math.PI / 2;
    boat.add(flag);

    boat.rotation.y = Math.PI;
    return boat;
  }

  const boat = createBoat();
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
  const camOrbit = {
    yaw: Math.PI,
    pitch: 0.42,
    distance: 12,
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
    if (hint) {
      hint.textContent = pointerLocked
        ? 'WASD — Navegar · Mouse — Girar cámara · ESC — Liberar cursor'
        : 'Click para capturar cursor · WASD — Navegar el barco';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    camOrbit.yaw -= e.movementX * camOrbit.sensitivity;
    camOrbit.pitch += e.movementY * camOrbit.sensitivity;
    camOrbit.pitch = THREE.MathUtils.clamp(camOrbit.pitch, camOrbit.pitchMin, camOrbit.pitchMax);
  });

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

    // Animate underwater objects
    for (const obj of underwaterObjects.children) {
      obj.position.y += Math.sin(t * 0.7 + obj.id) * 0.003;
      obj.rotation.y += dt * 0.15;
    }

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

    // Orbit camera
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
      mountDevPanel(oceanConfig);
    });
  }
}

init().catch(console.error);
