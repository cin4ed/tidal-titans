import * as THREE from 'three/webgpu';

/** Smaller enemy sloop — distinct palette vs player ship; bow along local +Z after rotation.y = π. */
export function createEnemyShip() {
  const boat = new THREE.Group();

  const woodDark = new THREE.MeshStandardMaterial({
    color: 0x3d3d48,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });
  const woodMid = new THREE.MeshStandardMaterial({
    color: 0x50505c,
    roughness: 0.82,
    metalness: 0.05,
    flatShading: true,
  });
  const woodDeck = new THREE.MeshStandardMaterial({
    color: 0x6a5c52,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2c2c34,
    roughness: 0.55,
    metalness: 0.75,
    flatShading: true,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0x7a1f2e,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  // Hull
  const hullMain = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 4.2), woodDark);
  hullMain.position.set(0, 0.12, 0);
  boat.add(hullMain);

  const hullUpper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 4.0), woodMid);
  hullUpper.position.set(0, 0.58, 0);
  boat.add(hullUpper);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 4.35), woodDark);
  keel.position.set(0, -0.18, 0);
  boat.add(keel);

  // Bow (+Z)
  const bowGeo = new THREE.ConeGeometry(0.78, 1.65, 4, 1);
  const bow = new THREE.Mesh(bowGeo, woodDark);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.2, 3.52);
  boat.add(bow);

  const bowCap = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.28), woodMid);
  bowCap.position.set(0, 0.82, 2.62);
  boat.add(bowCap);

  // Stern
  const stern = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.72), woodMid);
  stern.position.set(0, 0.65, -2.35);
  boat.add(stern);

  // Deck
  const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 3.5), woodDeck);
  mainDeck.position.set(0, 0.82, -0.35);
  boat.add(mainDeck);

  const foreDeck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.05), woodDeck);
  foreDeck.position.set(0, 0.98, 1.65);
  boat.add(foreDeck);

  // Railings (short)
  function addRailing(x, yBase, zStart, zEnd, mat) {
    const len = Math.abs(zEnd - zStart);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, len), mat);
    r.position.set(x, yBase + 0.14, (zStart + zEnd) / 2);
    boat.add(r);
  }
  addRailing(0.82, 0.82, -1.35, 1.15, woodMid);
  addRailing(-0.82, 0.82, -1.35, 1.15, woodMid);

  // Bowsprit
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 2.2, 6), woodMid);
  bowsprit.rotation.x = Math.PI / 2 - 0.28;
  bowsprit.position.set(0, 1.12, 3.45);
  boat.add(bowsprit);

  // Single mast + yard + sail
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 5.2, 8), woodMid);
  mast.position.set(0, 3.35, 0.15);
  boat.add(mast);

  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.6, 6), woodMid);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 2.45, 0.15);
  boat.add(yard);

  const sailGeo = new THREE.PlaneGeometry(2.8, 2.2, 6, 5);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0.02, 2.45, 0.15);
  sail.rotation.y = Math.PI / 2;
  boat.add(sail);

  // Small pennant (grey — no player-style colors)
  const pennantGeo = new THREE.BufferGeometry();
  const pv = new Float32Array([0, 0, 0, 0, 0, 0.55, 0, 0.22, 0]);
  pennantGeo.setAttribute('position', new THREE.BufferAttribute(pv, 3));
  pennantGeo.setIndex([0, 1, 2, 0, 2, 1]);
  pennantGeo.computeVertexNormals();
  const pennant = new THREE.Mesh(
    pennantGeo,
    new THREE.MeshBasicMaterial({ color: 0x6a7080, side: THREE.DoubleSide })
  );
  pennant.position.set(0, 5.55, 0.15);
  boat.add(pennant);

  // Port gunports (decorative)
  for (let z = -0.9; z <= 0.9; z += 0.9) {
    const gp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.18), metalMat);
    gp.position.set(-0.93, 0.45, z);
    boat.add(gp);
  }

  boat.rotation.y = Math.PI;

  return { group: boat };
}
