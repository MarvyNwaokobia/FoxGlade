import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODEL_PATHS, type CharacterModelId } from "@/engine/character/PlayerRig";
import { dressCharacterMaterial } from "@/engine/character/materials";
import { loadMixamoAnimations, CLIP_NAMES } from "@/engine/animation";
import { renderThumbAsync } from "./renderThumb";

/**
 * A rendered portrait of the player's hero, for the profile card — same
 * shared studio pipeline as weaponThumb.ts, but the source is a skinned GLTF
 * loaded off the network rather than procedural geometry, so this resolves
 * asynchronously (weaponThumb's callers read a cached string synchronously;
 * this one is awaited once and its result cached the same way).
 *
 * Needs a real animation clip driving the skeleton, not just the raw GLTF —
 * confirmed empirically: this rig's bind pose (no mixer at all) renders
 * lying flat/collapsed, not a normal standing T-pose. These are Blender-
 * exported, FBX-converted rigs (see PlayerRig.tsx's HIPS_PITCH_FIX comment)
 * whose root bone only comes out correctly oriented once a clip is actually
 * driving it — a static rest pose has nothing to correct against. So this
 * reuses the SAME clip set the live rig plays (`loadMixamoAnimations`,
 * already loaded and cached from the live game by the time a player has
 * gotten as far as opening their profile — this resolves instantly, no
 * second fetch), binds one idle frame, and applies the identical per-frame
 * Hips correction PlayerRig applies every frame during real gameplay.
 */
const HIPS_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

let loader: GLTFLoader | null = null;
function ensureLoader(): GLTFLoader {
  if (loader) return loader;
  // A PRIVATE manager, not THREE.DefaultLoadingManager: the initial scene load
  // (village GLBs, HDRI) already drives drei's <Loader> off the default one, so
  // loading the hero model on it too made opening the profile screen — any time
  // AFTER the village had already loaded — flash the full-screen "Entering the
  // village…" bar back over the live game while this one GLB fetched.
  const manager = new THREE.LoadingManager();
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath("/draco/"); // self-hosted, same decoder gltfLoader.ts points useGLTF at
  loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);
  return loader;
}

async function buildHero(model: CharacterModelId): Promise<THREE.Object3D> {
  const [gltf, clips] = await Promise.all([ensureLoader().loadAsync(MODEL_PATHS[model]), loadMixamoAnimations()]);
  const clone = SkeletonUtils.clone(gltf.scene);

  const idleClip = clips.get(CLIP_NAMES.rifleIdle);
  if (idleClip) {
    const mixer = new THREE.AnimationMixer(clone);
    mixer.clipAction(idleClip).play();
    mixer.update(0); // one frame is all a still portrait needs
  }

  let hips: THREE.Object3D | null = null;
  clone.traverse((child) => {
    if ((child as THREE.Bone).isBone && !hips && /hips/i.test(child.name)) hips = child;
    if (child instanceof THREE.Mesh) {
      child.material = Array.isArray(child.material) ? child.material.map((m) => m.clone()) : child.material.clone();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => dressCharacterMaterial(m));
    }
  });
  if (hips) (hips as THREE.Object3D).quaternion.premultiply(HIPS_PITCH_FIX);

  return clone;
}

const cache = new Map<string, string>();

/** A data-URL PNG portrait of `model`, or null if WebGL isn't available.
 *  Cached — repeated calls (e.g. reopening the profile) are free after the
 *  first resolves. */
export function heroThumb(model: CharacterModelId): Promise<string | null> {
  return renderThumbAsync(cache, model, () => buildHero(model), {
    rotation: [0.04, -0.3, 0],
    manual: { reach: 1.0, center: [0, 0.9, 0] },
  });
}
