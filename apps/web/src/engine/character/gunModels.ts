import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { WeaponId } from "@/engine/config/shop";

/**
 * Real weapon meshes, ported from Valor (same repo family, same GLBs — the
 * AR + Legendary are hand-authored, the Sidearm/SMG/Marksman were generated
 * image → SAM 3D), for the first-person VIEWMODEL only.
 *
 * The rest of the game keeps FoxGlade's procedural GunMesh.ts on purpose —
 * marketplace cards (weaponThumb.ts) and every other character's held gun
 * (PlayerRig.tsx) render fine as boxes/cylinders at arm's length or in a
 * thumbnail. The one place a gun gets stared at for an entire run, filling a
 * third of the screen, is the player's own hands — that's where the real
 * geometry earns its weight. Same split Valor itself uses (its own
 * scene/GunMesh.ts stays procedural for everything except this).
 */
export const GUN_MODEL_URL: Record<WeaponId, string> = {
  sidearm: "/models/guns/sidearm.glb",
  smg: "/models/guns/smg.glb",
  assault_rifle: "/models/guns/rifle.glb",
  marksman: "/models/guns/marksman.glb",
  legendary: "/models/guns/blaster.glb",
};
Object.values(GUN_MODEL_URL).forEach((u) => useGLTF.preload(u));

/** Real-ish weapon length (metres) each model is scaled to. */
const GUN_LEN: Record<WeaponId, number> = {
  sidearm: 0.26,
  smg: 0.52,
  assault_rifle: 0.88,
  marksman: 1.12,
  legendary: 0.82,
};

/**
 * Per-model orientation fix applied after the generic "longest axis → +Z"
 * step, ported as-is from Valor's gunModels.ts — these describe how each raw
 * GLB is baked, not anything about Valor's code, and it's the same file.
 */
const GUN_FLIP_Y: Record<WeaponId, boolean> = {
  sidearm: true,
  smg: true,
  assault_rifle: true,
  marksman: true,
  legendary: true,
};

/**
 * Where the grip roughly is on each model, as a fraction of its bounding box
 * — (0,0,0) is the geometric centre, (x: 0..1 left→right, y: 0..1 bottom→
 * top, z: 0..1 rear→muzzle). A real grip sits low (below the bore/sight
 * line) and toward the rear (behind the barrel's midpoint), which these
 * approximate; there's no grip metadata in the source GLBs to read exactly.
 *
 * This matters because PlayerRig's third-person socket assumes the gun's
 * LOCAL ORIGIN sits at the grip (one shared `gripTune` offset/rotation is
 * reused across every weapon — see PlayerRig.tsx) — the same convention the
 * procedural guns in GunMesh.ts bake in by construction. Shifting the origin
 * here to an estimated grip point, rather than the bbox centre, means the
 * real meshes drop into that same shared socket instead of needing their own.
 * Expect these to want a pass with PlayerRig's `GUN_TUNER` dev mode once
 * they're actually on screen — they're a first estimate, not a measurement.
 */
const GRIP_FRACTION: Record<WeaponId, [number, number, number]> = {
  sidearm: [0.5, 0.18, 0.42], // compact — grip is most of the object
  smg: [0.5, 0.2, 0.3],
  assault_rifle: [0.5, 0.22, 0.28],
  marksman: [0.5, 0.22, 0.24], // longest gun — grip sits further from centre
  legendary: [0.5, 0.22, 0.3],
};

/**
 * Normalise a raw GLTF scene into the engine's weapon convention: local +Z
 * is the firing direction, scaled to a real-world length, origin shifted to
 * an estimated grip point (see GRIP_FRACTION), with a `muzzle` anchor at the
 * forward tip so `muzzleWorldPos` (GunMesh.ts) finds it exactly like it does
 * on the procedural guns — no special-casing at the call site for which kind
 * of gun this is.
 */
export function buildGunModel(src: THREE.Object3D, gunId: WeaponId): THREE.Group {
  const group = new THREE.Group();
  group.name = `gun-model-${gunId}`;
  const inner = src.clone(true);
  inner.rotation.set(0, 0, 0);
  inner.position.set(0, 0, 0);
  inner.scale.set(1, 1, 1);
  group.add(inner);
  group.updateMatrixWorld(true);

  // Longest axis of the raw model = the barrel. Rotate it onto +Z.
  const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) inner.rotation.y = -Math.PI / 2;
  else if (size.y >= size.x && size.y >= size.z) inner.rotation.x = Math.PI / 2;
  if (GUN_FLIP_Y[gunId]) inner.rotateY(Math.PI);
  group.updateMatrixWorld(true);

  // Scale to the tuned real-world length along the (now) +Z barrel axis.
  const rawSize = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
  const scale = rawSize.z > 1e-5 ? GUN_LEN[gunId] / rawSize.z : 1;
  inner.scale.setScalar(scale);
  group.updateMatrixWorld(true);

  // Shift the origin to the estimated grip point.
  const box = new THREE.Box3().setFromObject(inner);
  const [fx, fy, fz] = GRIP_FRACTION[gunId];
  const grip = new THREE.Vector3(
    THREE.MathUtils.lerp(box.min.x, box.max.x, fx),
    THREE.MathUtils.lerp(box.min.y, box.max.y, fy),
    THREE.MathUtils.lerp(box.min.z, box.max.z, fz)
  );
  inner.position.sub(grip);
  group.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(inner);
  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle";
  muzzle.position.set(0, 0, box2.max.z);
  group.add(muzzle);

  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
  });

  return group;
}

/** Hook: the cached (preloaded) raw GLTF scene for a weapon tier. */
export function useGunModelScene(gunId: WeaponId): THREE.Object3D {
  const { scene } = useGLTF(GUN_MODEL_URL[gunId]);
  return scene;
}
