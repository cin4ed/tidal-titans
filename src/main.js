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
  // TSL uniforms — updated every frame from oceanConfig so dev-panel sliders work live.

  // Wave displacement uniforms (shared formula with JS waveHeight)
  const uW1Freq  = uniform(oceanConfig.wave1.freq);
  const uW1Speed = uniform(oceanConfig.wave1.speed);
  const uW1Amp   = uniform(oceanConfig.wave1.amp);
  const uW2Freq  = uniform(oceanConfig.wave2.freq);
  const uW2Speed = uniform(oceanConfig.wave2.speed);
  const uW2Amp   = uniform(oceanConfig.wave2.amp);
  const uW3Freq  = uniform(oceanConfig.wave3.freq);
  const uW3Speed = uniform(oceanConfig.wave3.speed);
  const uW3Amp   = uniform(oceanConfig.wave3.amp);
  const uW4Freq  = uniform(oceanConfig.wave4.freq);
  const uW4Speed = uniform(oceanConfig.wave4.speed);
  const uW4Amp   = uniform(oceanConfig.wave4.amp);
  const uWaveVisualScale = uniform(oceanConfig.waveVisualScale);

  // Worley / refraction uniforms
  const uNoiseSpeed = uniform(oceanConfig.noiseSpeed);
  const uWorleyScale0 = uniform(oceanConfig.worleyScale0);
  const uWorleyScale1 = uniform(oceanConfig.worleyScale1);

  // ——— TSL vertex wave displacement ———
  // Mirrors JS waveHeight() exactly; positionLocal is object-space (plane lies in XZ).
  const px = positionLocal.x;
  const pz = positionLocal.z;

  const vY =
    sin(px.mul(uW1Freq).add(time.mul(uW1Speed))).mul(uW1Amp)
    .add(sin(pz.mul(uW2Freq).add(time.mul(uW2Speed))).mul(uW2Amp))
    .add(sin(px.add(pz).mul(uW3Freq).add(time.mul(uW3Speed))).mul(uW3Amp))
    .add(sin(px.mul(uW4Freq).add(pz.mul(0.8)).add(time.mul(uW4Speed))).mul(uW4Amp));

  const displacedPosition = positionLocal.add(vec3(0, vY.mul(uWaveVisualScale), 0));

  // Worley noise for surface color + refraction (samples world position after displacement)
  const t = time.mul(uNoiseSpeed);
  const floorUV = positionWorld.xzy;

  const waterLayer0 = mx_worley_noise_float(floorUV.mul(uWorleyScale0).add(t));
  const waterLayer1 = mx_worley_noise_float(floorUV.mul(uWorleyScale1).add(t));
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
  const uRefractionStrength = uniform(oceanConfig.refractionStrength);
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

  // ——— Boat (procedural pirate ship) ———
  // Returns { group, animatables } where animatables holds refs needed each frame.
  function createBoat() {
    const boat = new THREE.Group();

    // ——— Materials ———
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2412, roughness: 0.9, metalness: 0.02, flatShading: true });
    const woodMid  = new THREE.MeshStandardMaterial({ color: 0x5c3520, roughness: 0.85, metalness: 0.03, flatShading: true });
    const woodLight= new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8, metalness: 0.03, flatShading: true });
    const woodDeck = new THREE.MeshStandardMaterial({ color: 0x9b7040, roughness: 0.75, metalness: 0.02, flatShading: true });
    const ropeMat  = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 1.0, metalness: 0.0, flatShading: true });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.7, flatShading: true });
    const sailMat  = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, flatShading: true });
    const sailOld  = new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, flatShading: true });
    const flagMat  = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });

    // ——— Hull body ———
    // Main lower hull — tapered trapezoidal shape via scale tricks on a box
    const hullMain = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 5.8), woodDark);
    hullMain.position.set(0, 0.15, 0);
    boat.add(hullMain);

    // Upper hull strakes (planking sides) — slightly narrower, taller
    const hullUpper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 5.6), woodMid);
    hullUpper.position.set(0, 0.72, 0);
    boat.add(hullUpper);

    // Keel (bottom reinforcement strip)
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 6.0), woodDark);
    keel.position.set(0, -0.22, 0);
    boat.add(keel);

    // ——— Bow (front) ———
    // Bow wedge — points forward (+Z in local space; group is flipped π)
    const bowGeo = new THREE.CylinderGeometry(0, 1.05, 2.2, 4, 1);
    const bow = new THREE.Mesh(bowGeo, woodDark);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.25, 3.45);
    boat.add(bow);

    // Bow railing cap
    const bowCap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 0.35), woodLight);
    bowCap.position.set(0, 1.05, 2.95);
    boat.add(bowCap);

    // ——— Stern (aft) ———
    const stern = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.9), woodMid);
    stern.position.set(0, 0.8, -3.2);
    boat.add(stern);

    const sternTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.1), woodDeck);
    sternTop.position.set(0, 1.42, -3.1);
    boat.add(sternTop);

    // Stern decorative windows (inset boxes)
    for (let i = -1; i <= 1; i += 2) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.05), metalMat);
      win.position.set(i * 0.65, 0.85, -3.62);
      boat.add(win);
    }
    const winCenter = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.05), metalMat);
    winCenter.position.set(0, 0.85, -3.62);
    boat.add(winCenter);

    // ——— Main deck ———
    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 5.0), woodDeck);
    mainDeck.position.set(0, 1.0, -0.4);
    boat.add(mainDeck);

    // Fore deck (raised bow section)
    const foreDeck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.4), woodDeck);
    foreDeck.position.set(0, 1.22, 2.1);
    boat.add(foreDeck);

    // Aft deck (raised stern section)
    const aftDeck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.5), woodDeck);
    aftDeck.position.set(0, 1.42, -2.45);
    boat.add(aftDeck);

    // ——— Railings / bulwarks ———
    function addRailing(x, yBase, zStart, zEnd, mat) {
      const len = Math.abs(zEnd - zStart);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, len), mat);
      r.position.set(x, yBase + 0.175, (zStart + zEnd) / 2);
      boat.add(r);
    }
    addRailing( 1.1, 1.0, -1.85, 1.7, woodMid);
    addRailing(-1.1, 1.0, -1.85, 1.7, woodMid);
    // Railing posts along sides
    for (let z = -1.6; z <= 1.5; z += 0.7) {
      for (const sx of [-1.1, 1.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 4), woodMid);
        post.position.set(sx, 1.19, z);
        boat.add(post);
      }
    }

    // ——— Bowsprit (diagonal pole at front) ———
    const bowspritLen = 3.0;
    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, bowspritLen, 6), woodLight);
    bowsprit.rotation.x = Math.PI / 2 - 0.3;
    bowsprit.position.set(0, 1.55, 3.55);
    boat.add(bowsprit);

    // ——— Main mast ———
    const mastMain = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 7.5, 8), woodLight);
    mastMain.position.set(0, 4.6, 0.3);
    boat.add(mastMain);

    // Main mast crow's nest platform
    const crowsNestRing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.22, 10, 1, true), woodMid);
    crowsNestRing.position.set(0, 6.65, 0.3);
    boat.add(crowsNestRing);
    const crowsNestFloor = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.07, 10), woodDeck);
    crowsNestFloor.position.set(0, 6.54, 0.3);
    boat.add(crowsNestFloor);

    // Main lower yardarm
    const yardLow = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 4.8, 6), woodLight);
    yardLow.rotation.z = Math.PI / 2;
    yardLow.position.set(0, 3.2, 0.3);
    boat.add(yardLow);

    // Main upper yardarm
    const yardHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.4, 6), woodLight);
    yardHigh.rotation.z = Math.PI / 2;
    yardHigh.position.set(0, 5.8, 0.3);
    boat.add(yardHigh);

    // ——— Foremast (forward mast) ———
    const mastFore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 8), woodLight);
    mastFore.position.set(0, 3.6, 2.35);
    boat.add(mastFore);

    const foreYard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 3.4, 6), woodLight);
    foreYard.rotation.z = Math.PI / 2;
    foreYard.position.set(0, 2.6, 2.35);
    boat.add(foreYard);

    // ——— Rigging ropes (simple cylinder approximations) ———
    function addRope(x0, y0, z0, x1, y1, z1) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 4), ropeMat);
      rope.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      rope.lookAt(x1, y1, z1);
      rope.rotateX(Math.PI / 2);
      boat.add(rope);
    }
    // Stays from main mast top to bow and stern
    addRope(0, 7.85, 0.3,   0, 1.55, 4.2);   // forestay
    addRope(0, 7.85, 0.3,   0, 1.42, -3.15); // backstay
    // Shrouds from main mast to side railings
    addRope( 1.1, 1.0, 0.3, 0.06, 7.85, 0.3);
    addRope(-1.1, 1.0, 0.3, -0.06, 7.85, 0.3);
    // Forestay to foremast
    addRope(0, 6.35, 2.35, 0, 1.22, 3.85);
    // Cross-brace foremast to main
    addRope(0, 3.9, 0.3, 0, 3.9, 2.35);

    // ——— Cannons (3 per side) ———
    const cannonPositions = [-1.2, 0.1, 1.6];
    for (const cz of cannonPositions) {
      for (const sx of [-1, 1]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.75, 8), metalMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(sx * 1.35, 0.78, cz);
        boat.add(barrel);
        // Carriage wheel
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), woodDark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * 1.2, 0.65, cz);
        boat.add(wheel);
      }
    }

    // ——— Main sail (large, with vertex bulge) ———
    function makeSail(width, height, bulgeAmt, wSeg, hSeg) {
      const geo = new THREE.PlaneGeometry(width, height, wSeg, hSeg);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const normX = x / (width / 2);
        const normY = (y + height / 2) / height;
        const bulge = Math.sin(normX * Math.PI) * Math.sin(normY * Math.PI * 0.9 + 0.05) * bulgeAmt;
        pos.setZ(i, bulge);
      }
      geo.computeVertexNormals();
      return geo;
    }

    // Main lower sail
    const mainSailGeo = makeSail(4.2, 2.6, 0.55, 8, 8);
    const mainSail = new THREE.Mesh(mainSailGeo, sailMat);
    mainSail.position.set(0.05, 3.22, 0.3);
    boat.add(mainSail);

    // Main upper sail
    const topSailGeo = makeSail(2.9, 1.9, 0.4, 6, 6);
    const topSail = new THREE.Mesh(topSailGeo, sailOld);
    topSail.position.set(0.04, 5.82, 0.3);
    boat.add(topSail);

    // Fore sail
    const foreSailGeo = makeSail(3.0, 1.9, 0.45, 6, 6);
    const foreSail = new THREE.Mesh(foreSailGeo, sailOld);
    foreSail.position.set(0.04, 2.6, 2.35);
    boat.add(foreSail);

    // Triangular bowsprit sail (jib) — simplified as thin triangle via custom geo
    {
      const jibGeo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        0, 0, 0,
        0, 2.2, 0,
        0, 0, 2.6,
      ]);
      jibGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      jibGeo.setIndex([0, 1, 2, 0, 2, 1]);
      jibGeo.computeVertexNormals();
      const jib = new THREE.Mesh(jibGeo, sailMat);
      jib.position.set(0, 1.3, 1.6);
      boat.add(jib);
    }

    // ——— Skull-and-crossbones flag at main mast top ———
    const flagMain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75, 4, 3), flagMat);
    flagMain.position.set(0.6, 7.85, 0.3);
    boat.add(flagMain);

    // Pennant at fore mast
    const pennantGeo = new THREE.BufferGeometry();
    const pv = new Float32Array([
      0, 0, 0,
      0, 0, 0.9,
      0, 0.35, 0,
    ]);
    pennantGeo.setAttribute('position', new THREE.BufferAttribute(pv, 3));
    pennantGeo.setIndex([0, 1, 2, 0, 2, 1]);
    pennantGeo.computeVertexNormals();
    const pennant = new THREE.Mesh(pennantGeo, new THREE.MeshBasicMaterial({ color: 0xcc2222, side: THREE.DoubleSide }));
    pennant.position.set(0, 6.35, 2.35);
    boat.add(pennant);

    boat.rotation.y = Math.PI;

    // Return animatable refs so the loop can flutter sails/flag each frame
    return {
      group: boat,
      mainSail,
      topSail,
      foreSail,
      flagMain,
      // Store base positions/rotations for oscillation
      mainSailBaseZ: 0.3,
      topSailBaseZ:  0.3,
      foreSailBaseZ: 2.35,
    };
  }

  const boatObj = createBoat();
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

    // Sync TSL uniforms from oceanConfig (live dev-panel + exported defaults)
    const c = oceanConfig;
    uW1Freq.value  = c.wave1.freq;  uW1Speed.value = c.wave1.speed; uW1Amp.value = c.wave1.amp;
    uW2Freq.value  = c.wave2.freq;  uW2Speed.value = c.wave2.speed; uW2Amp.value = c.wave2.amp;
    uW3Freq.value  = c.wave3.freq;  uW3Speed.value = c.wave3.speed; uW3Amp.value = c.wave3.amp;
    uW4Freq.value  = c.wave4.freq;  uW4Speed.value = c.wave4.speed; uW4Amp.value = c.wave4.amp;
    uWaveVisualScale.value = c.waveVisualScale;
    uNoiseSpeed.value = c.noiseSpeed;
    uWorleyScale0.value = c.worleyScale0;
    uWorleyScale1.value = c.worleyScale1;
    uRefractionStrength.value = c.refractionStrength;

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
