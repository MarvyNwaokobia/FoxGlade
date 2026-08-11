/**
 * XP motes: what a walker leaves behind.
 *
 * Same shape as the horde — flat arrays, one draw call — because a good minute
 * of this game leaves several hundred of them on the floor at once, and they are
 * the thing pulling the player through the crowd. Collecting them is most of the
 * reason to move somewhere dangerous.
 */
import { NIGHTS } from "./run";

export class Motes {
  readonly max: number;
  readonly pos: Float32Array; // interleaved x,z
  readonly alive: Uint8Array;
  readonly value: Float32Array;
  readonly bob: Float32Array;
  count = 0;
  private cursor = 0;

  constructor(max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 2);
    this.alive = new Uint8Array(max);
    this.value = new Float32Array(max);
    this.bob = new Float32Array(max);
  }

  drop(x: number, z: number, value = 1): void {
    for (let k = 0; k < this.max; k++) {
      const i = (this.cursor + k) % this.max;
      if (this.alive[i]) continue;
      this.cursor = (i + 1) % this.max;
      this.alive[i] = 1;
      this.pos[i * 2] = x;
      this.pos[i * 2 + 1] = z;
      this.value[i] = value;
      this.bob[i] = Math.random() * Math.PI * 2;
      this.count++;
      return;
    }
    // Full: silently drop it. Losing a mote in a screen already carpeted with
    // them is invisible, and growing the pool mid-run is not.
  }

  /**
   * Pull motes toward the player and collect the ones that reach them.
   * Returns the XP picked up this step.
   *
   * The magnet is deliberately wider than the pickup radius: the reach is what
   * makes walking INTO the crowd feel rewarding rather than merely survivable.
   */
  step(dt: number, px: number, pz: number, magnet: number): number {
    let gained = 0;
    const mag2 = magnet * magnet;
    const pick2 = NIGHTS.pickupRadius * NIGHTS.pickupRadius;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.bob[i] += dt * 3;
      const dx = px - this.pos[i * 2];
      const dz = pz - this.pos[i * 2 + 1];
      const d2 = dx * dx + dz * dz;
      if (d2 <= pick2) {
        this.alive[i] = 0;
        this.count--;
        gained += this.value[i];
        continue;
      }
      if (d2 <= mag2) {
        const d = Math.sqrt(d2) || 1;
        // Accelerate as they close, so the last stretch snaps in.
        const pull = NIGHTS.magnetSpeed * (1.1 - d / magnet) * dt;
        this.pos[i * 2] += (dx / d) * pull;
        this.pos[i * 2 + 1] += (dz / d) * pull;
      }
    }
    return gained;
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
  }
}
