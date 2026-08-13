import * as THREE from "three";
import { CLIP_NAMES, getClipStride } from "./MixamoLoader";

// Mixamo clips are authored in centimetres; the characters live in a metre-scaled
// world. So a clip's baked ground speed (clip-units/sec) divided by this is its
// real-world m/s. (walk ≈ 1.79 m/s, run ≈ 4.75 m/s, confirmed in Valor.)
const MIXAMO_UNITS_PER_METER = 100;
// Below this baked speed (clip-units/sec) a clip is treated as in-place — too
// little travel to lock a cadence to, so we fall back to its authored speed.
const MIN_BAKED_STRIDE = 1;
// Hip height (m) of the Mixamo reference skeleton the clips were authored on.
const REF_HIP_HEIGHT_M = 1.0;

export enum AnimState {
  Idle = "idle",
  Walk = "walk",
  Run = "run",
  Fire = "fire",
  Reload = "reload",
  Dodge = "dodge",
  HitLight = "hitLight",
  HitHeavy = "hitHeavy",
  Death = "death",
  Victory = "victory",
  Throw = "throw",
  Jump = "jump",
  Sit = "sit",
  Drink = "drink",
  Grab = "grab",
  CrouchIdle = "crouchIdle",
  CrouchWalk = "crouchWalk",
  Turn = "turn",
  Vault = "vault",
  // Combat-ready variants (Blockers, once engaged): rifle held up and tracked
  // through the whole cycle instead of a plain unarmed walk/run/idle.
  Aim = "aim",
  CombatWalk = "combatWalk",
  CombatRun = "combatRun",
}

export type HitDirection = "front" | "back" | "side";

/** Which way the body is travelling relative to where it FACES. */
export type MoveDir = "forward" | "back" | "left" | "right";

/**
 * Classify planar velocity (projected on the character's facing) into a MoveDir.
 * The currently-held axis gets 15% stickiness so diagonal movement doesn't
 * flicker between a strafe and a walk every frame.
 */
export function classifyMoveDir(fwdAmt: number, rightAmt: number, current: MoveDir): MoveDir {
  const af = Math.abs(fwdAmt);
  const ar = Math.abs(rightAmt);
  const onFwdAxis = current === "forward" || current === "back";
  const fwdWins = onFwdAxis ? af * 1.15 >= ar : af >= ar * 1.15;
  if (fwdWins) return fwdAmt >= 0 ? "forward" : "back";
  return rightAmt >= 0 ? "right" : "left";
}

interface AnimStateConfig {
  clip: string;
  // Directional locomotion: pick the clip by which way the body travels relative
  // to its facing. A missing 'back' entry plays `clip` REVERSED (negative
  // timeScale) — the standard backpedal trick when no clip exists.
  clipsByMove?: Partial<Record<MoveDir, string>>;
  loop: boolean;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  duration?: number;
  canInterrupt: boolean;
  nextState?: AnimState;
  onComplete?: () => void;
}

export interface AnimationMap {
  [state: string]: AnimStateConfig;
}

// One clip per state the player drives. `tempo` lets us flavour NPC variants
// later (a heavier blocker, a snappier thief) by sharing clips and shifting only
// timing; the player uses tempo 1.0.
export function buildAnimMap(tempo = 1.0): AnimationMap {
  const strafes = { left: CLIP_NAMES.strafeLeft, right: CLIP_NAMES.strafeRight };
  const combatStrafes = { left: CLIP_NAMES.combatStrafeA, right: CLIP_NAMES.combatStrafeB };
  return {
    [AnimState.Idle]: { clip: CLIP_NAMES.rifleIdle, loop: true, speed: tempo, fadeIn: 0.2, fadeOut: 0.2, canInterrupt: true },
    [AnimState.Walk]: { clip: CLIP_NAMES.walk, clipsByMove: strafes, loop: true, speed: 1.0, fadeIn: 0.15, fadeOut: 0.15, canInterrupt: true },
    // No run-speed strafe clips exist — sideways running reuses the walk strafes
    // with cadence over-cranked by matchLocomotionSpeed (clamped, reads fine).
    [AnimState.Run]: { clip: CLIP_NAMES.run, clipsByMove: strafes, loop: true, speed: 1.0 * tempo, fadeIn: 0.12, fadeOut: 0.12, canInterrupt: true },
    // Planted, lining up a shot — the aiming-idle stance instead of the neutral
    // ready pose. Same timings as Idle, different clip.
    [AnimState.Aim]: { clip: CLIP_NAMES.aimIdle, loop: true, speed: tempo, fadeIn: 0.2, fadeOut: 0.2, canInterrupt: true },
    // Closing distance while engaged — rifle held up through the whole stride
    // instead of the plain Walk/Run above. Which strafe file reads as left vs.
    // right isn't determinable from the source filenames; verify at playtest.
    [AnimState.CombatWalk]: { clip: CLIP_NAMES.combatWalk, clipsByMove: combatStrafes, loop: true, speed: 1.0, fadeIn: 0.15, fadeOut: 0.15, canInterrupt: true },
    [AnimState.CombatRun]: { clip: CLIP_NAMES.combatRun, clipsByMove: combatStrafes, loop: true, speed: 1.0 * tempo, fadeIn: 0.12, fadeOut: 0.12, canInterrupt: true },
    [AnimState.Reload]: { clip: CLIP_NAMES.reloading, loop: true, speed: 1.15, fadeIn: 0.1, fadeOut: 0.12, canInterrupt: true },
    [AnimState.Dodge]: { clip: CLIP_NAMES.dodge, loop: false, speed: 1.3, fadeIn: 0.05, fadeOut: 0.12, duration: 0.5, canInterrupt: false, nextState: AnimState.Idle },
    [AnimState.HitLight]: { clip: CLIP_NAMES.hitReaction, loop: false, speed: 1.3, fadeIn: 0.04, fadeOut: 0.12, canInterrupt: false, nextState: AnimState.Idle },
    [AnimState.HitHeavy]: { clip: CLIP_NAMES.gettingHit, loop: false, speed: 1.0, fadeIn: 0.04, fadeOut: 0.18, canInterrupt: false, nextState: AnimState.Idle },
    [AnimState.Death]: { clip: CLIP_NAMES.deathForward, loop: false, speed: 1.0, fadeIn: 0.08, fadeOut: 0, canInterrupt: false },
    [AnimState.Victory]: { clip: CLIP_NAMES.victory, loop: false, speed: 1.0, fadeIn: 0.2, fadeOut: 0, canInterrupt: false },
    // Fire is class-agnostic; played one-shot on each shot, returning to Idle.
    // (Now usually driven as an ADDITIVE upper-body layer in PlayerRig so you can
    // shoot while running — this full-body entry is the fallback if that fails.)
    [AnimState.Fire]: { clip: CLIP_NAMES.gunplayShooting, loop: false, speed: 1.0, fadeIn: 0.04, fadeOut: 0.08, canInterrupt: true, nextState: AnimState.Idle },
    // Bomb lob — a committed full-body one-shot (real clip from Valor).
    [AnimState.Throw]: { clip: CLIP_NAMES.throwBomb, loop: false, speed: 1.1, fadeIn: 0.06, fadeOut: 0.12, canInterrupt: false, nextState: AnimState.Idle },
    // Below are load-gated on Marvy's Mixamo downloads; a missing clip makes the
    // transition a clean no-op (transition() bails when the clip isn't found).
    [AnimState.Jump]: { clip: CLIP_NAMES.jump, loop: false, speed: 1.0, fadeIn: 0.06, fadeOut: 0.14, canInterrupt: true, nextState: AnimState.Idle },
    [AnimState.Sit]: { clip: CLIP_NAMES.sit, loop: true, speed: 1.0, fadeIn: 0.25, fadeOut: 0.2, canInterrupt: true },
    // Drink is a SEATED sip (Mixamo "Sitting Drinking") — return to Sit, not Idle.
    [AnimState.Drink]: { clip: CLIP_NAMES.drink, loop: false, speed: 1.0, fadeIn: 0.2, fadeOut: 0.2, canInterrupt: true, nextState: AnimState.Sit },
    [AnimState.Grab]: { clip: CLIP_NAMES.grab, loop: false, speed: 1.0, fadeIn: 0.1, fadeOut: 0.14, canInterrupt: false, nextState: AnimState.Idle },
    // Crouch locomotion — real clips replacing the old vertical-squash hack.
    [AnimState.CrouchIdle]: { clip: CLIP_NAMES.crouchIdle, loop: true, speed: 1.0, fadeIn: 0.18, fadeOut: 0.18, canInterrupt: true },
    // Only `right` is authored ("Walk Crouching Right"); `left` deliberately has
    // no entry so clipForDir mirrors it by playing that clip in reverse. Mapping
    // both directions to the same clip — as this used to — meant crouching left
    // played a strafe-RIGHT cycle against leftward travel.
    [AnimState.CrouchWalk]: { clip: CLIP_NAMES.crouchWalk, clipsByMove: { right: CLIP_NAMES.crouchStrafe }, loop: true, speed: 1.0, fadeIn: 0.15, fadeOut: 0.15, canInterrupt: true },
    // Turn-in-place shuffle (loop; played only while pivoting on the spot).
    [AnimState.Turn]: { clip: CLIP_NAMES.turn, loop: true, speed: 1.0, fadeIn: 0.12, fadeOut: 0.14, canInterrupt: true },
    // Hurdle over a low obstacle — a committed one-shot on a running jump.
    [AnimState.Vault]: { clip: CLIP_NAMES.vault, loop: false, speed: 1.1, fadeIn: 0.06, fadeOut: 0.14, canInterrupt: true, nextState: AnimState.Idle },
  };
}

/**
 * Which skeleton bones count as "upper body" for the additive run-and-gun layer —
 * the shot/aim clip is masked to these so the legs keep running underneath. Track
 * names are the colon-less mixamorig form (see normalizeBoneTrackName). Spine base
 * stays with the legs (torso bob); Spine1 up + both arms + head are upper.
 */
const UPPER_BODY_BONES = [
  "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
];
export function isUpperBodyTrack(trackName: string): boolean {
  return UPPER_BODY_BONES.some((b) => trackName.startsWith("mixamorig" + b));
}

export class AnimationStateMachine {
  private currentState: AnimState = AnimState.Idle;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: Map<string, THREE.AnimationClip> = new Map();
  private activeAction: THREE.AnimationAction | null = null;
  private animMap: AnimationMap;
  private onStateChange?: (from: AnimState, to: AnimState) => void;
  private paused = false;
  private pendingTransition: { state: AnimState; force: boolean; dir?: HitDirection } | null = null;
  private previousAction: THREE.AnimationAction | null = null;
  // This character's hip height ÷ reference, so locomotion cadence accounts for
  // leg length (set once the rig is bound; 1 = same size as the clip's rig).
  private rigScale = 1;
  // Travel direction relative to facing — picks strafe/backpedal locomotion clips.
  private moveDir: MoveDir = "forward";
  // True while the current locomotion clip is being played REVERSED (backpedal).
  private locoReversed = false;
  // Continuous travel direction (unit-ish, relative to facing) — drives the
  // locomotion blend so a diagonal mixes walk and strafe instead of picking one.
  private moveFwd = 1;
  private moveRight = 0;
  // The second locomotion clip riding alongside `activeAction`, and whether it
  // has to run backwards for its direction.
  private blendAction: THREE.AnimationAction | null = null;
  private blendReversed = false;

  constructor(animMap: AnimationMap) {
    this.animMap = animMap;
  }

  init(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
    this.mixer = mixer;
    mixer.stopAllAction();
    this.activeAction = null;
    this.previousAction = null;
    this.currentState = AnimState.Idle;
    this.clips.clear();
    for (const clip of clips) {
      this.clips.set(clip.name, clip);
    }
    this.transition(AnimState.Idle, true);
  }

  /**
   * The clip a state plays for one travel direction, and whether it has to run
   * BACKWARDS to represent it.
   *
   * Reversal used to be hard-coded to "back with no clip". That left the crouch
   * set silently broken: it mapped BOTH `left` and `right` to the single
   * right-authored `crouchStrafe`, so a clip existed for `left`, no reversal
   * triggered, and crouch-strafing left played a strafe-right cycle — the
   * character's legs crossing the wrong way while he slid the other direction.
   * A lateral clip reversed is the mirror move, which is exactly what the
   * loader's own comment ("right; reversed = left") intended.
   */
  private clipForDir(config: AnimStateConfig, dir: MoveDir): { name: string; reversed: boolean } {
    const by = config.clipsByMove;
    if (!by) return { name: config.clip, reversed: false };
    const exact = by[dir];
    if (exact && this.clips.has(exact)) return { name: exact, reversed: false };
    // No clip for this direction — run its opposite backwards.
    const opposite: Record<MoveDir, MoveDir> = {
      forward: "back",
      back: "forward",
      left: "right",
      right: "left",
    };
    const mirrorName = dir === "back" ? config.clip : by[opposite[dir]];
    if (mirrorName && this.clips.has(mirrorName)) return { name: mirrorName, reversed: true };
    return { name: config.clip, reversed: false };
  }

  // Picks which clip a state plays this entry (directional locomotion, or the
  // fixed clip).
  private resolveClipName(config: AnimStateConfig): string {
    if (config.clipsByMove) {
      const { name, reversed } = this.clipForDir(config, this.moveDir);
      this.locoReversed = reversed;
      return name;
    }
    this.locoReversed = false;
    return config.clip;
  }

  get state(): AnimState {
    return this.currentState;
  }

  /**
   * Whether this state's clip is actually loaded right now (respecting the
   * current travel direction for directional states). Some states are
   * load-gated on a Mixamo file Marvy hasn't dropped in yet (see MixamoLoader) —
   * this lets a caller check first and fall back to a state it KNOWS has a
   * clip, instead of calling `transition()` and having it silently no-op,
   * which would freeze the character's animation while its body keeps moving.
   */
  hasClip(state: AnimState): boolean {
    const config = this.animMap[state];
    if (!config) return false;
    const name = config.clipsByMove ? this.clipForDir(config, this.moveDir).name : config.clip;
    return this.clips.has(name);
  }

  /** Name of the clip currently playing. */
  get currentClipName(): string | null {
    return this.activeAction?.getClip().name ?? null;
  }

  setOnStateChange(cb: (from: AnimState, to: AnimState) => void) {
    this.onStateChange = cb;
  }

  transitionHit(newState: AnimState, dir: HitDirection) {
    this.transition(newState, true, dir);
  }

  /**
   * Feed the character's planar velocity projected on its facing (forward and
   * right components).
   *
   * This used to pick ONE of four clips and, on any change, force a full
   * re-transition — which resets the action to time 0. On a diagonal the forward
   * and lateral components are near-equal, so ordinary speed wobble flipped the
   * choice and restarted the stride mid-step: the feet visibly stuttered and
   * re-planted every time you ran a corner. And because only one clip ever
   * played, 45° travel was animated as either pure-forward or pure-strafe — the
   * legs simply lying about where the body was going.
   *
   * Now the direction is kept as a continuous vector. A dominant clip is still
   * chosen (with the same stickiness, so `currentClipName` and the derived pose
   * drop stay stable), but the OTHER axis plays alongside it at a proportional
   * weight — so a diagonal is a real mix of walk and strafe, and the moment the
   * dominant axis changes hands the two clips are already sitting at ~50/50,
   * which makes the swap invisible instead of a hitch.
   */
  setMoveDirection(fwdAmt: number, rightAmt: number) {
    const mag = Math.hypot(fwdAmt, rightAmt);
    if (mag > 1e-4) {
      this.moveFwd = fwdAmt / mag;
      this.moveRight = rightAmt / mag;
    }
    const dir = classifyMoveDir(fwdAmt, rightAmt, this.moveDir);
    if (dir === this.moveDir) return;
    this.moveDir = dir;
    if (this.isLoco(this.currentState)) {
      this.transition(this.currentState, true);
    }
  }

  /**
   * Drive the secondary locomotion clip's weight from the travel vector. Called
   * every frame while moving (from matchLocomotionSpeed, which already runs
   * there). Outside locomotion the secondary is faded out and dropped.
   */
  private updateLocoBlend() {
    const config = this.animMap[this.currentState];
    if (!this.mixer || !this.isLoco(this.currentState) || !config?.clipsByMove || !this.activeAction) {
      this.clearLocoBlend();
      return;
    }

    const f = Math.abs(this.moveFwd);
    const r = Math.abs(this.moveRight);
    const total = f + r;
    if (total < 1e-4) {
      this.clearLocoBlend();
      return;
    }

    // Whichever axis ISN'T driving the dominant clip is the one to blend in.
    const primaryIsFwd = this.moveDir === "forward" || this.moveDir === "back";
    const secondaryDir: MoveDir = primaryIsFwd
      ? this.moveRight >= 0
        ? "right"
        : "left"
      : this.moveFwd >= 0
        ? "forward"
        : "back";
    const secondaryWeight = (primaryIsFwd ? r : f) / total;

    const { name, reversed } = this.clipForDir(config, secondaryDir);
    const clip = this.clips.get(name);
    // Nothing to blend with (the axes resolved to the same clip, or it's missing):
    // fall back to the dominant clip alone at full weight.
    if (!clip || name === this.activeAction.getClip().name) {
      this.clearLocoBlend();
      this.activeAction.setEffectiveWeight(1);
      return;
    }

    if (this.blendAction?.getClip() !== clip) {
      this.clearLocoBlend();
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.reset().play();
      // Enter in phase with the clip it's blending against, so the two cycles
      // agree on which foot is planted rather than fighting each other.
      action.time = this.phaseOf(this.activeAction) * clip.duration;
      this.blendAction = action;
    }
    this.blendReversed = reversed;
    this.blendAction!.setEffectiveWeight(secondaryWeight);
    this.activeAction.setEffectiveWeight(1 - secondaryWeight);
  }

  private clearLocoBlend() {
    const b = this.blendAction;
    this.blendAction = null;
    if (!b) return;
    // NEVER disarm the action that is currently driving the body.
    //
    // `mixer.clipAction()` returns the SAME object for a given clip, so the
    // secondary and the dominant can be one and the same — walk forward-right
    // with strafeRight blended in, tip the travel over to right-dominant, and
    // that strafe is promoted to the dominant clip while this still holds a
    // reference to it. Stopping it there left nothing driving the skeleton at
    // all, so the rig fell back to its BIND pose: for these Blender GLBs that's
    // the flat, Z-up orientation HIPS_PITCH_FIX exists to cancel, which on
    // screen is a character lying horizontal and floating off the ground.
    if (b === this.activeAction) return;
    // Zero the weight BEFORE stopping. `stop()` deactivates the action but
    // leaves its stored weight intact, and the same object comes back next time
    // — so a dropped blend would return half-on the moment it was replayed.
    b.setEffectiveWeight(0);
    b.stop();
  }

  /** Normalised 0..1 position of an action through its clip. */
  private phaseOf(action: THREE.AnimationAction): number {
    const dur = action.getClip().duration;
    if (dur <= 0) return 0;
    const t = action.time % dur;
    return (t < 0 ? t + dur : t) / dur;
  }

  transition(newState: AnimState, force = false, dir?: HitDirection) {
    if (!this.mixer) return;

    if (this.paused) {
      this.pendingTransition = { state: newState, force, dir };
      return;
    }

    if (newState === this.currentState && !force) return;

    const currentConfig = this.animMap[this.currentState];
    if (currentConfig && !currentConfig.canInterrupt && !force) {
      if (this.activeAction && this.activeAction.isRunning()) return;
    }

    const config = this.animMap[newState];
    if (!config) return;

    const clip = this.clips.get(this.resolveClipName(config));
    if (!clip) return;

    const prevState = this.currentState;
    this.currentState = newState;

    const newAction = this.mixer.clipAction(clip);
    newAction.setLoop(config.loop ? THREE.LoopRepeat : THREE.LoopOnce, config.loop ? Infinity : 1);
    newAction.clampWhenFinished = !config.loop;
    // A reversed locomotion clip (backpedal) plays with a negative timeScale;
    // LoopRepeat wraps negative time, so it cycles cleanly.
    newAction.timeScale = this.isLoco(newState) && this.locoReversed ? -config.speed : config.speed;

    if (config.duration) {
      newAction.setDuration(config.duration);
    }

    // Stop any lingering action from a prior transition to prevent three-way
    // blends where total weight < 1 → T-pose bleed.
    if (this.previousAction && this.previousAction !== this.activeAction && this.previousAction !== newAction) {
      this.previousAction.stop();
    }
    this.previousAction = this.activeAction;

    if (this.activeAction && this.activeAction !== newAction) {
      // Locomotion → locomotion keeps its STRIDE PHASE. `reset()` sends the new
      // action back to time 0, so swapping walk↔strafe mid-run re-planted the
      // feet from the top of the cycle; entering in phase means the same foot
      // stays down through the change and the swap reads as a blend.
      const keepPhase =
        this.isLoco(newState) && this.isLoco(prevState) && this.activeAction.getClip().duration > 0;
      const phase = keepPhase ? this.phaseOf(this.activeAction) : 0;
      this.activeAction.fadeOut(config.fadeIn);
      newAction.reset().fadeIn(config.fadeIn).play();
      if (keepPhase) newAction.time = phase * clip.duration;
    } else {
      newAction.reset().setEffectiveWeight(1).play();
    }
    this.activeAction = newAction;
    // A leftover blend belongs to the clip we just left.
    if (this.blendAction && this.blendAction !== newAction && !this.isLoco(newState)) {
      this.clearLocoBlend();
    }

    if (!config.loop) {
      const onFinished = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== newAction) return;
        this.mixer!.removeEventListener("finished", onFinished);
        config.onComplete?.();
        if (config.nextState) {
          this.transition(config.nextState, true);
        }
      };
      this.mixer.addEventListener("finished", onFinished);
    }

    this.onStateChange?.(prevState, newState);
  }

  update(dt: number) {
    if (this.paused || !this.mixer) return;
    this.mixer.update(dt);
  }

  // Normalized progress (0..1) of the current action through its clip.
  getActiveProgress(): number {
    if (!this.activeAction) return 1;
    const clip = this.activeAction.getClip();
    const dur = clip?.duration ?? 0;
    if (dur <= 0) return 1;
    return Math.min(1, Math.max(0, this.activeAction.time / dur));
  }

  // Record the bound rig's hip height (metres) so locomotion cadence accounts
  // for leg length — a taller character covers more ground per stride.
  setRigScale(hipHeightMeters: number) {
    if (hipHeightMeters > 0.1) {
      this.rigScale = Math.min(2, Math.max(0.5, hipHeightMeters / REF_HIP_HEIGHT_M));
    }
  }

  // Lock the walk/run cadence to real ground speed so the planted foot stays put
  // instead of skating. Root motion is stripped (the body is moved by code), so
  // timeScale is driven from the clip's MEASURED baked stride.
  matchLocomotionSpeed(worldSpeed: number) {
    if (!this.activeAction || this.paused) return;
    const s = this.currentState;
    if (!this.isLoco(s)) {
      this.clearLocoBlend();
      return;
    }

    // Weight the two locomotion clips first, then set the cadence on BOTH — a
    // blended-in strafe cycling at its own authored pace against a speed-matched
    // walk is two sets of legs disagreeing about how fast the ground is moving.
    this.updateLocoBlend();
    if (this.blendAction) {
      const bStride = getClipStride(this.blendAction.getClip().name);
      const bSign = this.blendReversed ? -1 : 1;
      if (bStride && bStride.groundSpeed > MIN_BAKED_STRIDE) {
        const baked = (bStride.groundSpeed / MIXAMO_UNITS_PER_METER) * this.rigScale;
        this.blendAction.timeScale = bSign * Math.min(2.1, Math.max(0.25, worldSpeed / baked));
      } else {
        this.blendAction.timeScale = bSign * (this.animMap[s]?.speed ?? 1);
      }
    }

    const sign = this.locoReversed ? -1 : 1;
    const stride = getClipStride(this.activeAction.getClip().name);
    if (stride && stride.groundSpeed > MIN_BAKED_STRIDE) {
      const bakedWorldSpeed = (stride.groundSpeed / MIXAMO_UNITS_PER_METER) * this.rigScale;
      // Clamp widened from [0.55, 1.7]. The floor was the foot-skate culprit: any
      // time you moved slower than ~55% of the clip's baked pace — creeping, easing
      // out of a stop, walking while aiming, or nudging an analog stick — the legs
      // kept cycling at 0.55 while the body crawled, and the character visibly slid
      // across the ground. 0.25 lets the cadence actually follow the body down to a
      // crawl. The ceiling goes up to match sprint-strafing off the walk clips.
      this.activeAction.timeScale = sign * Math.min(2.1, Math.max(0.25, worldSpeed / bakedWorldSpeed));
    } else {
      this.activeAction.timeScale = sign * (this.animMap[s]?.speed ?? 1);
    }
  }

  private isLoco(s: AnimState): boolean {
    return (
      s === AnimState.Walk ||
      s === AnimState.Run ||
      s === AnimState.CrouchWalk ||
      s === AnimState.CombatWalk ||
      s === AnimState.CombatRun
    );
  }

  pause() {
    this.paused = true;
    if (this.mixer) this.mixer.timeScale = 0;
  }

  resume() {
    this.paused = false;
    if (this.mixer) this.mixer.timeScale = 1;
    if (this.pendingTransition) {
      const { state, dir } = this.pendingTransition;
      this.pendingTransition = null;
      this.mixer?.stopAllAction();
      this.activeAction = null;
      this.previousAction = null;
      this.transition(state, true, dir);
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
