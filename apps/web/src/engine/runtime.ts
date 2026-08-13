import * as THREE from "three";
import { HINTS } from "./world/hints";

/**
 * A tiny mutable singleton the game loop writes every frame and the DOM HUD
 * reads via its own requestAnimationFrame — so the compass/heading never
 * triggers React re-renders from inside the 60fps loop.
 */
export const runtime = {
  playerPos: new THREE.Vector3(0, 0, 0),
  /** Body yaw in radians (0 = facing -Z). */
  yaw: 0,
  running: false,
  /** True while the player is actually travelling. The fox reads this to decide
   *  whether to keep station or wander off and nose at something — deriving it
   *  from fox↔player DISTANCE instead left a dead zone where it was too far to
   *  idle but too close to follow, so it just stood there. */
  playerMoving: false,
  /** True while the player is on the ground (drives footstep cadence). */
  grounded: true,
  /** True while the player is crouched (stealth: NPCs detect at reduced range). */
  crouching: false,
  /** True while a reload is in progress (drives the rig clip + the HUD). */
  reloading: false,
  /** True while the player is inside an enterable house (NPCs lose them). */
  sheltered: false,
  /** Index (into ENTERABLES) of the house the player is inside, or -1. Drives
   *  the realistic-exterior ↔ interior swap. */
  shelterIndex: -1,
  /** Index (into ENTERABLES) of the last safe house the player stepped into —
   *  their REFUGE. Downed players respawn here instead of back at the gate, so
   *  pushing deep into the map isn't punished by a full walk of shame. -1 until
   *  they've entered one, in which case respawn falls back to the spawn gate. */
  refugeIndex: -1,
  /** True while sitting to rest indoors (health regenerating). */
  resting: false,
  /** True while standing at the bank's vault pad (E deposits carried loot). */
  nearBank: false,
  /** True while there's chest-high cover close enough ahead to hurdle. Drives the
   *  touch action button's VAULT state, so mobile doesn't need a JUMP button. */
  canVault: false,
  /** True while standing at the market stall (E opens the shop). */
  nearMarket: false,
  /** True while the world is paused — indoors OR the shop overlay is open. NPCs,
   *  projectiles, bombs and the round clock all freeze on this. */
  paused: false,
  /** Index of the hint zone the player is standing in (-1 = none). */
  nearHintIndex: -1,
  /** Whether that hint is the real one. */
  nearHintIsReal: false,
  /** performance.now until which the fox's sniff keeps the real hint revealed. */
  revealRealUntil: -1,
  /** performance.now when the fox can sniff again (cooldown gate). */
  sniffReadyAt: 0,
  // ── Fox (Phase 3) ──
  /** World position of the fox, so the HUD can point you at it while it scouts. */
  foxPos: new THREE.Vector3(1, 0, 3),
  /** What the fox is doing: heel / scout / attack / down. Read by the HUD. */
  foxState: "heel" as "heel" | "scout" | "attack" | "down",
  /** performance.now the fox can next be commanded (scaled by growth stage). */
  foxReadyAt: 0,
  /** performance.now the fox gets back up after being downed (-1 = up). */
  foxDownUntil: -1,
  /** True once a scout has actually reached the treasure — the moment the fox has
   *  told you something true. */
  foxFoundTreasure: false,
  /** performance.now the fox last barked on finding something (HUD toast). */
  foxFoundAt: -1,
  /** True while the fox is uneasy — it's in a place it saw you go down before. */
  foxWary: false,
  /** performance.now the fox last grew a stage (drives the HUD toast). */
  foxGrewAt: -1,
  /** Name of the stage the fox just grew INTO (for the toast). */
  foxStageName: "",
  /** Per-hint: true once its distractor is silenced (decoy removed). */
  hintSilenced: HINTS.map(() => false),
  /** Per-hint: true once a thief has made off with that (real) treasure. */
  hintStolen: HINTS.map(() => false),
  /** Per-hint: true once the player has claimed that (real) treasure (now carrying
   *  it — the round continues until it's banked at the vault). */
  hintClaimed: HINTS.map(() => false),
  /** Per-hint: true once that claim has been BANKED at the vault, i.e. it's safe
   *  for good. Claimed-but-not-banked treasures are still in your bag, and going
   *  down drops them back onto the board (where a thief can then take them). */
  hintBanked: HINTS.map(() => false),
  /** performance.now the player last dropped carried loot by going down, and how
   *  much — the downed screen names the number so the cost lands. */
  lootLostAt: -1,
  lootLostAmount: 0,
  /** How much of that a Lockbox bought back (0 if you weren't carrying one). */
  lootSalvaged: 0,
  /** Per-hint: true once a bomb blast has cracked that (real) treasure (§13.5). */
  hintCracked: HINTS.map(() => false),
  /** Timestamps for HUD toasts: a theft / a crack just happened. */
  treasureStolenAt: -1,
  treasureCrackedAt: -1,
  /** performance.now the current round started. */
  roundStartAt: performance.now(),
  // ── The day (Phase 5) ──
  /** 0 = dawn, 1 = nightfall. Mirrors the store value for per-frame readers
   *  (lighting, HUD) that must not trigger React renders. */
  dayProgress: 0,
  /** performance.now a new chapter began (drives the chapter banner). */
  chapterAt: -1,
  /** True once a guardian has delivered a briefing — liars then contradict it
   *  rather than offering an unrelated rumour. */
  /** True once the player has actually taken control (pointer locked, or touch).
   *  Anything that speaks to the player must wait for this — the opening chapter
   *  begins the instant the scene mounts, which is still mid-load, so a briefing
   *  fired then is delivered to an empty chair. */
  playerReady: false,
  /** True while the opening map / map overlay is up. Folds into `paused` so the
   *  village doesn't carry on without you: villagers were walking over and
   *  delivering lines behind the modal, which you then dismissed into a world
   *  that had already moved on. */
  mapOpen: false,
  guardianBriefed: false,
  /** performance.now the guardian last delivered a briefing. */
  guardianSpokeAt: -1,
  /** True while the guardian is mid-briefing and waiting on you to acknowledge
   *  it (Marvy's call) — folds into `paused`/the movement freeze so a fast
   *  walker can't just stroll past without reading, and only PlayerController
   *  (E) or the Hud tap prompt clear it. No auto-dismiss timer: reading speed
   *  isn't the game's to guess at. */
  guardianGate: false,
  /** Bumped by PlayerController (E) or the Hud tap prompt each time the player
   *  acknowledges the CURRENT page of the briefing. Guardian.tsx watches this
   *  counter rather than being told to dismiss directly, because the briefing
   *  is now paginated: most bumps just advance to the next page (and it's the
   *  one place that knows how many pages there are); only the last one clears
   *  `guardianGate`. */
  guardianAdvance: 0,
  /** Current page (0-based) and total page count of the briefing on screen —
   *  written by Guardian.tsx, read by the Hud to draw a "page 2 of 4" dot row
   *  so a multi-part briefing doesn't read as a single dismiss with no sense
   *  of how much is left. */
  guardianPage: 0,
  guardianPageCount: 1,
  chapterName: "Dawn",
  chapterBrief: "Find the first treasure. Bank it at the vault.",
  /** performance.now a day BEGAN (dawn, whether from sleep, a new game, or a
   *  death-restart) — drives the "Day N: find X treasures" toast (§14.10). */
  dayAnnounceAt: -1,
  /** Eased 0..1 hip→aim blend, published by PlayerController so the first-person
   *  weapon viewmodel can ride the same curve as the camera FOV instead of
   *  running a second, subtly-out-of-sync ease of its own. */
  adsBlend: 0,
  /** True while the player is holding G to aim a bomb throw. */
  bombAiming: false,
  /** Predicted bomb landing point (valid while bombAiming). */
  bombAimPoint: new THREE.Vector3(0, 0, 0),
  /** Timestamps (performance.now) for crosshair feedback. */
  fireAt: -1,
  hitAt: -1,
  headshotAt: -1,
  /** Timestamp the player last took damage (for the screen flash). */
  damageAt: -1,
  /** Unit direction the last hit CAME FROM (world space, pointing from the player
   *  toward the shooter). Drives the directional flinch and the damage indicator —
   *  "who is shooting me and from where" was the single biggest unknown in play. */
  damageFrom: new THREE.Vector3(0, 0, 1),
  /** How much that last hit took off, so a big hit can flinch harder than a graze. */
  damageAmount: 0,
  /** Which way the camera rolls for the current hit (+1/-1). Fixed per hit rather
   *  than random per frame, so the stagger reads as a flinch, not a rattle. */
  hitRollSign: 1,
  /** World position of the player's gun MUZZLE (published by PlayerRig each
   *  frame). Tracers and the muzzle flash leave from here, so a shot visibly
   *  exits the barrel instead of a fixed offset near the shoulder. */
  muzzlePos: new THREE.Vector3(0, 1.4, 0),
  /** World position of the player's right hand (published by PlayerRig each
   *  frame) so a thrown bomb launches FROM the hand, in sync with the throw. */
  rightHandPos: new THREE.Vector3(0, 0, 0),
};
