import * as THREE from "three";

/**
 * @module character/ViewArms
 * @description First-person arms — the pair of gloved hands holding the weapon.
 *
 * A viewmodel without them is the complaint that produced this file: "the gun
 * just floats, no sense of personality attached to it." Entirely correct. A
 * weapon hanging in space is a prop being carried by the camera; hands on it are
 * what make it a thing a person is holding, and every bit of body language the
 * viewmodel performs afterwards (sprint, recoil, reload) only reads because
 * there are arms to perform it.
 *
 * Built from primitives, like the guns in GunMesh, so there is no binary to
 * download and the two match — a fitted low-poly weapon with a downloaded
 * realistic hand on it looks far worse than either alone.
 *
 * GLOVED on purpose. Bare hands would force a skin tone, and a skin tone is a
 * character decision (Foxglade casts its village deliberately — see the design
 * notes); gloves stay neutral until Nighthaul knows who it's about, and read
 * better at this poly count besides.
 *
 * ── SPACE ──
 * Everything here is authored in the GUN's local space, because the arms are
 * parented to the gun so the hands stay welded to it through recoil, sway and
 * bob without a line of per-frame code. In that space +Z is the muzzle
 * direction and the origin is the grip. The viewmodel then rotates the gun by π
 * to point it downrange, so gun-local +X ends up on SCREEN-LEFT — which is why
 * the right shoulder below sits at negative X.
 */

// VALUE, not hue, is what makes the arms read. The guns are near-black, so
// near-black sleeves merge with them into one dark slab and the weapon goes back
// to looking like it floats — which is what the first pass did, and no amount of
// geometry fixed it. The sleeve is therefore several stops LIGHTER than any
// weapon, and the glove sits between the two so the wrist joint reads as a joint.
const SLEEVE = 0x6d7263; // desaturated olive drab — clearly lighter than any gun
const GLOVE = 0x3c4046; // dark glove, still well off the weapon's black
const CUFF = 0x4e5346; // the band where glove meets sleeve

const matte = (color: number, rough = 1) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.25 });

/**
 * A tapered limb segment from `from` to `to`. Cylinders are built along +Y, so
 * the segment is centred on the midpoint and then rotated onto the bone vector.
 */
function bone(
  from: THREE.Vector3,
  to: THREE.Vector3,
  rFrom: number,
  rTo: number,
  mat: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTo, rFrom, len, 8), mat);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** A fist wrapped around something: palm block, four knuckles, opposed thumb. */
function hand(at: THREE.Vector3, yaw: number, mat: THREE.Material, thumbMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(at);
  g.rotation.y = yaw;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.105, 0.09), mat);
  g.add(palm);

  // Knuckles across the front of the palm — four small blocks, so the silhouette
  // has fingers rather than being a mitten.
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.052, 0.062), mat);
    f.position.set(-0.027 + i * 0.018, -0.055, 0.022);
    f.rotation.x = 0.5;
    g.add(f);
  }

  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.055, 0.03), thumbMat);
  thumb.position.set(0.03, -0.022, -0.042);
  thumb.rotation.set(-0.4, 0, -0.3);
  g.add(thumb);

  return g;
}

/**
 * One arm: gloved hand at the weapon, forearm to a bent elbow, then a short
 * stub that leaves the frame.
 *
 * The arm deliberately does NOT run back to a shoulder. A shoulder placed where
 * a real one would be sits ~0.35m from the lens, and a limb pointed almost
 * straight down the view axis foreshortens into an enormous tube that swallows
 * the lower third of the screen — which is exactly what the first attempt did.
 * Ending just past the elbow, angled steeply DOWN rather than back, keeps the
 * arms at a readable distance and lets them exit under the frame instead.
 */
function arm(
  handAt: THREE.Vector3,
  elbow: THREE.Vector3,
  exit: THREE.Vector3,
  handYaw: number,
  glove: THREE.Material,
  sleeve: THREE.Material,
  cuff: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  g.add(hand(handAt, handYaw, glove, cuff));
  // Wrist band where glove meets sleeve — the join is what stops the forearm
  // reading as one undifferentiated tube.
  const wrist = new THREE.Vector3().lerpVectors(handAt, elbow, 0.18);
  g.add(bone(handAt, wrist, 0.036, 0.042, cuff));
  g.add(bone(wrist, elbow, 0.042, 0.052, sleeve));
  g.add(bone(elbow, exit, 0.055, 0.062, sleeve));
  // Elbow cap, so the two segments don't show their seam when the arm bends.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.053, 8, 6), sleeve);
  cap.position.copy(elbow);
  g.add(cap);
  return g;
}

/**
 * Build the arm pair. Coordinates are in gun-local space (see the module note):
 * the right hand takes the grip at the origin, the left hand reaches forward
 * onto the handguard, and both shoulders sit low and behind so the arms run off
 * the bottom of the frame instead of ending in mid-air.
 */
export function makeViewArms(): THREE.Group {
  const g = new THREE.Group();
  g.name = "viewarms";

  const glove = matte(GLOVE, 0.92);
  const sleeve = matte(SLEEVE);
  const cuff = matte(CUFF, 0.9);

  // Hands are pushed to local +X — the face of the weapon that is TOWARD the
  // lens once the gun is rotated and offset to the right of screen. On the
  // centreline where a real grip sits, the receiver occludes them completely and
  // the arms appear to end at the weapon's silhouette rather than hold it.

  // Trigger hand — at the grip, wrapped round the near face.
  g.add(
    arm(
      new THREE.Vector3(0.052, -0.085, -0.03),
      new THREE.Vector3(-0.02, -0.33, -0.16),
      new THREE.Vector3(-0.09, -0.66, -0.22),
      0.25,
      glove,
      sleeve,
      cuff
    )
  );

  // Support hand — forward on the handguard, reaching across from the far side,
  // which is what gives the pair its asymmetry and stops it reading as a puppet.
  g.add(
    arm(
      new THREE.Vector3(0.058, -0.062, 0.19),
      new THREE.Vector3(0.24, -0.3, 0.07),
      new THREE.Vector3(0.32, -0.64, -0.03),
      -0.35,
      glove,
      sleeve,
      cuff
    )
  );

  return g;
}
