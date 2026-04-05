import * as THREE from 'three';
import oceanConfig from './config.js';

// ——— Wave height (must match vertex shader) ———
// Reads wave parameters from oceanConfig so JS physics and GLSL stay in sync.
function waveHeight(x, z, time) {
  const { wave1, wave2, wave3, wave4 } = oceanConfig;
  let h = 0;
  h += Math.sin(x * wave1.freq + time * wave1.speed) * wave1.amp;
  h += Math.sin(z * wave2.freq + time * wave2.speed) * wave2.amp;
  h += Math.sin((x + z) * wave3.freq + time * wave3.speed) * wave3.amp;
  h += Math.sin(x * wave4.freq + z * 0.8 + time * wave4.speed) * wave4.amp;
  return h;
}

function waveNormal(x, z, time, eps = 0.15) {
  const hx =
    waveHeight(x + eps, z, time) - waveHeight(x - eps, z, time);
  const hz =
    waveHeight(x, z + eps, time) - waveHeight(x, z - eps, time);
  const nx = -hx / (2 * eps);
  const nz = -hz / (2 * eps);
  const len = Math.hypot(nx, 1, nz) || 1;
  return new THREE.Vector3(nx / len, 1 / len, nz / len);
}

// Helper: convert hex color string to a THREE.Color
function hexToColor(hex) {
  return new THREE.Color(hex);
}

// ——— Scene ———
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, oceanConfig.fogNear, oceanConfig.fogFar);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Sky gradient (canvas texture)
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2;
skyCanvas.height = 256;
const sctx = skyCanvas.getContext('2d');
const grad = sctx.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#4a9eff');
grad.addColorStop(0.45, '#87ceeb');
grad.addColorStop(1, '#b8e4ff');
sctx.fillStyle = grad;
sctx.fillRect(0, 0, 2, 256);
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;

// Lights
const ambient = new THREE.AmbientLight(0xb8d4ff, 0.55);
scene.add(ambient);

const sunDir = new THREE.Vector3(0.45, 0.85, 0.25).normalize();
const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.15);
sunLight.position.copy(sunDir).multiplyScalar(80);
scene.add(sunLight);

// Sun orb (decorative)
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xffee88, fog: false })
);
sunMesh.position.copy(sunDir).multiplyScalar(140);
scene.add(sunMesh);

// ——— Ocean shader ———
// Wave params are passed as vec3 uniforms: x=freq, y=speed, z=amp.
// The GLSL waveHeight mirrors the JS waveHeight formula exactly.
const oceanVertexShader = `
  uniform float uTime;
  uniform vec3 uWave1;
  uniform vec3 uWave2;
  uniform vec3 uWave3;
  uniform vec3 uWave4;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  float waveHeight(vec2 pos, float t) {
    float h = 0.0;
    h += sin(pos.x * uWave1.x + t * uWave1.y) * uWave1.z;
    h += sin(pos.y * uWave2.x + t * uWave2.y) * uWave2.z;
    h += sin((pos.x + pos.y) * uWave3.x + t * uWave3.y) * uWave3.z;
    h += sin(pos.x * uWave4.x + pos.y * 0.8 + t * uWave4.y) * uWave4.z;
    return h;
  }

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float x = worldPos.x;
    float z = worldPos.z;
    float h = waveHeight(vec2(x, z), uTime);
    vec3 displaced = worldPos.xyz + vec3(0.0, h, 0.0);

    float eps = 0.12;
    float hx = waveHeight(vec2(x + eps, z), uTime) - waveHeight(vec2(x - eps, z), uTime);
    float hz = waveHeight(vec2(x, z + eps), uTime) - waveHeight(vec2(x, z - eps), uTime);
    vec3 n = normalize(vec3(-hx / (2.0 * eps), 1.0, -hz / (2.0 * eps)));
    vNormal = n;
    vWorldPos = displaced;
    vHeight = h;

    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const oceanFragmentShader = `
  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uLightColor;
  uniform vec3 uFoamColor;

  uniform float uToonSteps;
  uniform float uSpecPower;
  uniform float uSpecThreshold;
  uniform float uSpecIntensity;
  uniform float uFresnelPower;
  uniform float uFresnelIntensity;
  uniform float uFoamStart;
  uniform float uFoamEnd;
  uniform float uFoamMax;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(uCameraPos - vWorldPos);

    float ndl = max(dot(N, L), 0.0);
    float toon = floor(ndl * uToonSteps) / uToonSteps;

    float band = smoothstep(-0.35, 0.9, vHeight);
    vec3 base = mix(uDeepColor, uMidColor, band);
    base = mix(base, uLightColor, smoothstep(0.2, 1.0, vHeight) * 0.65);

    vec3 lit = base * (0.35 + 0.85 * toon);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uSpecPower);
    spec = step(uSpecThreshold, spec) * uSpecIntensity;

    float fresnel = pow(1.0 - max(dot(V, N), 0.0), uFresnelPower);
    lit += vec3(0.5, 0.85, 1.0) * fresnel * uFresnelIntensity;

    float foam = smoothstep(uFoamStart, uFoamEnd, vHeight);
    foam += smoothstep(0.15, 0.45, 1.0 - ndl) * 0.15;
    lit = mix(lit, uFoamColor, clamp(foam, 0.0, uFoamMax));

    lit += vec3(1.0, 0.95, 0.8) * spec;

    float dist = length(uCameraPos - vWorldPos);
    float fogF = smoothstep(uFogNear, uFogFar, dist);
    lit = mix(lit, uFogColor, fogF);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

const oceanUniforms = {
  uTime:      { value: 0 },
  uSunDir:    { value: sunDir.clone() },
  uCameraPos: { value: new THREE.Vector3() },
  uFogColor:  { value: new THREE.Color(0x87ceeb) },
  uFogNear:   { value: oceanConfig.fogNear },
  uFogFar:    { value: oceanConfig.fogFar },

  // Wave layer params (x=freq, y=speed, z=amp)
  uWave1: { value: new THREE.Vector3(oceanConfig.wave1.freq, oceanConfig.wave1.speed, oceanConfig.wave1.amp) },
  uWave2: { value: new THREE.Vector3(oceanConfig.wave2.freq, oceanConfig.wave2.speed, oceanConfig.wave2.amp) },
  uWave3: { value: new THREE.Vector3(oceanConfig.wave3.freq, oceanConfig.wave3.speed, oceanConfig.wave3.amp) },
  uWave4: { value: new THREE.Vector3(oceanConfig.wave4.freq, oceanConfig.wave4.speed, oceanConfig.wave4.amp) },

  // Colors
  uDeepColor:  { value: hexToColor(oceanConfig.deepColor) },
  uMidColor:   { value: hexToColor(oceanConfig.midColor) },
  uLightColor: { value: hexToColor(oceanConfig.lightColor) },
  uFoamColor:  { value: hexToColor(oceanConfig.foamColor) },

  // Toon
  uToonSteps: { value: oceanConfig.toonSteps },

  // Specular
  uSpecPower:     { value: oceanConfig.specPower },
  uSpecThreshold: { value: oceanConfig.specThreshold },
  uSpecIntensity: { value: oceanConfig.specIntensity },

  // Fresnel
  uFresnelPower:     { value: oceanConfig.fresnelPower },
  uFresnelIntensity: { value: oceanConfig.fresnelIntensity },

  // Foam
  uFoamStart: { value: oceanConfig.foamStart },
  uFoamEnd:   { value: oceanConfig.foamEnd },
  uFoamMax:   { value: oceanConfig.foamMax },
};

const oceanGeom = new THREE.PlaneGeometry(220, 220, 160, 160);
const oceanMat = new THREE.ShaderMaterial({
  uniforms: oceanUniforms,
  vertexShader: oceanVertexShader,
  fragmentShader: oceanFragmentShader,
  side: THREE.DoubleSide,
});

const ocean = new THREE.Mesh(oceanGeom, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = 0;
scene.add(ocean);

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

  const hullGeo = new THREE.BoxGeometry(2.2, 0.55, 4.2);
  const hull = new THREE.Mesh(hullGeo, wood);
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

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8),
    woodLight
  );
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

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.35),
    flagMat
  );
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
// yaw = horizontal orbit angle around the boat (relative to boat facing direction)
// pitch = vertical angle from horizon
const camOrbit = {
  yaw: Math.PI,      // start behind the boat (180° = behind in world space)
  pitch: 0.42,       // ~24° down — comfortable over-the-shoulder view
  distance: 12,
  sensitivity: 0.0022,
  pitchMin: 0.05,    // almost horizontal
  pitchMax: Math.PI / 2 - 0.05, // almost straight down
};

// ——— Pointer Lock ———
let pointerLocked = false;

renderer.domElement.addEventListener('click', () => {
  if (!pointerLocked) {
    renderer.domElement.requestPointerLock();
  }
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
  camOrbit.pitch = THREE.MathUtils.clamp(
    camOrbit.pitch,
    camOrbit.pitchMin,
    camOrbit.pitchMax
  );
});

// ——— Reusable vectors ———
const clock = new THREE.Clock();
const boatForward = new THREE.Vector3(0, 0, 1);
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const rightVec = new THREE.Vector3();
const _color = new THREE.Color();

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// ——— Sync oceanConfig → uniforms (called each frame) ———
function syncUniforms() {
  const c = oceanConfig;

  oceanUniforms.uWave1.value.set(c.wave1.freq, c.wave1.speed, c.wave1.amp);
  oceanUniforms.uWave2.value.set(c.wave2.freq, c.wave2.speed, c.wave2.amp);
  oceanUniforms.uWave3.value.set(c.wave3.freq, c.wave3.speed, c.wave3.amp);
  oceanUniforms.uWave4.value.set(c.wave4.freq, c.wave4.speed, c.wave4.amp);

  oceanUniforms.uDeepColor.value.set(c.deepColor);
  oceanUniforms.uMidColor.value.set(c.midColor);
  oceanUniforms.uLightColor.value.set(c.lightColor);
  oceanUniforms.uFoamColor.value.set(c.foamColor);

  oceanUniforms.uToonSteps.value     = c.toonSteps;
  oceanUniforms.uSpecPower.value     = c.specPower;
  oceanUniforms.uSpecThreshold.value = c.specThreshold;
  oceanUniforms.uSpecIntensity.value = c.specIntensity;

  oceanUniforms.uFresnelPower.value     = c.fresnelPower;
  oceanUniforms.uFresnelIntensity.value = c.fresnelIntensity;

  oceanUniforms.uFoamStart.value = c.foamStart;
  oceanUniforms.uFoamEnd.value   = c.foamEnd;
  oceanUniforms.uFoamMax.value   = c.foamMax;

  oceanUniforms.uFogNear.value = c.fogNear;
  oceanUniforms.uFogFar.value  = c.fogFar;
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  syncUniforms();
  oceanUniforms.uTime.value = t;
  oceanUniforms.uCameraPos.value.copy(camera.position);

  // ——— Boat movement ———
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
  const wh = waveHeight(wx, wz, t);
  boat.position.y = wh + 0.35;

  const n = waveNormal(wx, wz, t);
  rightVec.crossVectors(boatForward, worldUp).normalize();
  const boatPitch = Math.asin(THREE.MathUtils.clamp(-n.dot(boatForward), -0.35, 0.35));
  const boatRoll = Math.asin(THREE.MathUtils.clamp(n.dot(rightVec), -0.4, 0.4));
  boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, boatPitch, 0.12);
  boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, boatRoll, 0.12);

  // ——— Orbit camera around boat ———
  // Convert spherical (yaw, pitch) to world offset.
  // yaw is absolute world angle so the camera doesn't spin when the boat turns.
  const sinYaw = Math.sin(camOrbit.yaw);
  const cosYaw = Math.cos(camOrbit.yaw);
  const sinPitch = Math.sin(camOrbit.pitch);
  const cosPitch = Math.cos(camOrbit.pitch);

  // Orbit anchor: slightly above deck
  camTarget.copy(boat.position);
  camTarget.y += 1.5;

  // Camera position on sphere around anchor
  camDesired.set(
    camTarget.x + camOrbit.distance * cosPitch * sinYaw,
    camTarget.y + camOrbit.distance * sinPitch,
    camTarget.z + camOrbit.distance * cosPitch * cosYaw
  );

  camera.position.lerp(camDesired, 0.1);
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
});

// ——— Dev panel (development only) ———
if (import.meta.env.DEV) {
  import('./dev-panel.js').then(({ mountDevPanel }) => {
    mountDevPanel(oceanConfig);
  });
}
