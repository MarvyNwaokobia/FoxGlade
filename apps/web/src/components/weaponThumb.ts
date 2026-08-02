import * as THREE from "three";
import { makeGunMesh } from "@/engine/character/GunMesh";
import type { WeaponId } from "@/engine/config/shop";

/**
 * Renders each gun to an image once, for the shop cards.
 *
 * The armoury shipped with emoji: the Sidearm, the SMG and the Assault Rifle all
 * used the same green water-pistol glyph, so the one screen in the game whose
 * entire job is "choose between these weapons" showed three identical pictures.
 * Meanwhile the engine already builds every one of these guns procedurally, with
 * its own silhouette and its own accent colour, for the character to hold.
 *
 * So the cards just show the actual gun. Each is rendered once into an offscreen
 * canvas and cached as a data URL — no per-card WebGL context, no live canvases
 * in the overlay, and the cost is a handful of one-off draws the first time the
 * market is opened.
 */

const cache = new Map<WeaponId, string>();
const SIZE = 320; // rendered square, displayed much smaller (retina headroom)

let renderer: THREE.WebGLRenderer | null = null;

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  if (typeof document === "undefined") return null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  } catch {
    return null; // no WebGL — cards fall back to their glyph
  }
  return renderer;
}

/**
 * A data-URL PNG of `gunId`, or null if WebGL isn't available. Cached, so
 * repeated calls (re-renders, reopening the shop) are free.
 */
export function weaponThumb(gunId: WeaponId): string | null {
  const hit = cache.get(gunId);
  if (hit) return hit;
  const r = ensureRenderer();
  if (!r) return null;

  const scene = new THREE.Scene();
  const gun = makeGunMesh(gunId);

  // Frame it: three-quarter view, muzzle to the right, filling the square.
  const holder = new THREE.Group();
  holder.add(gun);
  holder.rotation.set(0.28, -0.72, 0.06);
  scene.add(holder);

  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  holder.position.sub(centre);

  // Orthographic so every gun is drawn at a true relative scale — the marksman
  // should LOOK longer than the sidearm on the card, because it is.
  const reach = Math.max(size.x, size.y, size.z) * 0.62;
  const cam = new THREE.OrthographicCamera(-reach, reach, reach, -reach, 0.01, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);

  // Studio three-point-ish: a key, a cool fill, and enough ambient that the dark
  // parts of a black weapon don't crush to nothing on a dark card.
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 1.4);
  fill.position.set(-5, -1, 3);
  scene.add(fill);

  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  cache.set(gunId, url);

  // The renderer is reused, but this scene's geometry is not.
  gun.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    }
  });

  return url;
}
