import * as THREE from "three";

/**
 * DEV: `?griprx=&gripry=&griprz=` (radians) override the hand-grip rotation, so a
 * headless screenshot sweep can find the right axis empirically instead of by
 * guesswork — which is how the +90° X correction below was actually found.
 * Parsed ONCE at module load; this is read inside the per-frame render loop.
 */
const GRIP_OVERRIDES: Partial<Record<"rx" | "ry" | "rz", number>> = (() => {
  if (process.env.NODE_ENV === "production" || typeof location === "undefined") return {};
  const q = new URLSearchParams(location.search);
  const out: Partial<Record<"rx" | "ry" | "rz", number>> = {};
  for (const a of ["rx", "ry", "rz"] as const) {
    const v = q.get("grip" + a);
    if (v !== null) out[a] = Number(v);
  }
  return out;
})();

export function gripOverride(axis: "rx" | "ry" | "rz"): number | undefined {
  return GRIP_OVERRIDES[axis];
}

// ── Socketing a weapon into the hand ────────────────────────────────────────
//
// The weapon is now HELD: it takes both its position and its orientation from
// the hand bone, through a fixed grip offset, exactly as a real socket would.
//
// It used to take position from the hand and ORIENTATION FROM THE AIM VECTOR —
// a basis built out of the camera direction and world up, with the hand's own
// rotation discarded. The reasoning was sound (a clip has no idea where you're
// looking, so a clip-driven barrel drifts off the crosshair) but the cure was
// worse than the disease, because it meant the wrist and the weapon had no
// relationship at all:
//
//   · the gun read as pinned to the forearm rather than gripped, in every frame;
//   · its roll was locked to world up, so it stayed dead level while the body
//     leaned, strafed and flinched;
//   · the LEFT hand could never reach the foregrip — the Mixamo rifle clips pose
//     both hands correctly for a rifle, and all of that was being thrown away;
//   · every grip constant measured for the socket became dead code.
//
// The disagreement it was solving is handled where it belongs instead. The
// hitscan still comes from the CAMERA, so shots land exactly on the reticle; the
// spine traverse in PlayerRig swings the torso onto the aim so the barrel lands
// within a few degrees of it; and the tracer is drawn from the real muzzle
// anchor to the hitscan's impact point (see PlayerController's spawnShot), so it
// visibly converges on whatever you actually hit. Nobody reads a few degrees of
// barrel error when the streak ends on the target.

const _gripPos = new THREE.Vector3();
const _gripQuat = new THREE.Quaternion();
const _gripScale = new THREE.Vector3();
const _handFrame = new THREE.Matrix4();
const _unit = new THREE.Vector3(1, 1, 1);

/** A hand-relative grip offset: rotation (XYZ euler), translation, and scale. */
export interface GripOffset {
  rx: number;
  ry?: number;
  rz: number;
  ox?: number;
  oy?: number;
  oz?: number;
  scale?: number;
}

const _offEuler = new THREE.Euler();
const _offQuat = new THREE.Quaternion();
const _offPos = new THREE.Vector3();
const _offScale = new THREE.Vector3();

/**
 * Write a world matrix into `out` that puts a gun in the hand: the bone's
 * position and rotation, then the fixed grip offset.
 *
 * The hand bone's SCALE is deliberately dropped. Rigs come in at wildly
 * different scales (our FBX→GLB conversions carry a 100× node scale), and
 * inheriting that would either shrink the weapon to nothing or blow it up to
 * fill the street. Size belongs to `grip.scale`, which is in the gun's own
 * units, so one grip works on every rig.
 */
export function handGunWorldMatrix(
  out: THREE.Matrix4,
  handMatrixWorld: THREE.Matrix4,
  grip: GripOffset
): THREE.Matrix4 {
  handMatrixWorld.decompose(_gripPos, _gripQuat, _gripScale);
  _handFrame.compose(_gripPos, _gripQuat, _unit);
  // `?griprx=&gripry=&griprz=` override the rotation in dev, so the grip can be
  // dialled in from the URL (or swept headlessly) without a rebuild.
  _offEuler.set(
    gripOverride("rx") ?? grip.rx,
    gripOverride("ry") ?? grip.ry ?? 0,
    gripOverride("rz") ?? grip.rz
  ); // XYZ: roll first, in the gun's frame
  _offQuat.setFromEuler(_offEuler);
  _offPos.set(grip.ox ?? 0, grip.oy ?? 0, grip.oz ?? 0);
  _offScale.setScalar(grip.scale ?? 1);
  out.compose(_offPos, _offQuat, _offScale);
  return out.premultiply(_handFrame);
}

/** World position of a gun group's `muzzle` anchor, given its world matrix. */
export function muzzleWorldPos(
  out: THREE.Vector3,
  gun: THREE.Object3D,
  gunWorld: THREE.Matrix4
): THREE.Vector3 {
  const anchor = gun.getObjectByName("muzzle");
  if (!anchor) return out.setFromMatrixPosition(gunWorld);
  return out.copy(anchor.position).applyMatrix4(gunWorld);
}
import type { WeaponId } from "@/engine/config/shop";

/**
 * The armoury — every purchasable gun as a real, distinct model, ported from
 * Valor's GunMesh (Marvy's own codebase). Each tier is a hand-built low-poly
 * weapon in the game's style: a compact pistol, a stubby suppressed SMG, a full
 * assault rifle, a scoped marksman rifle, and the exotic energy prototype. Built
 * from primitives at runtime (no binaries), PBR-shaded so they reflect the scene
 * HDRI (via scene.environment) and read as real steel + polymer, not toys. The
 * SAME meshes render in the player's hands and (later) in the marketplace art.
 *
 * Conventions (shared with the hand-grip socket in PlayerRig):
 *   - local +Z is the firing direction, +Y is up,
 *   - the ORIGIN sits at the pistol grip (where the palm wraps),
 *   - a `muzzle` anchor (named Object3D) marks the barrel tip for VFX.
 */

const METAL_DARK = 0x2b313a; // receivers, slides — blued steel that catches light
const METAL = 0x3c434e; // secondary metal — parkerised grey
const POLYMER = 0x363b43; // furniture: grips, stocks, handguards
const POLYMER_DARK = 0x21252b;

interface GunKit {
  body: THREE.Material;
  metal: THREE.Material;
  furn: THREE.Material;
  furnDark: THREE.Material;
  accent: THREE.Material;
  glow: THREE.Material;
  group: THREE.Group;
}

// Restrained, tactical accents — desaturated tones, low glow. Candy-bright neon on
// grey plastic is the #1 "kids' toy" tell; a real weapon shows its tier through
// finish and a single disciplined accent, not a glowing stripe. Only the exotic
// prototype keeps a real emissive (it's an energy weapon).
const ACCENTS: Record<WeaponId, { color: number; glow: number }> = {
  sidearm: { color: 0x8b9096, glow: 0.0 }, // plain steel
  smg: { color: 0xa8763f, glow: 0.06 }, // muted amber
  assault_rifle: { color: 0x5c7f63, glow: 0.06 }, // field green
  marksman: { color: 0x6d8aa8, glow: 0.08 }, // steel blue
  legendary: { color: 0x8f6fc4, glow: 0.75 }, // exotic violet — still glows
};

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

function makeKit(gunId: WeaponId): GunKit {
  const a = ACCENTS[gunId];
  return {
    // Blued/parkerised steel: high metalness, mid-low roughness, strong envMap so
    // it catches reflections and reads as metal.
    body: new THREE.MeshStandardMaterial({ color: METAL_DARK, metalness: 0.95, roughness: 0.3, envMapIntensity: 1.8 }),
    metal: new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.5 }),
    furn: polymer(POLYMER, 0.58),
    furnDark: polymer(POLYMER_DARK, 0.62),
    accent: new THREE.MeshStandardMaterial({
      color: a.color,
      metalness: 0.55,
      roughness: 0.35,
      emissive: a.color,
      emissiveIntensity: a.glow * 0.4,
      envMapIntensity: 1.0,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: a.color,
      emissive: a.color,
      emissiveIntensity: a.glow,
      metalness: 0.2,
      roughness: 0.3,
      envMapIntensity: 0.6,
    }),
    group: new THREE.Group(),
  };
}

// Positioned box/cylinder helpers keep the builders readable.
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

function finish(k: GunKit, gunId: WeaponId, muzzleY: number, muzzleZ: number): THREE.Group {
  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle";
  muzzle.position.set(0, muzzleY, muzzleZ);
  k.group.add(muzzle);
  k.group.name = `gun-${gunId}`;
  k.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return k.group;
}

// ── Tier 1 · Standard Sidearm: compact service pistol ────────────────────────
function buildSidearm(): THREE.Group {
  const k = makeKit("sidearm");
  box(k, k.metal, 0.032, 0.03, 0.16, 0, 0.046, 0.024);
  box(k, k.body, 0.034, 0.032, 0.19, 0, 0.076, 0.028);
  box(k, k.furnDark, 0.036, 0.024, 0.03, 0, 0.076, -0.052); // slide serrations
  box(k, k.accent, 0.002, 0.014, 0.034, 0.018, 0.08, 0.012); // ejection port
  box(k, k.body, 0.024, 0.012, 0.01, 0, 0.098, -0.058); // sights
  box(k, k.body, 0.006, 0.012, 0.008, 0, 0.098, 0.108);
  zCyl(k, k.metal, 0.0085, 0.0085, 0.024, 0, 0.076, 0.132); // barrel stub
  box(k, k.furn, 0.03, 0.112, 0.044, 0, -0.048, -0.014, 0.16); // grip at origin
  box(k, k.furnDark, 0.032, 0.03, 0.046, 0, -0.098, -0.022, 0.16); // mag base flare
  box(k, k.accent, 0.026, 0.008, 0.04, 0, -0.112, -0.024, 0.16); // baseplate accent
  box(k, k.metal, 0.006, 0.006, 0.052, 0, -0.004, 0.046); // trigger guard
  box(k, k.metal, 0.006, 0.034, 0.006, 0, 0.012, 0.07);
  box(k, k.body, 0.005, 0.022, 0.006, 0, 0.012, 0.036, 0.25);
  return finish(k, "sidearm", 0.076, 0.146);
}

// ── Tier 2 · Compact SMG: stubby, suppressed, mag-forward ────────────────────
function buildSmg(): THREE.Group {
  const k = makeKit("smg");
  box(k, k.body, 0.05, 0.06, 0.3, 0, 0.052, 0.02); // receiver
  box(k, k.furnDark, 0.022, 0.012, 0.27, 0, 0.088, 0.02); // top rail
  for (let i = 0; i < 5; i++) box(k, k.body, 0.024, 0.004, 0.01, 0, 0.096, -0.08 + i * 0.05);
  box(k, k.metal, 0.02, 0.018, 0.008, 0, 0.104, -0.098); // sights
  box(k, k.metal, 0.006, 0.018, 0.008, 0, 0.104, 0.128);
  zCyl(k, k.metal, 0.011, 0.011, 0.07, 0, 0.052, 0.205); // barrel
  zCyl(k, k.furnDark, 0.017, 0.017, 0.115, 0, 0.052, 0.288); // suppressor
  box(k, k.accent, 0.002, 0.01, 0.09, 0.017, 0.052, 0.288); // suppressor accent
  box(k, k.metal, 0.028, 0.14, 0.05, 0, -0.055, 0.075, -0.14); // magazine
  box(k, k.accent, 0.03, 0.014, 0.052, 0, -0.122, 0.085, -0.14);
  box(k, k.furn, 0.032, 0.105, 0.046, 0, -0.044, -0.026, 0.14); // grip at origin
  box(k, k.furn, 0.028, 0.072, 0.036, 0, -0.028, 0.15, -0.1); // forward grip
  box(k, k.metal, 0.006, 0.006, 0.055, 0, -0.006, 0.026); // trigger guard
  box(k, k.metal, 0.006, 0.03, 0.006, 0, 0.008, 0.052);
  zCyl(k, k.metal, 0.006, 0.006, 0.13, 0.014, 0.052, -0.195, 16); // wire stock
  zCyl(k, k.metal, 0.006, 0.006, 0.13, -0.014, 0.052, -0.195, 16);
  box(k, k.furnDark, 0.052, 0.072, 0.016, 0, 0.044, -0.266); // butt plate
  box(k, k.accent, 0.002, 0.016, 0.04, 0.026, 0.058, -0.02); // ejection port
  return finish(k, "smg", 0.052, 0.348);
}

// ── Tier 3 · Assault Rifle: full-size, curved mag, fixed stock ───────────────
function buildAssaultRifle(): THREE.Group {
  const k = makeKit("assault_rifle");
  box(k, k.metal, 0.042, 0.05, 0.24, 0, 0.04, 0.01); // lower receiver
  box(k, k.body, 0.044, 0.046, 0.26, 0, 0.086, 0.02); // upper receiver
  box(k, k.furnDark, 0.02, 0.012, 0.24, 0, 0.116, 0.02); // carry rail
  box(k, k.furn, 0.046, 0.052, 0.2, 0, 0.072, 0.25); // handguard
  box(k, k.accent, 0.002, 0.01, 0.16, 0.024, 0.072, 0.25);
  box(k, k.accent, 0.002, 0.01, 0.16, -0.024, 0.072, 0.25);
  for (let i = 0; i < 3; i++) box(k, k.furnDark, 0.048, 0.01, 0.026, 0, 0.052, 0.185 + i * 0.055);
  zCyl(k, k.metal, 0.01, 0.01, 0.12, 0, 0.072, 0.408); // barrel
  box(k, k.body, 0.024, 0.024, 0.05, 0, 0.072, 0.478); // muzzle brake
  box(k, k.furnDark, 0.028, 0.006, 0.036, 0, 0.084, 0.478);
  box(k, k.metal, 0.008, 0.026, 0.008, 0, 0.128, 0.33); // front sight
  box(k, k.metal, 0.022, 0.016, 0.01, 0, 0.128, -0.07); // rear sight
  box(k, k.metal, 0.03, 0.09, 0.056, 0, -0.07, 0.078, 0.22); // curved mag
  box(k, k.metal, 0.03, 0.072, 0.05, 0, -0.14, 0.048, 0.46);
  box(k, k.accent, 0.032, 0.014, 0.052, 0, -0.172, 0.03, 0.46); // baseplate
  box(k, k.furn, 0.032, 0.108, 0.048, 0, -0.046, -0.024, 0.22); // grip at origin
  box(k, k.metal, 0.006, 0.006, 0.056, 0, -0.008, 0.03); // trigger guard
  box(k, k.metal, 0.006, 0.032, 0.006, 0, 0.008, 0.056);
  zCyl(k, k.metal, 0.015, 0.015, 0.1, 0, 0.07, -0.16, 16); // buffer tube
  box(k, k.furn, 0.04, 0.088, 0.14, 0, 0.036, -0.262); // stock
  box(k, k.furn, 0.036, 0.026, 0.11, 0, 0.094, -0.256); // cheek riser
  box(k, k.furnDark, 0.046, 0.104, 0.016, 0, 0.032, -0.336); // butt pad
  box(k, k.accent, 0.012, 0.02, 0.06, 0, 0.086, -0.15); // tier tag
  return finish(k, "assault_rifle", 0.072, 0.504);
}

// ── Tier 4 · Marksman Rifle: long barrel, scope, precision stock ─────────────
function buildMarksman(): THREE.Group {
  const k = makeKit("marksman");
  box(k, k.body, 0.045, 0.055, 0.3, 0, 0.058, -0.01); // receiver
  box(k, k.furnDark, 0.02, 0.01, 0.28, 0, 0.094, -0.01);
  box(k, k.furn, 0.048, 0.05, 0.26, 0, 0.058, 0.27); // handguard
  for (let i = 0; i < 4; i++) {
    box(k, k.furnDark, 0.05, 0.01, 0.028, 0, 0.04, 0.185 + i * 0.058);
    box(k, k.furnDark, 0.05, 0.01, 0.028, 0, 0.076, 0.185 + i * 0.058);
  }
  zCyl(k, k.metal, 0.009, 0.009, 0.28, 0, 0.058, 0.54); // long barrel
  zCyl(k, k.body, 0.014, 0.014, 0.055, 0, 0.058, 0.702); // brake
  box(k, k.furnDark, 0.032, 0.005, 0.04, 0, 0.07, 0.702);
  box(k, k.metal, 0.014, 0.034, 0.022, 0, 0.112, -0.048); // scope mounts
  box(k, k.metal, 0.014, 0.034, 0.022, 0, 0.112, 0.03);
  zCyl(k, k.body, 0.018, 0.018, 0.15, 0, 0.146, -0.008); // scope tube
  zCyl(k, k.body, 0.027, 0.023, 0.045, 0, 0.146, 0.082); // objective bell
  zCyl(k, k.body, 0.023, 0.02, 0.038, 0, 0.146, -0.096); // eyepiece bell
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.023, 12),
    new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x66ccff, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.2 })
  );
  lens.position.set(0, 0.146, 0.1052);
  k.group.add(lens);
  zCyl(k, k.metal, 0.01, 0.01, 0.016, 0, 0.178, -0.008, 16); // elevation turret
  box(k, k.metal, 0.03, 0.012, 0.014, 0.012, 0.146, -0.008); // windage turret
  box(k, k.metal, 0.032, 0.1, 0.06, 0, -0.075, 0.06, 0.1); // precision mag
  box(k, k.accent, 0.034, 0.014, 0.056, 0, -0.128, 0.052, 0.1);
  box(k, k.furn, 0.032, 0.105, 0.048, 0, -0.045, -0.026, 0.24); // grip at origin
  box(k, k.metal, 0.006, 0.006, 0.052, 0, -0.008, 0.026); // trigger guard
  box(k, k.metal, 0.006, 0.03, 0.006, 0, 0.008, 0.05);
  box(k, k.furn, 0.042, 0.075, 0.22, 0, 0.04, -0.23); // precision stock
  box(k, k.accent, 0.036, 0.028, 0.12, 0, 0.1, -0.23); // cheek riser
  box(k, k.furnDark, 0.046, 0.115, 0.018, 0, 0.024, -0.346); // butt pad
  box(k, k.furn, 0.03, 0.05, 0.045, 0, -0.026, -0.29); // bottom hook
  zCyl(k, k.metal, 0.005, 0.005, 0.11, 0.016, 0.026, 0.32, 16); // folded bipod
  zCyl(k, k.metal, 0.005, 0.005, 0.11, -0.016, 0.026, 0.32, 16);
  return finish(k, "marksman", 0.058, 0.73);
}

// ── Tier 5 · Prototype: exotic energy rifle, glowing core + coils ────────────
function buildLegendary(): THREE.Group {
  const k = makeKit("legendary");
  box(k, k.body, 0.05, 0.068, 0.3, 0, 0.056, 0.0); // core receiver
  box(k, k.metal, 0.044, 0.02, 0.24, 0, 0.104, -0.01, 0.1); // canted top plates
  box(k, k.metal, 0.044, 0.02, 0.12, 0, 0.108, 0.11, -0.14);
  zCyl(k, k.glow, 0.019, 0.019, 0.095, 0, 0.096, -0.052, 16); // energy cell
  box(k, k.body, 0.05, 0.016, 0.02, 0, 0.096, -0.108);
  box(k, k.body, 0.05, 0.016, 0.02, 0, 0.096, 0.004);
  box(k, k.metal, 0.008, 0.04, 0.12, 0, 0.13, -0.16, -0.1); // spine fin
  zCyl(k, k.glow, 0.0075, 0.0075, 0.36, 0, 0.056, 0.3, 16); // barrel rod
  for (const ang of [0.785, 2.356, 3.927, 5.498]) {
    const fin = box(k, k.body, 0.006, 0.034, 0.13, 0, 0.056, 0.17);
    fin.position.x = Math.cos(ang) * 0.02;
    fin.position.y = 0.056 + Math.sin(ang) * 0.02;
    fin.rotation.z = ang;
  }
  for (let i = 0; i < 3; i++) zCyl(k, k.accent, 0.024, 0.024, 0.016, 0, 0.056, 0.24 + i * 0.085, 16); // coil rings
  zCyl(k, k.glow, 0.019, 0.014, 0.035, 0, 0.056, 0.47, 16); // muzzle emitter
  box(k, k.metal, 0.032, 0.052, 0.11, 0, -0.048, 0.1, 0.12); // capacitor
  box(k, k.glow, 0.034, 0.01, 0.08, 0, -0.052, 0.096, 0.12); // charge strip
  box(k, k.furn, 0.032, 0.105, 0.048, 0, -0.046, -0.026, 0.22); // grip at origin
  box(k, k.metal, 0.006, 0.006, 0.052, 0, -0.008, 0.028); // trigger guard
  box(k, k.metal, 0.006, 0.03, 0.006, 0, 0.008, 0.052);
  box(k, k.metal, 0.01, 0.014, 0.2, 0, 0.078, -0.19, 0.14); // skeletal stock
  box(k, k.metal, 0.01, 0.014, 0.19, 0, -0.006, -0.18, -0.2);
  box(k, k.furnDark, 0.04, 0.12, 0.018, 0, 0.028, -0.296); // butt frame
  box(k, k.glow, 0.012, 0.06, 0.01, 0, 0.028, -0.306);
  return finish(k, "legendary", 0.056, 0.492);
}

const BUILDERS: Record<WeaponId, () => THREE.Group> = {
  sidearm: buildSidearm,
  smg: buildSmg,
  assault_rifle: buildAssaultRifle,
  marksman: buildMarksman,
  legendary: buildLegendary,
};

/** Build the real model for a weapon, with a `muzzle` anchor at the barrel tip. */
export function makeGunMesh(gunId: WeaponId): THREE.Group {
  return (BUILDERS[gunId] ?? BUILDERS.assault_rifle)();
}

/** Back-compat: the plain assault rifle (armed NPCs socket this). */
export function makeRifle(): THREE.Group {
  return buildAssaultRifle();
}
