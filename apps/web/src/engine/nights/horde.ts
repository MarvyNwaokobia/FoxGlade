/**
 * The horde: hundreds of walkers, simulated as flat typed arrays.
 *
 * This is the load-bearing decision of the whole mode, so it is worth stating
 * plainly. Foxglade's NPCs are skinned GLBs, one `AnimationMixer` each. That is
 * correct for five blockers and hopeless for two hundred walkers — a browser
 * will not animate two hundred independent skinned meshes anywhere near 60fps.
 *
 * So a walker is not an object here. It is a slot in a set of parallel arrays,
 * drawn as one instance of one shared mesh in a single draw call. No per-entity
 * allocation, no garbage, no scene-graph node. The whole crowd is one draw.
 *
 * You lose per-enemy skeletal animation and you do not miss it: at this density
 * the player reads the SHAPE of the crowd and never an individual's elbow. Bob
 * and lean are enough to sell walking, and both are cheap matrix maths.
 *
 * Kept free of THREE and React on purpose — this is the part that has to be
 * measurable and testable without a renderer.
 */

/** Uniform grid cell size (metres) for neighbour lookups. */
const CELL = 2;

export interface HordeParams {
  /** Hard ceiling on live walkers. Storage is allocated once, up front. */
  max: number;
  /** Metres per second. */
  speed: number;
  /** How hard walkers push out of each other. */
  separation: number;
  /** Body radius, for separation and for being shot. */
  radius: number;
  /** Half-extent of the playable square. */
  half: number;
}

export const HORDE_DEFAULTS: HordeParams = {
  max: 400,
  speed: 2.4,
  separation: 9,
  radius: 0.42,
  half: 40,
};

export class Horde {
  readonly p: HordeParams;
  /** Interleaved x,z per slot. */
  readonly pos: Float32Array;
  /** Interleaved x,z velocity, kept so steering can ease rather than snap. */
  readonly vel: Float32Array;
  /** 1 = live. Dead slots are recycled by `spawn`. */
  readonly alive: Uint8Array;
  readonly hp: Float32Array;
  /** Per-walker phase so the crowd doesn't bob in lockstep. */
  readonly phase: Float32Array;
  /** Facing angle, eased toward travel direction. */
  readonly yaw: Float32Array;
  /** performance.now-style clock of the last hit, for a flash on damage. */
  readonly hitAt: Float32Array;

  /** How many slots are currently live. */
  count = 0;
  /** Next slot to try when spawning (round-robin, so we don't rescan from 0). */
  private cursor = 0;

  // --- neighbour grid ---
  private readonly cols: number;
  private readonly cellStart: Int32Array;
  private readonly cellCount: Int32Array;
  private readonly order: Int32Array;
  private readonly cellOf: Int32Array;

  constructor(params: Partial<HordeParams> = {}) {
    this.p = { ...HORDE_DEFAULTS, ...params };
    const n = this.p.max;
    this.pos = new Float32Array(n * 2);
    this.vel = new Float32Array(n * 2);
    this.alive = new Uint8Array(n);
    this.hp = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.hitAt = new Float32Array(n).fill(-1);

    this.cols = Math.ceil((this.p.half * 2) / CELL) + 1;
    const cells = this.cols * this.cols;
    this.cellStart = new Int32Array(cells + 1);
    this.cellCount = new Int32Array(cells);
    this.order = new Int32Array(n);
    this.cellOf = new Int32Array(n);
  }

  /** Put a walker at (x, z). Returns its slot, or -1 when the horde is full. */
  spawn(x: number, z: number, hp: number): number {
    const n = this.p.max;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (this.alive[i]) continue;
      this.cursor = (i + 1) % n;
      this.alive[i] = 1;
      this.pos[i * 2] = x;
      this.pos[i * 2 + 1] = z;
      this.vel[i * 2] = 0;
      this.vel[i * 2 + 1] = 0;
      this.hp[i] = hp;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.yaw[i] = 0;
      this.hitAt[i] = -1;
      this.count++;
      return i;
    }
    return -1;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
  }

  /** Apply damage. Returns true if this hit killed it. */
  damage(i: number, amount: number, now: number): boolean {
    if (!this.alive[i]) return false;
    this.hp[i] -= amount;
    this.hitAt[i] = now;
    if (this.hp[i] <= 0) {
      this.kill(i);
      return true;
    }
    return false;
  }

  /**
   * Rebuild the uniform grid, so separation is a scan of nine cells rather than
   * of the whole crowd. Naive all-pairs separation is O(n²) — at 400 walkers
   * that is 160,000 distance checks every frame, which is the actual reason
   * crowds like this normally fall over.
   */
  private rebuildGrid(): void {
    const { cols } = this;
    const cells = cols * cols;
    this.cellCount.fill(0);
    const half = this.p.half;

    for (let i = 0; i < this.p.max; i++) {
      if (!this.alive[i]) {
        this.cellOf[i] = -1;
        continue;
      }
      const cx = Math.min(cols - 1, Math.max(0, ((this.pos[i * 2] + half) / CELL) | 0));
      const cz = Math.min(cols - 1, Math.max(0, ((this.pos[i * 2 + 1] + half) / CELL) | 0));
      const c = cz * cols + cx;
      this.cellOf[i] = c;
      this.cellCount[c]++;
    }
    let running = 0;
    for (let c = 0; c < cells; c++) {
      this.cellStart[c] = running;
      running += this.cellCount[c];
    }
    this.cellStart[cells] = running;
    // Reuse cellCount as a per-cell write cursor.
    this.cellCount.fill(0);
    for (let i = 0; i < this.p.max; i++) {
      const c = this.cellOf[i];
      if (c < 0) continue;
      this.order[this.cellStart[c] + this.cellCount[c]++] = i;
    }
  }

  /**
   * Advance the crowd toward (tx, tz).
   *
   * Deliberately dumb steering: walk at the target, push out of your neighbours.
   * That is the whole behaviour, and it is the right one — a survivor-like wants
   * the crowd to read as a tide rather than as two hundred individuals making
   * decisions. Cleverness per walker would cost frames and buy nothing.
   */
  step(dt: number, tx: number, tz: number): void {
    this.rebuildGrid();
    const { cols } = this;
    const { speed, separation, radius, half } = this.p;
    const minGap = radius * 2;

    for (let i = 0; i < this.p.max; i++) {
      if (!this.alive[i]) continue;
      const x = this.pos[i * 2];
      const z = this.pos[i * 2 + 1];

      let dx = tx - x;
      let dz = tz - z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;

      // Separation from the eight surrounding cells plus our own.
      let sx = 0;
      let sz = 0;
      const cx = this.cellOf[i] % cols;
      const cz = (this.cellOf[i] / cols) | 0;
      for (let oz = -1; oz <= 1; oz++) {
        const gz = cz + oz;
        if (gz < 0 || gz >= cols) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          if (gx < 0 || gx >= cols) continue;
          const c = gz * cols + gx;
          const from = this.cellStart[c];
          const to = this.cellStart[c + 1];
          for (let k = from; k < to; k++) {
            const j = this.order[k];
            if (j === i) continue;
            const ax = x - this.pos[j * 2];
            const az = z - this.pos[j * 2 + 1];
            const dist2 = ax * ax + az * az;
            if (dist2 > minGap * minGap || dist2 < 1e-6) continue;
            const inv = 1 / Math.sqrt(dist2);
            const push = (minGap - 1 / inv) * inv;
            sx += ax * push;
            sz += az * push;
          }
        }
      }

      const vx = dx * speed + sx * separation;
      const vz = dz * speed + sz * separation;
      this.vel[i * 2] = vx;
      this.vel[i * 2 + 1] = vz;

      let nx = x + vx * dt;
      let nz = z + vz * dt;
      // Stay inside the arena.
      if (nx < -half) nx = -half;
      else if (nx > half) nx = half;
      if (nz < -half) nz = -half;
      else if (nz > half) nz = half;
      this.pos[i * 2] = nx;
      this.pos[i * 2 + 1] = nz;

      // Face travel, eased so the crowd doesn't snap-rotate on contact.
      const want = Math.atan2(vx, vz);
      let df = want - this.yaw[i];
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.yaw[i] += df * Math.min(1, 8 * dt);
      this.phase[i] += dt * 9;
    }
  }

  /** Nearest live walker to a point within `range`, or -1. */
  nearest(x: number, z: number, range: number): number {
    let best = -1;
    let bestD = range * range;
    for (let i = 0; i < this.p.max; i++) {
      if (!this.alive[i]) continue;
      const dx = this.pos[i * 2] - x;
      const dz = this.pos[i * 2 + 1] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  }

  /** Live walkers within `r` of a point, appended to `out` as slot indices. */
  within(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const r2 = r * r;
    for (let i = 0; i < this.p.max; i++) {
      if (!this.alive[i]) continue;
      const dx = this.pos[i * 2] - x;
      const dz = this.pos[i * 2 + 1] - z;
      if (dx * dx + dz * dz <= r2) out.push(i);
    }
    return out;
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
  }
}
