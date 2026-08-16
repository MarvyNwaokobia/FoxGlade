import * as THREE from "three";

/**
 * Shared offscreen renderer for shop-card art: build a THREE object once,
 * shoot it in a small studio (orthographic, three-point lighting), cache the
 * PNG. weaponThumb.ts and itemThumb.ts both go through this so a gun and a
 * lockbox sitting side by side on a card look like they were shot in the
 * same booth, not two different rendering pipelines.
 */
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

export interface ThumbFraming {
  /** Holder rotation (radians) for the three-quarter view. */
  rotation?: [number, number, number];
  /** Orthographic half-extent as a fraction of the object's largest dimension
   *  — smaller fills the frame more. */
  reachScale?: number;
  /**
   * Skip the automatic Box3-based framing below and use these instead.
   * Box3 reads geometry's RAW (unskinned) vertex positions — accurate for
   * rigid procedural objects (guns, items) but meaningless for a posed
   * SkinnedMesh, whose true on-screen shape only exists after GPU skinning.
   * heroThumb.ts supplies known-good numbers for its own idle pose instead of
   * fighting the auto-framing math.
   */
  manual?: { reach: number; center: [number, number, number] };
}

/** Frame `obj` in the shared studio (three-point lighting, orthographic true-scale
 *  camera), render it, and return the PNG data URL. Shared by the sync and async
 *  entry points below — the only difference between them is how `obj` is built. */
function renderObject(r: THREE.WebGLRenderer, obj: THREE.Object3D, framing: ThumbFraming): string {
  const scene = new THREE.Scene();

  // Frame it: three-quarter view, filling the square.
  const holder = new THREE.Group();
  holder.add(obj);
  const [rx, ry, rz] = framing.rotation ?? [0.28, -0.72, 0.06];
  holder.rotation.set(rx, ry, rz);
  scene.add(holder);

  let reach: number;
  if (framing.manual) {
    const [cx, cy, cz] = framing.manual.center;
    holder.position.sub(new THREE.Vector3(cx, cy, cz));
    reach = framing.manual.reach;
  } else {
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    holder.position.sub(centre);
    // Orthographic so everything is drawn at a true relative scale — a
    // rucksack should LOOK bigger than a lockbox on the card, because it is.
    reach = Math.max(size.x, size.y, size.z) * (framing.reachScale ?? 0.54);
  }
  const cam = new THREE.OrthographicCamera(-reach, reach, reach, -reach, 0.01, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);

  // Studio three-point-ish: a key, a cool fill, and enough ambient that the
  // dark parts of a black or leather object don't crush to nothing.
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 1.4);
  fill.position.set(-5, -1, 3);
  scene.add(fill);

  r.render(scene, cam);
  return r.domElement.toDataURL("image/png");
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    }
  });
}

/**
 * Render `build()` once into the shared offscreen canvas and cache the
 * result as a PNG data URL under `cacheKey`. Disposes the built object's
 * geometry/materials after rendering — the renderer is reused, the scene
 * content isn't.
 */
export function renderThumb(
  cache: Map<string, string>,
  cacheKey: string,
  build: () => THREE.Object3D,
  framing: ThumbFraming = {}
): string | null {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const r = ensureRenderer();
  if (!r) return null;

  const obj = build();
  const url = renderObject(r, obj, framing);
  cache.set(cacheKey, url);
  disposeObject(obj);
  return url;
}

/**
 * Same as `renderThumb`, but for a source that can only be built
 * asynchronously — a GLTF hero model loaded off the network, rather than
 * procedural geometry built in a tick (see heroThumb.ts). Not cached on the
 * synchronous path: callers await this once and cache the resolved URL
 * themselves (or reuse `cache`, checked/set the same way).
 */
export async function renderThumbAsync(
  cache: Map<string, string>,
  cacheKey: string,
  build: () => Promise<THREE.Object3D>,
  framing: ThumbFraming = {}
): Promise<string | null> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const r = ensureRenderer();
  if (!r) return null;

  const obj = await build();
  const url = renderObject(r, obj, framing);
  cache.set(cacheKey, url);
  disposeObject(obj);
  return url;
}
