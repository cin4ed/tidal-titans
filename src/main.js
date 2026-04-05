import * as THREE from 'three';

// ——— Wave height (must match vertex shader) ———
function waveHeight(x, z, time) {
  let h = 0;
  h += Math.sin(x * 0.5 + time * 1.2) * 0.6;
  h += Math.sin(z * 0.7 + time * 0.8) * 0.4;
  h += Math.sin((x + z) * 0.3 + time * 1.5) * 0.3;
  h += Math.sin(x * 1.5 + z * 0.8 + time * 2.0) * 0.15;
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

// ——— Scene ———
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 35, 120);

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
const oceanVertexShader = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  float waveHeight(vec2 pos, float t) {
    float h = 0.0;
    h += sin(pos.x * 0.5 + t * 1.2) * 0.6;
    h += sin(pos.y * 0.7 + t * 0.8) * 0.4;
    h += sin((pos.x + pos.y) * 0.3 + t * 1.5) * 0.3;
    h += sin(pos.x * 1.5 + pos.y * 0.8 + t * 2.0) * 0.15;
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
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(uCameraPos - vWorldPos);

    float ndl = max(dot(N, L), 0.0);
    float toon = floor(ndl * 4.0) / 4.0;

    vec3 deepColor = vec3(0.02, 0.18, 0.48);
    vec3 midColor  = vec3(0.05, 0.42, 0.72);
    vec3 lightCol  = vec3(0.25, 0.75, 0.95);
    vec3 foamColor = vec3(0.92, 0.97, 1.0);

    float band = smoothstep(-0.35, 0.9, vHeight);
    vec3 base = mix(deepColor, midColor, band);
    base = mix(base, lightCol, smoothstep(0.2, 1.0, vHeight) * 0.65);

    vec3 lit = base * (0.35 + 0.85 * toon);

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0);
    spec = step(0.35, spec) * 0.85;

    float fresnel = pow(1.0 - max(dot(V, N), 0.0), 3.0);
    lit += vec3(0.5, 0.85, 1.0) * fresnel * 0.35;

    float foam = smoothstep(0.55, 1.05, vHeight);
    foam += smoothstep(0.15, 0.45, 1.0 - ndl) * 0.15;
    lit = mix(lit, foamColor, clamp(foam, 0.0, 0.85));

    lit += vec3(1.0, 0.95, 0.8) * spec;

    float dist = length(uCameraPos - vWorldPos);
    float fogF = smoothstep(uFogNear, uFogFar, dist);
    lit = mix(lit, uFogColor, fogF);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

const oceanUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir.clone() },
  uCameraPos: { value: new THREE.Vector3() },
  uFogColor: { value: new THREE.Color(0x87ceeb) },
  uFogNear: { value: 35 },
  uFogFar: { value: 120 },
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

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

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
