import * as THREE from 'three/webgpu';

/**
 * World-space sprite health bar (faces camera). Position should be set each frame from the ship matrixWorld.
 */
export function createEnemyHealthBar() {
  const W = 256;
  const H = 44;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  function draw(health) {
    const h = THREE.MathUtils.clamp(health, 0, 1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12, 10, 16, 0.94)';
    ctx.fillRect(0, 0, W, H);
    const pad = 5;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;
    ctx.fillStyle = '#2c1820';
    ctx.fillRect(pad, pad, innerW, innerH);
    const fillW = innerW * h;
    ctx.fillStyle = h > 0.28 ? '#e83838' : '#9a2222';
    ctx.fillRect(pad, pad, fillW, innerH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 0.5, pad + 0.5, innerW - 1, innerH - 1);
  }

  draw(1);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  material.sizeAttenuation = true;

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 500;
  sprite.center.set(0.5, 0.5);
  sprite.scale.set(3.4, 0.58, 1);

  function setHealth(health) {
    draw(health);
    map.needsUpdate = true;
  }

  function dispose() {
    map.dispose();
    material.dispose();
  }

  return { sprite, setHealth, dispose };
}
