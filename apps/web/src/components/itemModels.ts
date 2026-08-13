import * as THREE from "three";
import type { ShopItem } from "@/engine/config/shop";

/**
 * Real, materialed 3D models for the non-weapon shop items — leather,
 * brass, iron, cloth, parchment, cut gems, lit with the same PBR pipeline
 * (metalness/roughness + an environment-lit studio) the guns already use.
 * Built from primitives, same idea as GunMesh.ts's procedural armoury, so
 * every card in the shop is a real render and not a flat drawing of one.
 */

// ── Shared palette — real materials, not flat colour ────────────────────────
const leather = () => new THREE.MeshPhysicalMaterial({ color: 0x4a3826, roughness: 0.62, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.55 });
const leatherDark = () => new THREE.MeshPhysicalMaterial({ color: 0x2c2013, roughness: 0.68, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.6 });
const brass = () => new THREE.MeshStandardMaterial({ color: 0xba8a34, metalness: 0.9, roughness: 0.3 });
const iron = () => new THREE.MeshStandardMaterial({ color: 0x38332e, metalness: 0.85, roughness: 0.4 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x6b4e34, roughness: 0.72, metalness: 0 });
const woodDark = () => new THREE.MeshStandardMaterial({ color: 0x40301f, roughness: 0.75, metalness: 0 });
const cloth = () => new THREE.MeshStandardMaterial({ color: 0xe6dabd, roughness: 0.92, metalness: 0 });
const parchment = () => new THREE.MeshStandardMaterial({ color: 0xd7c088, roughness: 0.82, metalness: 0 });
const rope = () => new THREE.MeshStandardMaterial({ color: 0xb3a273, roughness: 0.88, metalness: 0 });
const crossRed = () => new THREE.MeshStandardMaterial({ color: 0x8a2c22, roughness: 0.55, metalness: 0 });
const ember = () => new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 2, roughness: 0.4 });
/** A cut gem — glassy, a hint of transmission, and a real emissive core so it reads lit from within. */
const gem = (color: number) =>
  new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.05,
    roughness: 0.12,
    transmission: 0.35,
    thickness: 0.6,
    emissive: color,
    emissiveIntensity: 0.5,
    envMapIntensity: 1.4,
  });

// ── Primitive helpers ────────────────────────────────────────────────────────
function box(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function cyl(g: THREE.Group, mat: THREE.Material, rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sides = 24): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, sides), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function sph(g: THREE.Group, mat: THREE.Material, r: number, x = 0, y = 0, z = 0, wSeg = 24, hSeg = 18): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function torus(g: THREE.Group, mat: THREE.Material, r: number, tube: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 28, tubeSeg = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, tubeSeg, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function finish(g: THREE.Group): THREE.Group {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

// ── s_restore · Bandages: a rolled cloth bandage, trailing end with a cross ──
function buildBandages(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, cloth(), 0.09, 0.09, 0.14, 0, 0, 0, Math.PI / 2, 0, 0);
  torus(g, cloth(), 0.09, 0.012, 0.07, 0, 0, Math.PI / 2, 0);
  torus(g, cloth(), 0.09, 0.012, -0.07, 0, 0, Math.PI / 2, 0);
  // Trailing wrapped strip, gently curved.
  box(g, cloth(), 0.05, 0.012, 0.16, 0.1, -0.02, 0.02, 0, 0.5, 0);
  box(g, cloth(), 0.05, 0.012, 0.14, 0.2, -0.03, 0.09, 0, 0.9, 0);
  // Cross accent on the strip end.
  box(g, crossRed(), 0.028, 0.014, 0.008, 0.24, -0.032, 0.13, 0, 0.9, 0);
  box(g, crossRed(), 0.008, 0.014, 0.028, 0.24, -0.032, 0.13, 0, 0.9, 0);
  return finish(g);
}

// ── s_bomb · Powder Charge: a small wooden keg with a lit fuse ──────────────
function buildPowderCharge(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, wood(), 0.11, 0.1, 0.2, 0, 0, 0, 0, 0, 0, 20);
  torus(g, iron(), 0.108, 0.012, 0.06, 0, 0, Math.PI / 2, 0);
  torus(g, iron(), 0.1, 0.012, -0.06, 0, 0, Math.PI / 2, 0);
  cyl(g, woodDark(), 0.09, 0.11, 0.02, 0, 0.1, 0);
  cyl(g, woodDark(), 0.09, 0.11, 0.02, 0, -0.1, 0);
  // Fuse: a few short angled segments standing in for a curve.
  cyl(g, rope(), 0.012, 0.012, 0.07, 0.01, 0.15, 0, 0, 0, 0.3, 10);
  cyl(g, rope(), 0.01, 0.012, 0.06, 0.05, 0.2, 0, 0, 0, 0.9, 10);
  sph(g, ember(), 0.022, 0.08, 0.24, 0);
  return finish(g);
}

// ── s_chart · Surveyor's Chart: a rolled parchment, ribbon-tied ─────────────
function buildChart(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, parchment(), 0.075, 0.075, 0.26, 0, 0, 0, 0, 0, Math.PI / 2, 20);
  // Rolled-open ends read as slightly irregular discs.
  cyl(g, parchment(), 0.078, 0.06, 0.02, 0.13, 0, 0, 0, 0, Math.PI / 2, 20);
  cyl(g, parchment(), 0.06, 0.078, 0.02, -0.13, 0, 0, 0, 0, Math.PI / 2, 20);
  torus(g, rope(), 0.077, 0.012, -0.04, 0, 0, Math.PI / 2, 0);
  torus(g, rope(), 0.077, 0.012, 0.05, 0, 0, Math.PI / 2, 0);
  return finish(g);
}

// ── s_lockbox · Lockbox: a small ironbound chest ────────────────────────────
function buildLockbox(): THREE.Group {
  const g = new THREE.Group();
  box(g, wood(), 0.26, 0.16, 0.18, 0, -0.02, 0);
  // Domed lid — a cylinder on its side reads as a rounded barrel-vault roof.
  cyl(g, wood(), 0.09, 0.09, 0.26, 0, 0.08, 0, 0, 0, Math.PI / 2, 20);
  // Banding.
  box(g, iron(), 0.27, 0.03, 0.185, 0, -0.02, 0);
  box(g, iron(), 0.06, 0.24, 0.19, -0.09, 0.04, 0);
  box(g, iron(), 0.06, 0.24, 0.19, 0.09, 0.04, 0);
  // Corner studs.
  for (const sx of [-0.12, 0.12]) for (const sz of [-0.08, 0.08]) sph(g, brass(), 0.014, sx, -0.09, sz, 10, 8);
  // Lock plate + keyhole.
  box(g, brass(), 0.07, 0.06, 0.012, 0, -0.02, 0.096);
  cyl(g, iron(), 0.01, 0.01, 0.014, 0, -0.014, 0.1, Math.PI / 2, 0, 0, 10);
  box(g, iron(), 0.008, 0.02, 0.014, 0, -0.03, 0.1);
  return finish(g);
}

// ── s_extralife · Warding Charm: a cut gem in a brass setting, on a loop ────
function buildWardingCharm(): THREE.Group {
  const g = new THREE.Group();
  torus(g, brass(), 0.14, 0.016, 0);
  sph(g, gem(0x3f7fd6), 0.09, 0, 0, 0, 24, 18);
  torus(g, brass(), 0.1, 0.01, 0.001);
  // Facet ring dividers.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(g, brass(), 0.012, 0.16, 0.012, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0, 0, 0, a);
  }
  // Chain loop at the top.
  torus(g, brass(), 0.03, 0.008, 0.19, 0, 0, Math.PI / 2, 0);
  return finish(g);
}

// ── a_sight · Brass Sight: a small spyglass ─────────────────────────────────
function buildBrassSight(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, brass(), 0.05, 0.04, 0.22, -0.02, 0, 0, 0, 0, Math.PI / 2, 20);
  cyl(g, brass(), 0.062, 0.05, 0.1, -0.16, 0, 0, 0, 0, Math.PI / 2, 20);
  torus(g, iron(), 0.06, 0.008, -0.21, 0, 0, Math.PI / 2, 0);
  // Objective lens.
  cyl(g, gem(0x3fa0e0), 0.05, 0.05, 0.01, -0.235, 0, 0, 0, 0, Math.PI / 2, 20);
  // Eyepiece.
  torus(g, iron(), 0.038, 0.012, 0.1, 0, 0, Math.PI / 2, 0);
  // Mount.
  box(g, iron(), 0.03, 0.05, 0.05, 0, -0.08, 0);
  return finish(g);
}

// ── a_grip · Wrapped Grip: a leather-wrapped handle ─────────────────────────
function buildWrappedGrip(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, wood(), 0.045, 0.05, 0.24, 0, 0, 0, 0, 0, 0, 16);
  // Diagonal wrap bands.
  for (let i = 0; i < 8; i++) {
    torus(g, leather(), 0.05, 0.014, -0.09 + i * 0.024, 0, 0, 0.55, 20, 8);
  }
  // Pommel + guard.
  sph(g, brass(), 0.06, 0, 0.13, 0, 18, 14);
  cyl(g, brass(), 0.08, 0.08, 0.02, 0, -0.13, 0, 0, 0, 0, 20);
  return finish(g);
}

// ── b_satchel · Bomb Satchel: a small pouch with a keg peeking out ──────────
function buildBombSatchel(): THREE.Group {
  const g = new THREE.Group();
  box(g, leather(), 0.24, 0.22, 0.12, 0, -0.04, 0, 0, 0, 0);
  box(g, leatherDark(), 0.25, 0.06, 0.13, 0, 0.06, 0);
  box(g, brass(), 0.05, 0.035, 0.02, 0, 0.03, 0.065);
  torus(g, leather(), 0.17, 0.014, -0.13, 0.02, 0, 0.3);
  // Keg peeking from the top.
  cyl(g, wood(), 0.07, 0.07, 0.1, 0, 0.15, 0, 0, 0, 0, 16);
  torus(g, iron(), 0.07, 0.008, 0.15, 0, 0, Math.PI / 2, 0);
  cyl(g, rope(), 0.008, 0.008, 0.05, 0.02, 0.23, 0, 0, 0, 0.4, 8);
  sph(g, ember(), 0.016, 0.045, 0.26, 0);
  return finish(g);
}

// ── g_satchel · Satchel: a simple shoulder bag ──────────────────────────────
function buildSatchel(): THREE.Group {
  const g = new THREE.Group();
  box(g, leather(), 0.26, 0.2, 0.1, 0, -0.03, 0);
  box(g, leatherDark(), 0.27, 0.11, 0.105, 0, 0.09, -0.005, -0.15);
  box(g, brass(), 0.055, 0.04, 0.02, 0, 0.03, 0.06);
  torus(g, leather(), 0.19, 0.014, -0.15, 0.04, 0, 0.3);
  // Stitched seam accent.
  box(g, leatherDark(), 0.24, 0.006, 0.001, 0, -0.11, 0.051);
  return finish(g);
}

// ── g_rucksack · Rucksack: a taller pack with straps + front pocket ─────────
function buildRucksack(): THREE.Group {
  const g = new THREE.Group();
  box(g, leatherDark(), 0.24, 0.32, 0.14, 0, 0, 0);
  box(g, leather(), 0.2, 0.13, 0.1, 0, -0.06, 0.1);
  box(g, brass(), 0.05, 0.03, 0.02, 0, -0.03, 0.155);
  torus(g, rope(), 0.1, 0.01, 0.17, 0, 0, Math.PI / 2, 0);
  // Straps.
  box(g, leather(), 0.035, 0.36, 0.02, -0.07, 0, -0.08, 0.12, 0, 0);
  box(g, leather(), 0.035, 0.36, 0.02, 0.07, 0, -0.08, -0.12, 0, 0);
  return finish(g);
}

const BUILDERS: Record<string, () => THREE.Group> = {
  s_restore: buildBandages,
  s_bomb: buildPowderCharge,
  s_chart: buildChart,
  s_lockbox: buildLockbox,
  s_extralife: buildWardingCharm,
  a_sight: buildBrassSight,
  a_grip: buildWrappedGrip,
  b_satchel: buildBombSatchel,
  g_satchel: buildSatchel,
  g_rucksack: buildRucksack,
};

/** Build the real model for a shop item, or null for items with no model (weapons — GunMesh.ts). */
export function buildItemModel(itemId: ShopItem["id"]): THREE.Group | null {
  const b = BUILDERS[itemId];
  return b ? b() : null;
}
