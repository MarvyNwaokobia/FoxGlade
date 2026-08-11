import { describe, expect, it, beforeEach } from "vitest";
import * as THREE from "three";
import { MAX_PROJECTILES, projectilePool, spawnProjectile, stepProjectiles } from "../projectiles";
import { blockerStats } from "@/engine/config/round";
import { runtime } from "@/engine/runtime";

/** Somewhere open — the spawn gate, well clear of any building box. */
const OPEN = new THREE.Vector3(0, 0, 30);

function clearPool() {
  for (const p of projectilePool) {
    p.active = false;
    p.damage = 0;
  }
}

/** Fire a round from 1m in front of the player, straight at their chest. */
function fireAtPlayer(damage: number) {
  spawnProjectile(
    new THREE.Vector3(OPEN.x, 1.0, OPEN.z + 1),
    new THREE.Vector3(0, 0, -1),
    10,
    damage
  );
}

beforeEach(() => {
  clearPool();
  runtime.playerPos.copy(OPEN);
  runtime.crouching = false;
  // Keep the fox out of the line of fire so it can't eat the round.
  runtime.foxState = "down";
  runtime.foxPos.set(200, 0, 200);
});

describe("a round carries its shooter's damage", () => {
  it("hands the player the damage it was fired with, not a shared default", () => {
    fireAtPlayer(14);
    let landed: number | null = null;
    // 0.1s at 10 m/s closes the 1m gap.
    stepProjectiles(0.1, (p) => { landed = p.damage; });
    expect(landed).toBe(14);
  });

  it("keeps the rusher and the holder distinct all the way to the player", () => {
    // The regression this guards: damage used to be read from the shared
    // BLOCKER config at the moment of impact, so both roles landed for 9 and
    // the whole point of the role split — one that chips you, one that bites —
    // never reached the player at all.
    const rusher = blockerStats("rusher").shotDamage;
    const holder = blockerStats("holder").shotDamage;
    expect(rusher).not.toBe(holder);

    const landed: number[] = [];
    for (const dmg of [rusher, holder]) {
      clearPool();
      fireAtPlayer(dmg);
      stepProjectiles(0.1, (p) => { landed.push(p.damage); });
    }
    expect(landed).toEqual([rusher, holder]);
  });

  it("does not let one shooter's damage leak into the next round from the pool", () => {
    // Pool slots are reused, so a stale `damage` on a recycled slot would be a
    // quiet way for this bug to come back.
    fireAtPlayer(14);
    stepProjectiles(0.1, () => {});

    clearPool();
    // Re-fire without going through spawnProjectile's damage argument would be
    // the bug; going through it must fully overwrite the slot.
    fireAtPlayer(7);
    let landed: number | null = null;
    stepProjectiles(0.1, (p) => { landed = p.damage; });
    expect(landed).toBe(7);
  });
});

describe("the pool stays well-behaved", () => {
  it("frees the slot once a round has connected", () => {
    fireAtPlayer(9);
    expect(projectilePool.filter((p) => p.active)).toHaveLength(1);
    stepProjectiles(0.1, () => {});
    expect(projectilePool.filter((p) => p.active)).toHaveLength(0);
  });

  it("never allocates past its fixed size", () => {
    for (let i = 0; i < MAX_PROJECTILES + 20; i++) fireAtPlayer(9);
    expect(projectilePool).toHaveLength(MAX_PROJECTILES);
    expect(projectilePool.filter((p) => p.active).length).toBeLessThanOrEqual(MAX_PROJECTILES);
  });
});
