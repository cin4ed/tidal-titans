import * as THREE from 'three/webgpu';

/** Procedural pirate ship; returns { group, mainSail, topSail, foreSail, flagMain, ...baseZ } for the animation loop. */
export function createPirateShip() {
  const boat = new THREE.Group();

  // ——— Materials ———
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b2412, roughness: 0.9, metalness: 0.02, flatShading: true });
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x5c3520, roughness: 0.85, metalness: 0.03, flatShading: true });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8, metalness: 0.03, flatShading: true });
  const woodDeck = new THREE.MeshStandardMaterial({ color: 0x9b7040, roughness: 0.75, metalness: 0.02, flatShading: true });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 1.0, metalness: 0.0, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.7, flatShading: true });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  const sailOld = new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, flatShading: true });
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });

  // ——— Hull body ———
  const hullMain = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 5.8), woodDark);
  hullMain.position.set(0, 0.15, 0);
  boat.add(hullMain);

  const hullUpper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 5.6), woodMid);
  hullUpper.position.set(0, 0.72, 0);
  boat.add(hullUpper);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 6.0), woodDark);
  keel.position.set(0, -0.22, 0);
  boat.add(keel);

  // ——— Bow (front) ———
  const bowGeo = new THREE.CylinderGeometry(0, 1.05, 2.2, 4, 1);
  const bow = new THREE.Mesh(bowGeo, woodDark);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.25, 3.45);
  boat.add(bow);

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

  const foreDeck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.4), woodDeck);
  foreDeck.position.set(0, 1.22, 2.1);
  boat.add(foreDeck);

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
  addRailing(1.1, 1.0, -1.85, 1.7, woodMid);
  addRailing(-1.1, 1.0, -1.85, 1.7, woodMid);
  for (let z = -1.6; z <= 1.5; z += 0.7) {
    for (const sx of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 4), woodMid);
      post.position.set(sx, 1.19, z);
      boat.add(post);
    }
  }

  // ——— Bowsprit ———
  const bowspritLen = 3.0;
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, bowspritLen, 6), woodLight);
  bowsprit.rotation.x = Math.PI / 2 - 0.3;
  bowsprit.position.set(0, 1.55, 3.55);
  boat.add(bowsprit);

  // ——— Main mast ———
  const mastMain = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 7.5, 8), woodLight);
  mastMain.position.set(0, 4.6, 0.3);
  boat.add(mastMain);

  const crowsNestRing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.22, 10, 1, true), woodMid);
  crowsNestRing.position.set(0, 6.65, 0.3);
  boat.add(crowsNestRing);
  const crowsNestFloor = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.07, 10), woodDeck);
  crowsNestFloor.position.set(0, 6.54, 0.3);
  boat.add(crowsNestFloor);

  const yardLow = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 4.8, 6), woodLight);
  yardLow.rotation.z = Math.PI / 2;
  yardLow.position.set(0, 3.2, 0.3);
  boat.add(yardLow);

  const yardHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.4, 6), woodLight);
  yardHigh.rotation.z = Math.PI / 2;
  yardHigh.position.set(0, 5.8, 0.3);
  boat.add(yardHigh);

  // ——— Foremast ———
  const mastFore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 8), woodLight);
  mastFore.position.set(0, 3.6, 2.35);
  boat.add(mastFore);

  const foreYard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 3.4, 6), woodLight);
  foreYard.rotation.z = Math.PI / 2;
  foreYard.position.set(0, 2.6, 2.35);
  boat.add(foreYard);

  // ——— Rigging ———
  function addRope(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 4), ropeMat);
    rope.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    rope.lookAt(x1, y1, z1);
    rope.rotateX(Math.PI / 2);
    boat.add(rope);
  }
  addRope(0, 7.85, 0.3, 0, 1.55, 4.2);
  addRope(0, 7.85, 0.3, 0, 1.42, -3.15);
  addRope(1.1, 1.0, 0.3, 0.06, 7.85, 0.3);
  addRope(-1.1, 1.0, 0.3, -0.06, 7.85, 0.3);
  addRope(0, 6.35, 2.35, 0, 1.22, 3.85);
  addRope(0, 3.9, 0.3, 0, 3.9, 2.35);

  // ——— Cannons ———
  const cannonPositions = [-1.2, 0.1, 1.6];
  for (const cz of cannonPositions) {
    for (const sx of [-1, 1]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.75, 8), metalMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(sx * 1.35, 0.78, cz);
      boat.add(barrel);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), woodDark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.2, 0.65, cz);
      boat.add(wheel);
    }
  }

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

  const mainSailGeo = makeSail(4.2, 2.6, 0.55, 8, 8);
  const mainSail = new THREE.Mesh(mainSailGeo, sailMat);
  mainSail.position.set(0.05, 3.22, 0.3);
  boat.add(mainSail);

  const topSailGeo = makeSail(2.9, 1.9, 0.4, 6, 6);
  const topSail = new THREE.Mesh(topSailGeo, sailOld);
  topSail.position.set(0.04, 5.82, 0.3);
  boat.add(topSail);

  const foreSailGeo = makeSail(3.0, 1.9, 0.45, 6, 6);
  const foreSail = new THREE.Mesh(foreSailGeo, sailOld);
  foreSail.position.set(0.04, 2.6, 2.35);
  boat.add(foreSail);

  {
    const jibGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([0, 0, 0, 0, 2.2, 0, 0, 0, 2.6]);
    jibGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    jibGeo.setIndex([0, 1, 2, 0, 2, 1]);
    jibGeo.computeVertexNormals();
    const jib = new THREE.Mesh(jibGeo, sailMat);
    jib.position.set(0, 1.3, 3);
    boat.add(jib);
  }

  const flagMain = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75, 4, 3), flagMat);
  flagMain.position.set(0.6, 7.85, 0.3);
  boat.add(flagMain);

  const pennantGeo = new THREE.BufferGeometry();
  const pv = new Float32Array([0, 0, 0, 0, 0, 0.9, 0, 0.35, 0]);
  pennantGeo.setAttribute('position', new THREE.BufferAttribute(pv, 3));
  pennantGeo.setIndex([0, 1, 2, 0, 2, 1]);
  pennantGeo.computeVertexNormals();
  const pennant = new THREE.Mesh(pennantGeo, new THREE.MeshBasicMaterial({ color: 0xcc2222, side: THREE.DoubleSide }));
  pennant.position.set(0, 6.35, 2.35);
  boat.add(pennant);

  boat.rotation.y = Math.PI;

  return {
    group: boat,
    mainSail,
    topSail,
    foreSail,
    flagMain,
    mainSailBaseZ: 0.3,
    topSailBaseZ: 0.3,
    foreSailBaseZ: 2.35,
  };
}
