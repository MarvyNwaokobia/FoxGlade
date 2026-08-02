import * as THREE from "three";

/**
 * Per-archetype silhouette kit.
 *
 * The single biggest read problem in the game: five NPC roles built from the
 * same Mixamo body, so at any real distance they are one shape in five
 * textures. A player has to know — instantly, from across a plaza — whether the
 * figure ahead is the guardian whose word is good, a villager who might be
 * lying, or a blocker about to shoot. Right now they find out by walking up to
 * it, which in a game with a day clock is a tax on the only resource that
 * matters.
 *
 * The fix a studio would reach for is five character models. We don't need them
 * to solve the read: silhouette does almost all of that work, and silhouette can
 * be bolted onto the rig we already have. Each role gets one shape modifier that
 * changes its outline — the blocker goes WIDE (pauldrons, a shield on the back),
 * the villager goes ROUND AND LOW (a sack over the shoulder), the thief goes
 * NARROW (hood up, nothing else), the guardian goes TALL (a staff with a lantern
 * on it) — plus a role colour that is consistent everywhere it appears.
 *
 * These are the same procedural-mesh techniques GunMesh.ts already uses to build
 * the rifles, socketed to bones the same way, so nothing new is being invented
 * and no assets are being bought.
 */

export type Archetype = "blocker" | "villager" | "thief" | "guardian";

/**
 * Role colours. Used for the kit itself AND (see the HUD/markers) anywhere else
 * the role is signalled, so the association is learned once and holds.
 */
export const ROLE_COLOR: Record<Archetype, number> = {
  blocker: 0x8c3b2f, // rust red — danger
  villager: 0x6b6a3f, // muddy green — doubt
  thief: 0x1d1c22, // near-black — don't trust it
  guardian: 0xc9922f, // warm gold — the one voice that's true
};

/** Which bone each piece of kit hangs off. */
export interface KitPiece {
  bone: "head" | "spine" | "hand";
  object: THREE.Object3D;
  /** Local offset + rotation applied after the bone transform. */
  offset: THREE.Vector3;
  euler: THREE.Euler;
  /** Uniform scale relative to the rig (rigs vary a little in height). */
  scale: number;
  /**
   * Ignore the bone's rotation and keep the piece world-upright, tracking only
   * its position. A staff rests on the ground and stays vertical however the
   * hand that holds it is posed — inheriting the hand's rotation made the
   * guardian swing his two-metre staff around like a sledgehammer.
   */
  upright?: boolean;
}

const matte = (color: number, rough = 0.95) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

/** A hood: a tapered cone shell sat over the skull, open at the front. */
function hood(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    // Open-ended sphere segment — a cowl, not a helmet.
    new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, side: THREE.DoubleSide })
  );
  shell.scale.set(1.12, 1.25, 1.18);
  g.add(shell);
  // The peak — what actually makes a hood read as a hood in silhouette.
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), matte(color, 1));
  peak.position.set(0, 0.11, -0.05);
  peak.rotation.x = -0.5;
  g.add(peak);
  return g;
}

/** Pauldrons + a slung round shield: the widest outline in the game. */
function warKit(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const steel = matte(0x6a6b70, 0.55);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
    p.scale.set(1.5, 1, 1.15);
    p.position.set(side * 0.2, 0.16, 0);
    p.rotation.z = side * 0.3;
    g.add(p);
  }
  // Shield on the back — a disc plus a boss, tilted off-square.
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 16), matte(color, 0.8));
  shield.rotation.set(Math.PI / 2, 0, 0.35);
  shield.position.set(-0.03, 0.02, -0.19);
  g.add(shield);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), steel);
  boss.position.set(-0.03, 0.02, -0.215);
  g.add(boss);
  return g;
}

/** A bulging sack over one shoulder — rounds the outline and drops it. */
function sack(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 9), matte(color, 1));
  bag.scale.set(1, 1.15, 0.85);
  bag.position.set(-0.16, -0.04, -0.16);
  g.add(bag);
  // The tie at the neck of it.
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.09, 8), matte(0x4a3f2a, 1));
  tie.position.set(-0.16, 0.17, -0.16);
  g.add(tie);
  // Strap across the chest, so it reads as carried rather than stuck on.
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 16, Math.PI * 1.1), matte(0x4a3f2a, 1));
  strap.rotation.set(0.2, 0.5, 0.6);
  g.add(strap);
  return g;
}

/** A tall staff topped with a lit lantern — a vertical you can spot anywhere. */
function staff(color: number): THREE.Object3D {
  const g = new THREE.Group();
  // Chunky on purpose. At 22 mm the shaft was three pixels wide across a plaza —
  // technically present, useless as the landmark it exists to be. The whole
  // point of the guardian's kit is that you can pick him out at range.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.0, 8), matte(0x4a3a26, 1));
  g.add(shaft);
  const cap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.032, 6, 14), matte(0x6a6b70, 0.5));
  cap.position.y = 1.0;
  cap.rotation.x = Math.PI / 2;
  g.add(cap);
  // The lantern: emissive and tone-mapping-exempt so it holds up at night, when
  // knowing which figure is the honest one matters most.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.22, 0.17),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      // Bright enough to find at night, dim enough not to blow out. At 2.2 with
      // toneMapped off, the bloom pass turned it into a pale cone the size of the
      // guardian's head once the lanterns came up at dusk.
      emissiveIntensity: 1.15,
      roughness: 0.4,
      toneMapped: false,
    })
  );
  glass.position.set(0, 0.86, 0);
  g.add(glass);
  return g;
}

/**
 * Build the kit for a role. Returns the pieces to socket; the rig drives their
 * world matrices off the named bones each frame.
 */
export function buildArchetypeKit(role: Archetype): KitPiece[] {
  const c = ROLE_COLOR[role];
  switch (role) {
    case "blocker":
      return [
        { bone: "spine", object: warKit(c), offset: new THREE.Vector3(0, 0.1, 0), euler: new THREE.Euler(), scale: 1 },
      ];
    case "villager":
      return [
        { bone: "spine", object: sack(c), offset: new THREE.Vector3(0, 0.12, 0), euler: new THREE.Euler(), scale: 1 },
      ];
    case "thief":
      return [
        { bone: "head", object: hood(c), offset: new THREE.Vector3(0, 0.07, 0.01), euler: new THREE.Euler(), scale: 1 },
      ];
    case "guardian":
      return [
        {
          bone: "hand",
          object: staff(c),
          // Gripped a little below centre so the butt sits near the ground, and
          // canted a few degrees the way someone leans on one.
          offset: new THREE.Vector3(0.06, 0.15, 0.04),
          euler: new THREE.Euler(0.05, 0, 0.1),
          scale: 1,
          upright: true,
        },
      ];
  }
}
