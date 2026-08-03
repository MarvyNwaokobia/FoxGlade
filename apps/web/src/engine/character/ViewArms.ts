import * as THREE from "three";

/**
 * @module character/ViewArms
 * @description First-person hands — graybox blocks gripping the weapon.
 *
 * PORTED FROM VALOR, which solves this with a single 6cm box and a comment that
 * reads "simple graybox hands so the first person reads". That is the whole
 * thing, and it is right: what sells a first-person weapon is the CAMERA drift
 * and the viewmodel motion, not sculpted anatomy. An earlier pass here built
 * jointed arms with elbows, wrists, knuckles and an opposed thumb, and the
 * weapon still read as floating — because the fault was never the arms.
 *
 * Two blocks rather than Valor's one, since these guns have a real handguard and
 * an empty support hand looks worse than no hand at all. Kept deliberately blunt:
 * a detailed hand next to a primitive-built gun looks worse than either alone.
 *
 * Authored in the WEAPON's local space — +Z is the muzzle direction, the origin
 * is the grip — because the hands are parented to the gun so they stay welded to
 * it through recoil, bob and wall pullback with no per-frame code.
 */

/** Valor's glove tone. Warm and mid-value: it has to separate from a near-black weapon. */
const GLOVE = 0x6b5b4d;

export function makeViewArms(): THREE.Group {
  const g = new THREE.Group();
  g.name = "viewarms";

  const mat = new THREE.MeshStandardMaterial({
    color: GLOVE,
    roughness: 0.8,
    metalness: 0,
    envMapIntensity: 0.25,
  });

  // Trigger hand at the grip, and support hand forward on the handguard. Both
  // pushed to +X, the face of the weapon that ends up toward the lens once the
  // gun is turned and offset right — on the centreline the receiver hides them.
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.15), mat);
  trigger.position.set(0.035, -0.055, -0.02);
  g.add(trigger);

  const support = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.14), mat);
  support.position.set(0.04, -0.045, 0.2);
  g.add(support);

  return g;
}
