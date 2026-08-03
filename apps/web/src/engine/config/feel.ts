/**
 * Tunable "game feel" constants for the movement slice.
 *
 * These are the numbers to play with while judging feel. Baselines are adapted
 * from Valor's CharacterController (walk 2.0 / run 4.8 / turnSpeed 10 / velocity
 * decay exp(-15·dt)) but nudged up for arena traversal — Foxglade is about
 * covering ground toward a treasure, not a tight melee pit.
 *
 * Everything a playtester would want to twist lives here so we never hunt
 * through scene code to retune the feel.
 */
export const FEEL = {
  // --- Locomotion (metres / second) ---
  // Grounded human speeds: the old 5.6 walk / 11 run read as a tabletop (crossed
  // the ~63 m map in ~6 s). A real jog + a strong run give the map a sense of
  // distance without feeling sluggish. Player still outpaces thieves (2.2) and
  // blockers (3.3), so the race/kite balance holds. Retune here if traversal drags.
  walkSpeed: 3.4,
  runSpeed: 7.5, // hold Shift
  crouchSpeed: 1.8, // while crouched (C toggles; crouching disables run)
  /** How fast horizontal velocity ramps toward the target (higher = snappier). */
  accel: 14,
  /** Exponential velocity decay when there's no input (higher = harder stop). */
  decay: 16,

  // --- Facing ---
  /** How fast the body rotates to face the movement direction (lerp factor·dt). */
  turnSpeed: 12,

  // --- Vertical ---
  // Snappier, more grounded arc than the old floaty hop (was 1.45 m / 0.73 s).
  // Now ~0.8 m apex over ~0.5 s — a purposeful hop, not a moon-jump. (The ground
  // is flat at y=0 with no platforming, so this is for dodges/feel, not clearing.)
  gravity: -26,
  jumpForce: 6.5,

  // --- Camera (third-person over-the-shoulder: pivot + convergence) ---
  //
  // The rig orbits a PIVOT offset from the head (out to the shoulder, up by the
  // headroom) and looks at a CONVERGENCE point far along the aim line. That's
  // what pushes the character into a screen quadrant instead of sitting on the
  // crosshair: the pivot is beside him, so he renders down-and-left while the
  // reticle stays in clear air. (The old rig looked *along* aim from behind his
  // head, which put him dead centre over the aim point.)
  mouseSensitivity: 0.0024,
  // Resting pitch is LEVEL, not 20° up. The old +0.35 start / +0.95 ceiling meant
  // the horizon sat in the bottom third and the crosshair pointed over the
  // rooftops — you could not see the enemies shooting you. You need to look DOWN
  // more than up here: the treasure, the fox and the NPCs are all at ground level.
  startPitch: -0.06, // radians the view rests at (slightly below level)
  pitchMin: -0.72, // radians (look down)
  pitchMax: 0.62, // radians (look up)
  /** Soft deadzone: mouse deltas under this many px are damped (not zeroed), so
   *  hand jitter stops swimming the camera without adding any input latency. */
  aimDeadzonePx: 1.2,
  aimDeadzoneDamp: 0.35, // how much of a sub-deadzone delta still gets through
  cameraDistance: 2.4, // hip-fire orbit distance
  cameraHeight: 2.6, // (unused by the shoulder cam; kept for reference)
  cameraShoulder: 0.62, // over-the-shoulder side offset of the PIVOT (frames him left of centre)
  cameraHeadroom: 0.28, // pivot lift above the eye — drops him below the reticle
  cameraConverge: 25, // metres out along the aim line the camera converges on
  cameraMinHeight: 0.7, // camera never dips below this, so you can't see under the world
  cameraMinDistance: 1.2, // closest the camera pulls in on collision (kept back so the character stays framed, not slammed against his back)

  // --- Aim-down-sights (hold right-mouse / AIM on touch) ---
  // Replaces the old V first-person toggle, which put the camera at the eyes with
  // no arms, no hands and no weapon (the gun is a child of the faded body, so it
  // vanished too) — a floating camera, not a viewpoint. ADS gets the precision
  // without ever hiding the character or the fox.
  adsDistance: 1.75,
  adsShoulder: 0.34,
  adsFov: 48, // narrower lens while aiming
  adsSensitivityMult: 0.62, // slower look while aiming — steadier
  adsSpeedMult: 0.6, // you walk while aiming, you don't sprint
  adsLerp: 14, // how fast the rig eases between hip and aim
  // Instead of hard-hiding the character when the camera is close (which read as
  // "vanishing"), fade him out: fully visible past fadeStart, gone by fadeEnd.
  cameraFadeStart: 1.5, // distance (m) below which the character starts fading
  cameraFadeEnd: 0.6, // distance (m) at which he's fully transparent (true near-first-person indoors)
  cameraCollisionBuffer: 0.35, // gap kept in front of a wall the camera pulls up to

  // --- Damage feedback (screen shake + directional stagger) ---
  // Punchier than before across the board: a hit used to be a small symmetric
  // jitter you could easily miss in a firefight. Now it kicks, it rolls, and the
  // kick is DIRECTIONAL — the view lurches away from whoever shot you, so the
  // stagger itself tells you where the fire is coming from.
  shakeDuration: 0.45, // seconds a hit-shake lasts
  shakePosAmp: 0.26, // positional jitter (metres) at full strength
  shakeRollAmp: 0.11, // camera roll (radians) at full strength — the "stagger"
  /** Directional shove (metres) away from the shooter on a hit. */
  hitPushAmp: 0.42,
  /** Extra pitch kick (radians) on a hit — the head snapping back. */
  hitPitchKick: 0.055,
  /** A hit taking at least this fraction of max health staggers harder (×2). */
  heavyHitFraction: 0.15,

  // --- Low health ---
  // Below this fraction the frame reads as "you are about to die": a pulsing red
  // edge and a heartbeat drift on the camera. Health bars are easy to not look at
  // during a fight; the whole screen is not.
  lowHealthFraction: 0.3,
  lowHealthPulseHz: 1.35, // heartbeat rate of the vignette pulse
  lowHealthSwayAmp: 0.012, // radians of slow camera sway while critical
  /** Camera position smoothing (higher = tighter follow, lower = floatier).
   *  Raised from 12: the old rig lerped position slowly while snapping rotation
   *  instantly, which is the classic "swimmy" combination. Converging on a distant
   *  point already stabilises the framing, so the follow can afford to be tight. */
  cameraLerp: 16,
  /** Height on the player the camera aims at. */
  lookAtHeight: 1.4,
  /** Eye/aim height while crouched (camera + throws lower with you). */
  crouchEyeHeight: 0.95,
  /** Visual body height while crouched (capsule squashes to this). */
  crouchHeight: 1.1,
  /** How fast the eye/body height eases between stand and crouch. */
  crouchLerp: 10,
  baseFov: 60,
  runFovKick: 7, // camera widens slightly while running, so speed is felt
  fovLerp: 8,

  // --- Weapon recoil (a per-shot VIEW kick that recovers — not a permanent aim
  //     change). Holding fire walks the view up a touch, then it eases back. ---
  recoilKickPitch: 0.022, // radians the view punches up per shot (~1.3°)
  recoilKickYaw: 0.009, // radians of random horizontal jitter per shot
  recoilRecover: 11, // how fast the view eases back to your aim (higher = snappier)

  // --- Shooting (cosmetic muzzle origin for the tracer + flash) ---
  // The hitscan is from the camera, but the tracer/flash leave from HERE — a
  // shouldered-rifle muzzle offset from the eye — so shots read as coming from
  // the gun, not the lens. Tune if the streak looks off-shoulder.
  muzzleForward: 0.55, // metres ahead of the eye along the aim line
  muzzleSide: 0.22, // metres to the aim-right (over-the-shoulder side)
  muzzleDrop: 0.18, // metres below eye height (the gun sits under the sightline)

  // --- Fox companion follow ---
  // The fox stays BESIDE (and slightly ahead of) the player so it's always in
  // view — a companion you watch and care for, never hidden behind you.
  foxForwardOffset: 0.1, // barely ahead so it stays on-screen but close at heel
  foxSideOffset: 0.72, // how far out to the side it walks (right at the player's heel)
  foxSide: 1, // 1 = player's right, -1 = left
  foxSpeed: 11, // how quickly it catches up (higher = tighter to heel)
  foxBobAmplitude: 0.12,
  foxBobSpeed: 9,

  // --- World ---
  arenaHalfExtent: 40, // half-size of the square play area (metres)
  playerRadius: 0.4,
  playerHeight: 1.7,
} as const;

export type Feel = typeof FEEL;

/**
 * First-person feel (Nighthaul).
 *
 * PORTED FROM VALOR (Marvy's own shipped FPS, apps/web/src/engine/scene/ValorScene.tsx),
 * because the first attempt here reinvented it and got it wrong. Three things
 * Valor does that hand-rolling this missed:
 *
 *  1. NEAR PLANE 0.01, FOV 55. That is what lets a full-size weapon sit half a
 *     metre from the lens without being sliced. Fighting a 0.1 near plane by
 *     shrinking the gun to half scale and pushing it away is why the first pass
 *     read as a small prop hovering in the corner.
 *  2. THE DRIFT IS ON THE CAMERA, NOT THE GUN. Valor calls it bodycam handheld
 *     drift and it is the signature of the look: a slow pitch/yaw/roll wander of
 *     the whole view, steadied when you aim. Swaying the weapon inside a locked
 *     lens — the first attempt — animates the prop while the head stays dead,
 *     which is exactly the "no personality" read.
 *  3. ADS IS A RAISE, NOT A SHOVE. The gun stays at hip DEPTH and only lifts and
 *     moves slightly toward centre; the zoom comes entirely from the FOV. Pulling
 *     the weapon toward the eye puts its receiver end-on against the lens.
 *
 * Viewmodel offsets are in CAMERA space: +X right, +Y up, -Z forward.
 */
export const FIRST_PERSON = {
  /** Eye nudged forward of the head centre so the lens sits at the face rather
   *  than inside the skull — stops the near plane slicing walls you stand against. */
  eyeForward: 0.08,
  /** Valor's lens. The near plane is the load-bearing number (see the note above). */
  near: 0.01,
  fov: 55,
  adsFov: 42,

  // --- Bodycam drift (Valor: the signature of the look) ---
  // A slow, irregular wander of the CAMERA — three sine waves on incommensurate
  // periods so it never visibly loops. Aiming steadies it to a fifth, so
  // precision is never fighting the camera.
  driftMoveRate: 6.2, // phase advance per second while moving
  driftStillRate: 1.5, // …and while standing
  driftStillAmt: 0.38, // amplitude multiplier when not moving
  driftAdsDamp: 0.85, // fraction removed while aiming
  driftPitch: 0.0045, // radians
  driftYaw: 0.0038,
  driftRoll: 0.0075,
  driftEyeBob: 0.011, // metres the eye rises/falls on the drift

  // --- Head bob (eye height) ---
  bobRate: 9, // phase advance/sec while moving
  bobAdsRate: 6, // …while aiming

  // --- Weapon viewmodel ---
  // Valor's framing, at FULL gun scale. ADS keeps the same DEPTH and only lifts
  // and eases toward centre — the aim zoom is the FOV, not the gun.
  //
  // The DEPTH is derived from the model rather than hard-coded, because Valor's
  // -0.5 is tuned to Valor's rifle. These guns measure 0.847m long, so at -0.5
  // the weapon's rear sits 7.6cm from the lens, where it is four times the height
  // of the frame — an unreadable black wall, which is what ADS looked like before.
  // Instead the weapon is pushed out until its REAR clears the lens by
  // `rearClearance`, and the lateral offsets are scaled by the same factor so the
  // on-screen framing stays exactly Valor's regardless of how long the gun is.
  gunScale: 1,
  /** Metres of clear air between the lens and the butt of the weapon. */
  rearClearance: 0.35,
  /** Valor's offsets, expressed at its reference depth of 0.5m (scaled at build). */
  gunHip: [0.2, -0.2] as [number, number],
  gunAds: [0.1, -0.1] as [number, number],
  refDepth: 0.5,
  gunLerp: 16, // hip↔ADS ease
  /** Figure-eight bob on the weapon: x on the sine, y on |cos| so it bounces on
   *  every footfall rather than dipping once a stride. */
  bobAmp: 0.014,

  // --- Recoil ---
  // One value drives both the view kick and the viewmodel, so they can't disagree.
  recoilKick: 0.02, // radians per shot at feel.kick 1
  recoilAdsDamp: 0.4, // fraction removed while aiming
  recoilRecover: 12, // per second
  recoilBack: 2.2, // metres of viewmodel punch per radian of view kick
  recoilTilt: 1.6, // radians the viewmodel rotates per radian of view kick

  // --- Weapon raise (on spawn and on a weapon swap) ---
  raiseRate: 2.4, // per second
  raiseDrop: 0.22, // metres it dips below the hip pose at full raise

  // --- Wall pullback (Valor) ---
  // Retract the viewmodel TOWARD the eye as a wall closes, rather than rotating
  // the barrel up. Scaling depth keeps the weapon in frame; rotating it swings
  // the whole thing across the view.
  wallClear: 1.1, // start retracting inside this many metres
  wallMinScale: 0.12, // never fully collapsed, so it can't pop out of view
  wallDip: 0.06, // metres it lowers at full contact

  // --- Sprint pose ---
  // Not in Valor, kept from the local pass: the weapon drops and cants at a run.
  // It reads as effort AND makes "I can't shoot right now" legible without UI.
  sprintDrop: 0.07,
  sprintIn: 0.06,
  sprintPitch: -0.35,
  sprintRoll: 0.5,
  sprintYaw: 0.3,
  sprintLerp: 7,
  sprintOutLerp: 15, // out fast — you may be about to shoot

  // --- Reload: the gun drops out of the sightline while you work ---
  reloadDrop: 0.14,
  reloadRoll: 0.5,
  reloadLerp: 8,

  // --- Landing impact ---
  landDrop: 0.075,
  landPitch: 0.2,
  landRecover: 7,
} as const;

export type FirstPersonFeel = typeof FIRST_PERSON;
