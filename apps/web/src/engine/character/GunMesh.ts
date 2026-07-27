import * as THREE from "three";

/**
 * The player's rifle, hand-built from primitives — ported from Valor's GunMesh
 * (Marvy's own codebase). Low-poly but PBR-shaded: blued steel + molded polymer
 * that reflect the scene HDRI (via scene.environment), so it reads as a real
 * tactical weapon rather than a toy, and stays a lightweight procedural mesh (no
 * binary to load).
 *
 * Convention (matches the hand-grip socket in PlayerRig):
 *   - local +Z is the firing direction, +Y is up,
 *   - the ORIGIN sits at the pistol grip (where the palm wraps).
 */

const METAL_DARK = 0x2b313a; // receivers, slides — blued steel that catches light
const METAL = 0x3c434e; // secondary metal — parkerised grey
const POLYMER = 0x363b43; // furniture: grips, stocks, handguards
const POLYMER_DARK = 0x21252b;
const ACCENT = 0x5c7f63; // field green — the disciplined single accent
const ACCENT_GLOW = 0.06;

interface GunKit {
  body: THREE.Material;
  metal: THREE.Material;
  furn: THREE.Material;
  furnDark: THREE.Material;
  accent: THREE.Material;
  group: THREE.Group;
}

/** Molded-polymer furniture: matte with a faint clearcoat sheen, not shiny. */
function polymer(color: number, roughness: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.0,
    roughness,
    clearcoat: 0.35,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.8,
  });
}

function makeKit(): GunKit {
  return {
    // Blued/parkerised steel: high metalness, mid-low roughness, strong envMap so
    // it catches reflections and reads as metal.
    body: new THREE.MeshStandardMaterial({ color: METAL_DARK, metalness: 0.95, roughness: 0.3, envMapIntensity: 1.8 }),
    metal: new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.5 }),
    furn: polymer(POLYMER, 0.58),
    furnDark: polymer(POLYMER_DARK, 0.62),
    accent: new THREE.MeshStandardMaterial({
      color: ACCENT,
      metalness: 0.55,
      roughness: 0.35,
      emissive: ACCENT,
      emissiveIntensity: ACCENT_GLOW * 0.4,
      envMapIntensity: 1.0,
    }),
    group: new THREE.Group(),
  };
}

// Positioned box/cylinder helpers keep the builder readable.
function box(
  k: GunKit,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  k.group.add(m);
  return m;
}

/** Cylinder whose axis runs along local +Z (the barrel direction). */
function zCyl(
  k: GunKit,
  mat: THREE.Material,
  r0: number,
  r1: number,
  len: number,
  x: number,
  y: number,
  z: number,
  sides = 24
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, sides), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  k.group.add(m);
  return m;
}

/** Full-size assault rifle: curved mag, fixed stock, muzzle brake. */
export function makeRifle(): THREE.Group {
  const k = makeKit();

  // lower + upper receiver
  box(k, k.metal, 0.042, 0.05, 0.24, 0, 0.04, 0.01);
  box(k, k.body, 0.044, 0.046, 0.26, 0, 0.086, 0.02);
  // carry rail
  box(k, k.furnDark, 0.02, 0.012, 0.24, 0, 0.116, 0.02);
  // handguard with side rails + vents
  box(k, k.furn, 0.046, 0.052, 0.2, 0, 0.072, 0.25);
  box(k, k.accent, 0.002, 0.01, 0.16, 0.024, 0.072, 0.25);
  box(k, k.accent, 0.002, 0.01, 0.16, -0.024, 0.072, 0.25);
  for (let i = 0; i < 3; i++) box(k, k.furnDark, 0.048, 0.01, 0.026, 0, 0.052, 0.185 + i * 0.055);
  // barrel + muzzle brake
  zCyl(k, k.metal, 0.01, 0.01, 0.12, 0, 0.072, 0.408);
  box(k, k.body, 0.024, 0.024, 0.05, 0, 0.072, 0.478);
  box(k, k.furnDark, 0.028, 0.006, 0.036, 0, 0.084, 0.478);
  // sights: front post + rear
  box(k, k.metal, 0.008, 0.026, 0.008, 0, 0.128, 0.33);
  box(k, k.metal, 0.022, 0.016, 0.01, 0, 0.128, -0.07);
  // curved magazine (two angled segments) + accent baseplate
  box(k, k.metal, 0.03, 0.09, 0.056, 0, -0.07, 0.078, 0.22);
  box(k, k.metal, 0.03, 0.072, 0.05, 0, -0.14, 0.048, 0.46);
  box(k, k.accent, 0.032, 0.014, 0.052, 0, -0.172, 0.03, 0.46);
  // pistol grip at origin
  box(k, k.furn, 0.032, 0.108, 0.048, 0, -0.046, -0.024, 0.22);
  // trigger guard
  box(k, k.metal, 0.006, 0.006, 0.056, 0, -0.008, 0.03);
  box(k, k.metal, 0.006, 0.032, 0.006, 0, 0.008, 0.056);
  // buffer tube + fixed stock with cheek riser + butt pad
  zCyl(k, k.metal, 0.015, 0.015, 0.1, 0, 0.07, -0.16, 16);
  box(k, k.furn, 0.04, 0.088, 0.14, 0, 0.036, -0.262);
  box(k, k.furn, 0.036, 0.026, 0.11, 0, 0.094, -0.256);
  box(k, k.furnDark, 0.046, 0.104, 0.016, 0, 0.032, -0.336);
  box(k, k.accent, 0.012, 0.02, 0.06, 0, 0.086, -0.15);

  // Muzzle anchor at the barrel tip (for future muzzle-flash VFX).
  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle";
  muzzle.position.set(0, 0.072, 0.504);
  k.group.add(muzzle);

  k.group.name = "rifle";
  k.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return k.group;
}
