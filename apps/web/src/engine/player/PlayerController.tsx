"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FEEL, FIRST_PERSON } from "@/engine/config/feel";
import { gameMode } from "@/engine/config/mode";
import { runtime } from "@/engine/runtime";
import { useKeyboard } from "@/engine/input/useKeyboard";
import {
  VILLAGE,
  COLLIDERS,
  BOXES3D,
  CAMERA_BOXES,
  vaultTarget,
  interiorIndexAt,
  ENTERABLES,
  INTERIORS,
  HOME_INDEX,
} from "@/engine/world/village";
import { resolveColliders, raycastBoxes } from "@/engine/world/collision";
import { useGame } from "@/engine/store";
import { fireHitscan, enemies } from "@/engine/combat/enemies";
import { spawnShot } from "@/engine/combat/shotfx";
import { spawnDecal } from "@/engine/combat/decals";
import { spawnBlood } from "@/engine/combat/blood";
import { spawnBloodStain } from "@/engine/combat/bloodStains";
import { spawnBomb, predictLanding } from "@/engine/combat/bombs";
import { audio } from "@/engine/audio/audio";
import { HINTS, HINT_RADIUS } from "@/engine/world/hints";
import { foxGrowthFor } from "@/engine/config/fox";
import { REST, BOMB } from "@/engine/config/round";
import { DAY } from "@/engine/config/day";
import { WEAPON_STATS } from "@/engine/config/shop";
import { PlayerRig, type PlayerRigState } from "@/engine/character/PlayerRig";
import { touch, AIM_ASSIST } from "@/engine/input/touch";
import { softShadowTexture } from "@/engine/world/softShadow";

/** World up — the camera pivot lifts along this to drop the player below the reticle. */
const UP = new THREE.Vector3(0, 1, 0);
/** Seconds a hurdle over chest-high cover takes, start to landing. Matched to the
 *  "Vault Over Box" clip so the body and the translation finish together. */
const VAULT_TIME = 0.62;
// Scratch vectors for the touch aim assist (no per-frame allocation).
const _aimDir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _eye = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(t, 1);
}

/**
 * Third-person locomotion + orbit-follow camera. Click the canvas to capture
 * the mouse for looking; Esc releases it. WASD moves relative to where the
 * camera faces, Shift runs, Space jumps. All feel numbers live in FEEL.
 */
export function PlayerController() {
  const keys = useKeyboard();
  const { camera, gl } = useThree();

  const shadow = useRef<THREE.Mesh>(null);
  // Mutable state the animated rig reads every frame (kept out of React render).
  const rigState = useRef<PlayerRigState>({
    position: VILLAGE.home.clone(),
    rotation: VILLAGE.homeYaw,
    aimPitch: 0.35,
    velocity: new THREE.Vector3(),
    moving: false,
    running: false,
    crouching: false,
    grounded: true,
    dead: false,
    fireAt: -1,
    aimYaw: VILLAGE.homeYaw,
    hitAt: -1,
    hitSerious: false,
    hitHeavy: false,
    hitDir: "front",
    reloading: false,
    throwAt: -1,
    dodgeAt: -1,
    grabAt: -1,
    resting: false,
    visible: true,
    opacity: 1,
  });
  const camBase = useRef(new THREE.Vector3(0, 4, 8)); // smoothed camera pos (shake kept separate)
  const pos = useRef(VILLAGE.home.clone());
  const vel = useRef(new THREE.Vector3(0, 0, 0));
  const yaw = useRef(VILLAGE.homeYaw); // camera/heading yaw
  const pitch = useRef<number>(FEEL.startPitch);
  const bodyRot = useRef(VILLAGE.homeYaw);
  // During an interact gesture, turn the body to FACE the target (vault / stall /
  // treasure) so the pick-up reads as a real act, not a shrug at thin air.
  const grabTarget = useRef(new THREE.Vector3());
  const grabFaceUntil = useRef(0);
  const grounded = useRef(true);
  const fireHeld = useRef(false);
  const fireCd = useRef(0);
  const bombAim = useRef(false); // holding G: telegraph shows, release throws
  const recoilPitch = useRef(0); // transient view kick from firing (recovers to 0)
  const recoilYaw = useRef(0);
  const crouching = useRef(false); // C toggles; jump stands you back up
  // Committed dodge roll: unit travel direction + 0..1 progress (null = not rolling).
  const dodge = useRef<{ t: number; dx: number; dz: number } | null>(null);
  const dodgeReadyAt = useRef(0);
  /** In-flight hurdle over chest-high cover (null when not vaulting). */
  const vault = useRef<{
    t: number;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    peakY: number;
  } | null>(null);
  const adsHeld = useRef(false); // holding right-mouse (or the touch AIM button)
  const adsT = useRef(0); // eased 0..1 hip→aim blend (drives distance/shoulder/FOV/sensitivity)
  const resting = useRef(false); // sitting indoors (X); any movement stands up
  const eyeH = useRef(FEEL.lookAtHeight); // eased eye height (stand ↔ crouch ↔ sit)
  const prevHealth = useRef(100); // edge-detects the drop into the danger band
  const driftT = useRef(0); // first-person bodycam drift phase (radians)

  // Interaction keys: E claim (only at the real hint), R respawn, F fire,
  // Q fox-sniff (reveals the real hint on a cooldown).
  // Start the round timer when play begins.
  useEffect(() => {
    runtime.roundStartAt = performance.now();
  }, []);

  useEffect(() => {
    // Fire the pick-up gesture and turn to face the interaction target for ~1s.
    const faceAndGrab = (target: THREE.Vector3) => {
      rigState.current.grabAt = performance.now();
      grabTarget.current.copy(target);
      grabFaceUntil.current = performance.now() + 950;
    };
    const onKey = (e: KeyboardEvent) => {
      // The guardian gate is a hard stop (Marvy's call): the briefing must be
      // acknowledged before anything else happens, so E is the ONLY key that
      // does anything while it's up — every other key (reload, market, rest)
      // is swallowed, same treatment the day-over overlay gets. The briefing
      // is paginated (see Guardian.tsx); E just requests "next," and Guardian
      // itself decides whether that's another page or the actual dismiss.
      if (runtime.guardianGate) {
        if (e.code === "KeyE" && !e.repeat) runtime.guardianAdvance++;
        return;
      }
      // `!e.repeat` matters: holding E fires the browser's key-repeat every ~30ms,
      // which re-ran faceAndGrab and restarted the pick-up clip over and over. The
      // gesture is a one-shot on the press, not a hold.
      if (e.code === "KeyE" && !e.repeat) {
        // The day-over overlay is a hard stop (§14.10) — E sleeps you through
        // to the next day from wherever you're standing, no walk home needed.
        // Outranks everything else E does, same as the old bed-only version did.
        if (useGame.getState().dayOver) {
          useGame.getState().sleep();
        } else if (runtime.nearHintIsReal && runtime.nearHintIndex >= 0 && !runtime.hintClaimed[runtime.nearHintIndex]) {
          useGame.getState().claimTreasure(runtime.nearHintIndex);
          faceAndGrab(HINTS[runtime.nearHintIndex].pos); // reach-out pick-up gesture
        } else if (runtime.nearBank && useGame.getState().villeCarrying > 0) {
          // Banking resolves this chapter's quota share (store.ts resolveTreasure) —
          // it no longer touches the clock directly, see config/day.ts.
          useGame.getState().depositLoot();
          faceAndGrab(VILLAGE.bank); // deposit gesture at the vault
        } else if (runtime.nearMarket) {
          useGame.getState().openShop();
          faceAndGrab(VILLAGE.market); // reach toward the stall
        }
      }
      // B also opens the market when you're at the stall (Shop closes on B/Esc).
      if (e.code === "KeyB" && !e.repeat && runtime.nearMarket && !useGame.getState().shopOpen) {
        useGame.getState().openShop();
      }
      // R is context-sensitive: retry the day from the day-over overlay, respawn
      // when you're down, reload otherwise. The three never overlap.
      if (e.code === "KeyR" && !e.repeat) {
        if (useGame.getState().dayOver) useGame.getState().retryDay();
        else if (useGame.getState().isDead) useGame.getState().respawn();
        else useGame.getState().startReload();
      }
      if (e.code === "Enter" && useGame.getState().roundState !== "playing") {
        useGame.getState().restart();
      }
      if (e.code === "KeyF") fireHeld.current = true; // keyboard fire (hold to auto-fire)
      if (e.code === "KeyC" && !e.repeat) crouching.current = !crouching.current;
      // V used to toggle a first-person camera that had no arms, hands or weapon.
      // Aiming is now ADS (hold right-mouse) — see the camera block below. On touch
      // the AIM button drives the same path via a synthetic KeyV hold.
      if (e.code === "KeyV") adsHeld.current = true;
      if (e.code === "KeyX" && !e.repeat) {
        // Sit to restore — only indoors, and standing back up is always allowed.
        // Spends one of your limited restores; useRestore() refuses (and spends
        // nothing) if you have none left or you're already at the heal cap, so a
        // mistimed press never burns a charge.
        if (resting.current) resting.current = false;
        else if (runtime.sheltered && useGame.getState().roundState === "playing" && !useGame.getState().isDead) {
          if (useGame.getState().useRestore()) {
            resting.current = true;
            crouching.current = false;
            fireHeld.current = false;
            bombAim.current = false;
          }
        }
      }
      if (e.code === "KeyG" && !e.repeat) {
        // Start aiming a bomb throw (needs the mouse captured, a bomb, live play,
        // and being OUTSIDE). The indoor ban survives the safe-room rewrite for a
        // different reason: you cannot lob a 11m arc inside a 7×5 room, and a 6m
        // blast from in there is just suicide with extra steps.
        const st = useGame.getState();
        if (
          (document.pointerLockElement || touch.enabled) &&
          st.bombsLeft > 0 &&
          !st.isDead &&
          st.roundState === "playing" &&
          !runtime.sheltered
        ) {
          bombAim.current = true;
        }
      }
      // Q = SEND THE FOX. One contextual command: a threat nearby and it goes for
      // that, otherwise it runs off to find the real treasure. This replaces the
      // old "sniff", which just recoloured two compass dots for six seconds — the
      // player watched the HUD, not the animal, and the fox did nothing. Now the
      // fox IS the answer: you follow it. (FoxCompanion owns the cooldown.)
      if (e.code === "KeyQ" && !e.repeat) {
        window.dispatchEvent(new Event("foxcommand"));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "KeyF") fireHeld.current = false;
      if (e.code === "KeyV") adsHeld.current = false;
      if (e.code === "KeyG" && bombAim.current) {
        // Release G → throw along the current aim line (matches the telegraph).
        bombAim.current = false;
        runtime.bombAiming = false;
        const st = useGame.getState();
        if (st.bombsLeft > 0 && !st.isDead && st.roundState === "playing") {
          st.throwBomb();
          rigState.current.throwAt = performance.now(); // arm starts the throw NOW
          const cp = Math.cos(pitch.current);
          const aim = new THREE.Vector3(
            -Math.sin(yaw.current) * cp,
            Math.sin(pitch.current),
            -Math.cos(yaw.current) * cp
          );
          const head = new THREE.Vector3(
            pos.current.x,
            pos.current.y + eyeH.current,
            pos.current.z
          );
          // Release at the throw clip's forward swing (BOMB.windup) so the bomb
          // leaves the hand in sync with the animation + whoosh, not at wind-up.
          // Launch FROM the hand (published by the rig) so it exits where the
          // held bomb was; fall back to the head if the hand isn't posed yet.
          window.setTimeout(() => {
            const g = useGame.getState();
            if (g.isDead || g.roundState !== "playing") return;
            const origin = runtime.rightHandPos.lengthSq() > 0.01 ? runtime.rightHandPos.clone() : head;
            spawnBomb(origin, aim);
            audio.play("bombThrow");
          }, BOMB.windup * 1000);

        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // On respawn, put the player back indoors.
  const respawnNonce = useGame((s) => s.respawnNonce);
  useEffect(() => {
    // Respawn at your REFUGE — the last safe house you stepped into — rather than
    // all the way back at the gate. You come back inside, where nothing can reach
    // you, so you gather yourself and walk back out on your own terms. Falls back
    // to your own room, which is also where a fresh day begins.
    const refuge = runtime.refugeIndex >= 0 ? INTERIORS[runtime.refugeIndex] : null;
    if (refuge) {
      pos.current.set((refuge.minX + refuge.maxX) / 2, 0, (refuge.minZ + refuge.maxZ) / 2);
    } else {
      pos.current.copy(VILLAGE.home);
      yaw.current = VILLAGE.homeYaw;
    }
    vel.current.set(0, 0, 0);
    crouching.current = false;
    resting.current = false;
    // DEV-only: ?at=market drops you in front of the stall (headless view check).
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).get("at") === "market") {
      pos.current.set(VILLAGE.market.x, 0, VILLAGE.market.z + 3); // inside, near the gate
      yaw.current = 0; // face the stand at the back
    }
  }, [respawnNonce]);

  // Give the mouse back when the stall closes.
  //
  // Shop.tsx releases pointer lock on open so the cursor can click the overlay,
  // but nothing used to re-acquire it — so you shut the stall and were standing
  // in a live village unable to LOOK, with no on-screen sign of why, until you
  // happened to click. In a playtest that one missing call cost the whole rest
  // of the run: every treasure banked came before the first market visit.
  //
  // The re-lock is deliberately narrow. Touch never had the lock to begin with,
  // and re-grabbing the pointer once the run is over would trap the cursor away
  // from the overlays that want clicking.
  const shopOpen = useGame((s) => s.shopOpen);
  const wasShopOpen = useRef(false);
  // Edge-detects `runtime.guardianGate` frame-to-frame — it's a plain mutable
  // field (not zustand state), so a useEffect can't key off it directly; see
  // the exit/re-lock pair in the main useFrame below.
  const wasGuardianGate = useRef(false);
  useEffect(() => {
    const closing = wasShopOpen.current && !shopOpen;
    wasShopOpen.current = shopOpen;
    if (!closing || touch.enabled) return;
    if (useGame.getState().roundState !== "playing" || useGame.getState().isDead) return;
    if (document.pointerLockElement) return;
    // Chrome can refuse a lock requested too soon after one was released; the
    // click path in the effect below is still there, so a refusal costs nothing.
    Promise.resolve(gl.domElement.requestPointerLock()).catch(() => {});
  }, [shopOpen, gl]);

  // Mouse look via pointer lock; left-click fires once the mouse is captured.
  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) fireHeld.current = true; // hold to auto-fire
      if (e.button === 2) adsHeld.current = true; // hold right-mouse to aim
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) fireHeld.current = false;
      if (e.button === 2) adsHeld.current = false;
    };
    // Right-mouse is the aim button, so the browser menu must not eat it.
    const onContextMenu = (e: Event) => e.preventDefault();
    // Soft deadzone: damp (don't zero) sub-threshold deltas. A hard cutoff makes
    // slow aim feel sticky; scaling small movements down kills hand jitter while
    // keeping the response continuous and latency-free.
    const damp = (d: number) =>
      Math.abs(d) < FEEL.aimDeadzonePx ? d * FEEL.aimDeadzoneDamp : d;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      // Aiming slows the look down — the steadiness is most of what ADS buys you.
      const sens = FEEL.mouseSensitivity * (1 - adsT.current * (1 - FEEL.adsSensitivityMult));
      yaw.current -= damp(e.movementX) * sens;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - damp(e.movementY) * sens,
        FEEL.pitchMin,
        FEEL.pitchMax
      );
    };
    const onLockChange = () => {
      if (document.pointerLockElement === canvas) runtime.playerReady = true;
      if (document.pointerLockElement !== canvas) {
        fireHeld.current = false; // stop firing when unfocused
        adsHeld.current = false;
      }
    };
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [gl, camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp big frame gaps so physics stays sane
    const k = keys.current;

    // The world pauses for MENUS — the shop overlay and the map — and now also
    // for a spent day (§14.10): dayOver is a hard stop, the day-over overlay
    // takes the screen, and nothing should keep fighting/racing behind it while
    // you decide whether to sleep on or retry. Being indoors on its own does
    // NOT pause it (see store.damagePlayer for why): the day runs while you
    // shelter, the thieves keep racing, resting is three real seconds sitting
    // down in a building someone watched you enter.
    const shopOpen = useGame.getState().shopOpen;
    // The guardian gate (Marvy's call) pauses the world the same way the shop
    // and the day-over overlay do — nobody keeps moving while you're being
    // made to read something, that's the entire point of the gate.
    runtime.paused = shopOpen || runtime.mapOpen || useGame.getState().dayOver || runtime.guardianGate;
    if (useGame.getState().roundState === "playing" && runtime.paused) {
      runtime.roundStartAt += dt * 1000;
    }
    // Under pointer lock, mousedown/click never hit-tests the Hud overlay at
    // all — it's delivered straight to whatever element HAS the lock (the
    // canvas), same as any other mouse event once locked. That's why the "tap
    // to continue" prompt did nothing: the click was landing on the canvas as
    // a fire input, not on the overlay underneath it. Release the lock the
    // instant the gate goes up (same fix Shop.tsx already uses for its own
    // overlay) so the cursor is real and can actually click the prompt, then
    // re-acquire it automatically once the gate clears — mirrors the shop's
    // re-lock effect above, just edge-detected per-frame since this flag
    // isn't zustand state.
    if (runtime.guardianGate && !wasGuardianGate.current && document.pointerLockElement === gl.domElement) {
      document.exitPointerLock();
    }
    if (
      !runtime.guardianGate &&
      wasGuardianGate.current &&
      !touch.enabled &&
      useGame.getState().roundState === "playing" &&
      !useGame.getState().isDead &&
      !document.pointerLockElement
    ) {
      Promise.resolve(gl.domElement.requestPointerLock()).catch(() => {});
    }
    wasGuardianGate.current = runtime.guardianGate;
    // The sun creeps forward on its own so dawdling still costs light; banking is
    // what really moves it. advanceDay ends the run at nightfall.
    if (useGame.getState().roundState === "playing" && !runtime.paused) {
      useGame.getState().advanceDay(dt / DAY.driftSeconds);
    }
    runtime.dayProgress = useGame.getState().dayProgress;
    const frozen =
      useGame.getState().isDead ||
      useGame.getState().roundState !== "playing" ||
      shopOpen ||
      useGame.getState().dayOver ||
      runtime.guardianGate;

    // Mobile look: apply the accumulated touch-drag to yaw/pitch (already in
    // radians), then consume it. No pointer lock on touch, so this replaces it.
    if (touch.enabled && (touch.lookDX !== 0 || touch.lookDY !== 0)) {
      yaw.current -= touch.lookDX;
      pitch.current = THREE.MathUtils.clamp(pitch.current - touch.lookDY, FEEL.pitchMin, FEEL.pitchMax);
      touch.lookDX = 0;
      touch.lookDY = 0;
    }

    // ── Touch aim assist ──
    //
    // Only on touch, only while you're firing or aiming, and only toward an enemy
    // already inside a narrow cone of where you point. It closes the last sliver
    // of angle for you; it will not find a target, swing you onto one, or reach
    // across the plaza. See AIM_ASSIST in input/touch.ts for why this exists at
    // all — a thumb-drag is not a mouse, and without it most mobile firefights
    // resolve on luck rather than aim.
    if (touch.enabled && !frozen && (touch.fire || adsHeld.current)) {
      const eyeY = pos.current.y + eyeH.current;
      const cp = Math.cos(pitch.current);
      _aimDir.set(-Math.sin(yaw.current) * cp, Math.sin(pitch.current), -Math.cos(yaw.current) * cp);
      let bestDot = Math.cos(AIM_ASSIST.coneRad);
      let bestYaw = 0;
      let bestPitch = 0;
      let found = false;
      for (const e of enemies) {
        const ep = e.getPosition();
        _toTarget.set(ep.x - pos.current.x, ep.y + e.hitHeight - eyeY, ep.z - pos.current.z);
        const range = _toTarget.length();
        if (range < 1.5 || range > AIM_ASSIST.maxRange) continue;
        _toTarget.multiplyScalar(1 / range);
        const dot = _toTarget.dot(_aimDir);
        if (dot <= bestDot) continue;
        // Don't be helped onto something you can't actually shoot.
        if (raycastBoxes(_eye.set(pos.current.x, eyeY, pos.current.z), ep, BOXES3D) < 0.98) continue;
        bestDot = dot;
        bestYaw = Math.atan2(-_toTarget.x, -_toTarget.z);
        bestPitch = Math.asin(THREE.MathUtils.clamp(_toTarget.y, -1, 1));
        found = true;
      }
      if (found) {
        let dYaw = bestYaw - yaw.current;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const dPitch = bestPitch - pitch.current;
        // Inside the dead zone you're on target already — pulling further is what
        // makes an assist feel like it's playing the game for you.
        const k = Math.min(1, AIM_ASSIST.strength * dt);
        if (Math.abs(dYaw) > AIM_ASSIST.deadRad) yaw.current += dYaw * k;
        if (Math.abs(dPitch) > AIM_ASSIST.deadRad) {
          pitch.current = THREE.MathUtils.clamp(
            pitch.current + dPitch * k,
            FEEL.pitchMin,
            FEEL.pitchMax
          );
        }
      }
    }

    // Movement basis from camera yaw.
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    const wish = new THREE.Vector3();
    if (k.forward) wish.add(forward);
    if (k.back) wish.sub(forward);
    if (k.right) wish.add(right);
    if (k.left) wish.sub(right);
    // Left analog stick (mobile) — relative to camera facing, same as WASD.
    if (touch.enabled) {
      if (touch.moveY !== 0) wish.addScaledVector(forward, touch.moveY);
      if (touch.moveX !== 0) wish.addScaledVector(right, touch.moveX);
    }

    // Shelter + rest bookkeeping. Moving (or leaving the house) stands you up.
    runtime.shelterIndex = interiorIndexAt(pos.current.x, pos.current.z);
    runtime.sheltered = runtime.shelterIndex >= 0;
    // Walking into a safe house claims it as your refuge — the checkpoint you
    // come back to when downed. No prompt, no interaction: stepping inside is the
    // act of claiming it.
    if (runtime.shelterIndex >= 0) runtime.refugeIndex = runtime.shelterIndex;
    // Standing up: moving, jumping, leaving the house — or being SHOT. Resting is
    // no longer three free seconds in a frozen world; it's three seconds sitting
    // down with your back to a door, and anyone who finds you interrupts it. The
    // charge is still spent, which is the whole risk of choosing to rest here
    // rather than somewhere quieter.
    const hitWhileResting = resting.current && performance.now() - runtime.damageAt < 400;
    if (
      resting.current &&
      (wish.lengthSq() > 0 || k.jump || touch.jump || frozen || !runtime.sheltered || hitWhileResting)
    ) {
      resting.current = false;
    }
    runtime.resting = resting.current;
    if (resting.current) {
      wish.set(0, 0, 0); // seated: no locomotion until you stand
      // Burn down the spent restore, up to the cap — then stand automatically, so
      // you can't idle in a paused room after the charge has done its work.
      const g = useGame.getState();
      if (g.playerHealth < g.maxPlayerHealth * REST.healCap) g.healPlayer(REST.regenPerSec * dt);
      else resting.current = false;
    }

    const run = k.run || touch.run;
    const jump = k.jump || touch.jump;
    const moving = wish.lengthSq() > 0 && !frozen;
    // Touch has no pointer lock — first stick or button input counts as ready.
    if (touch.enabled && (moving || touch.fire || touch.jump)) runtime.playerReady = true;
    runtime.running = moving && run && !crouching.current;
    runtime.playerMoving = moving;
    runtime.crouching = crouching.current;

    // ── Vault over chest-high cover ──
    //
    // The micro-cover crates used to be dead ends: you walked into one and simply
    // stopped, with no bump, no step, no way past. In a game about chasing a
    // treasure across a village that reads as a bug rather than as cover. Jump
    // into one now and you hurdle it — the "Vault Over Box" clip was already
    // loaded and wired into the state machine, it had just never had anything to
    // trigger it.
    // Prefer where you're actually travelling; fall back to where you face, so
    // a standing vault off a wall of crates still works.
    const vaultAhead =
      grounded.current && !frozen && !vault.current
        ? (() => {
            const vx = vel.current.x;
            const vz = vel.current.z;
            const useVel = Math.hypot(vx, vz) > 0.6;
            return vaultTarget(
              pos.current.x,
              pos.current.z,
              useVel ? vx : Math.sin(yaw.current),
              useVel ? vz : Math.cos(yaw.current),
              FEEL.playerRadius
            );
          })()
        : null;
    // Published so the touch action button can offer VAULT (mobile has no room
    // for a dedicated jump button).
    runtime.canVault = vaultAhead !== null;

    // Space is contextual, in priority order: hurdle a crate if one's in front of
    // you, ROLL if you're already moving, jump if you're standing still. The roll
    // takes the middle slot because that case had nothing useful in it — a
    // running jump over flat ground played the vault clip as a hurdle over
    // nothing, and the game's entire defensive vocabulary was walking backwards.
    const planarNow = Math.hypot(vel.current.x, vel.current.z);
    if (
      grounded.current &&
      jump &&
      !frozen &&
      !vault.current &&
      !vaultAhead &&
      !dodge.current &&
      !crouching.current &&
      planarNow > 0.6 &&
      performance.now() >= dodgeReadyAt.current
    ) {
      // Roll along TRAVEL, not along aim: you commit to where your feet were
      // already going, which is what makes it a decision rather than a free
      // reposition in any direction.
      const inv = 1 / planarNow;
      dodge.current = { t: 0, dx: vel.current.x * inv, dz: vel.current.z * inv };
      dodgeReadyAt.current = performance.now() + FEEL.dodgeCooldown * 1000;
      rigState.current.dodgeAt = performance.now();
      fireHeld.current = false; // committed — no rolling and shooting
      bombAim.current = false;
      audio.play(runtime.sheltered ? "footstepWood" : "footstepStone", 1);
    }

    if (dodge.current) {
      // The roll OWNS locomotion while it runs: no steering, no accel curve, no
      // decay. That commitment is the cost you pay for the distance.
      const d = dodge.current;
      d.t = Math.min(1, d.t + dt / FEEL.dodgeTime);
      const speed = THREE.MathUtils.lerp(FEEL.dodgeSpeed, FEEL.dodgeExitSpeed, d.t * d.t);
      vel.current.x = d.dx * speed;
      vel.current.z = d.dz * speed;
      if (d.t >= 1) dodge.current = null;
    } else if (moving) {
      // Touch is ANALOG: how far the stick is pushed sets how fast you go. This
      // was being thrown away by the normalize below, so any stick input at all
      // moved you at full walk speed — half of why mobile felt like it was always
      // sprinting. Keyboard stays digital (always 1).
      const analog = touch.enabled
        ? THREE.MathUtils.clamp(Math.min(1, Math.hypot(touch.moveX, touch.moveY)), 0.35, 1)
        : 1;
      wish.normalize();
      // Aiming slows you to a walk — you don't sprint down a sight line.
      const adsSpeed = 1 - adsT.current * (1 - FEEL.adsSpeedMult);
      const speed =
        (crouching.current ? FEEL.crouchSpeed : run ? FEEL.runSpeed : FEEL.walkSpeed) *
        adsSpeed *
        analog;
      const t = Math.min(1, FEEL.accel * dt);
      vel.current.x += (wish.x * speed - vel.current.x) * t;
      vel.current.z += (wish.z * speed - vel.current.z) * t;
    } else {
      const d = Math.exp(-FEEL.decay * dt);
      vel.current.x *= d;
      vel.current.z *= d;
    }

    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.z * dt;

    if (grounded.current && jump && !frozen && !vault.current) {
      const target = vaultAhead;
      if (target) {
        crouching.current = false;
        vault.current = {
          t: 0,
          fromX: pos.current.x,
          fromZ: pos.current.z,
          toX: target.landX,
          toZ: target.landZ,
          peakY: target.peakY,
        };
        audio.play(runtime.sheltered ? "footstepWood" : "footstepStone", 0.9);
      }
    }

    if (vault.current) {
      const v = vault.current;
      v.t = Math.min(1, v.t + dt / VAULT_TIME);
      const e = v.t;
      pos.current.x = v.fromX + (v.toX - v.fromX) * e;
      pos.current.z = v.fromZ + (v.toZ - v.fromZ) * e;
      // A shallow hurdle arc — up over the lip and back down the far side.
      pos.current.y = Math.sin(e * Math.PI) * v.peakY;
      vel.current.set(0, 0, 0);
      grounded.current = false;
      if (v.t >= 1) {
        vault.current = null;
        pos.current.y = 0;
        grounded.current = true;
        audio.play(runtime.sheltered ? "footstepWood" : "footstepStone", 1);
      }
    }

    // Jump + gravity (jumping stands you back up). Not while rolling — one
    // press is one action.
    if (grounded.current && jump && !frozen && !vault.current && !dodge.current) {
      crouching.current = false;
      vel.current.y = FEEL.jumpForce;
      grounded.current = false;
    }
    // Gravity — but a vault owns its own arc, so it isn't pulled out of it.
    if (!grounded.current && !vault.current) {
      vel.current.y += FEEL.gravity * dt;
      pos.current.y += vel.current.y * dt;
      if (pos.current.y <= 0) {
        pos.current.y = 0;
        vel.current.y = 0;
        grounded.current = true;
      }
    }

    // Push out of buildings, then out of any NPC bodies, then keep inside walls.
    // Mid-vault we're deliberately passing THROUGH a crate, so the box solve is
    // skipped — the landing spot was already checked to be clear.
    if (!vault.current) resolveColliders(pos.current, FEEL.playerRadius, COLLIDERS);
    for (const e of enemies) {
      const ep = e.getPosition();
      const dx = pos.current.x - ep.x;
      const dz = pos.current.z - ep.z;
      const minD = FEEL.playerRadius + e.bodyRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = minD - d;
        pos.current.x += (dx / d) * push;
        pos.current.z += (dz / d) * push;
      }
    }
    const lim = VILLAGE.half - FEEL.playerRadius;
    pos.current.x = THREE.MathUtils.clamp(pos.current.x, -lim, lim);
    pos.current.z = THREE.MathUtils.clamp(pos.current.z, -lim, lim);

    // Eye height eases between stand / crouch / seated (drives camera + aim origin).
    const eyeTarget = resting.current ? 0.75 : crouching.current ? FEEL.crouchEyeHeight : FEEL.lookAtHeight;
    eyeH.current += (eyeTarget - eyeH.current) * Math.min(1, FEEL.crouchLerp * dt);
    // ── Body facing: COMBAT STANCE, not "walk where you look" ──
    //
    // The body used to pivot to face its travel direction whenever you moved. That
    // is how a third-PERSON adventure character walks, and it's wrong for a
    // shooter: strafing left swung the whole body 90° left, so you were always
    // watching him turn instead of move, and — because travel direction and body
    // facing were then identical — the strafe and backpedal clips in the set could
    // never trigger. Every direction played the forward walk.
    //
    // Now he holds the aim direction and STRAFES around it, which is what the clip
    // set is built for. Sprinting is the exception: at a run he turns to face where
    // he's going, because nobody sprints sideways.
    const rs = rigState.current;
    rs.position.copy(pos.current);
    const planarSpeed = Math.hypot(vel.current.x, vel.current.z);
    const sprinting = runtime.running && planarSpeed > 0.5;
    const facingTarget =
      sprinting && !frozen
        ? Math.atan2(vel.current.x, vel.current.z) // face travel at a sprint
        : yaw.current + Math.PI; // otherwise hold the aim line
    bodyRot.current = lerpAngle(bodyRot.current, facingTarget, Math.min(1, FEEL.turnSpeed * dt));
    rs.rotation = bodyRot.current;
    // Interact gesture: override facing to point the body at the target (vault /
    // stall / treasure), easing quickly so the pick-up lands square on it.
    if (performance.now() < grabFaceUntil.current) {
      const fy = Math.atan2(grabTarget.current.x - pos.current.x, grabTarget.current.z - pos.current.z);
      bodyRot.current = lerpAngle(bodyRot.current, fy, Math.min(1, 14 * dt));
      rs.rotation = bodyRot.current;
    }
    rs.velocity.set(vel.current.x, 0, vel.current.z);
    // Lowered from 0.5: above that the rig snapped to Idle while the body was
    // still coasting to a stop, so the last half-metre of every stop was a slide.
    rs.moving = planarSpeed > 0.25 && !frozen && !resting.current;
    rs.running = runtime.running;
    rs.crouching = crouching.current;
    rs.grounded = grounded.current;
    rs.dead = useGame.getState().isDead;
    rs.fireAt = runtime.fireAt;
    rs.resting = resting.current;
    rs.reloading = runtime.reloading;
    rs.aimYaw = yaw.current; // torso traverses onto the crosshair (PlayerRig)
    // Directional flinch: classify where the shot came from relative to facing.
    if (runtime.damageAt !== rs.hitAt) {
      const g = useGame.getState();
      rs.hitAt = runtime.damageAt;
      // "Serious" = a big single hit, OR one that drops you into the danger band.
      // Only these play a body flinch (PlayerRig explains why); chip damage is
      // carried by the shake, the vignette and the damage arc instead.
      const big = runtime.damageAmount >= g.maxPlayerHealth * 0.15;
      // "Into danger" is an EDGE, not a state: the flinch fires on the hit that
      // CROSSES you into the danger band, once. Testing the band directly meant
      // that below 35% every single hit flinched, so low health left you
      // permanently doubled over — the exact failure this gating exists to avoid.
      const danger = g.maxPlayerHealth * 0.35;
      const intoDanger = g.playerHealth > 0 && g.playerHealth < danger && prevHealth.current >= danger;
      prevHealth.current = g.playerHealth;
      rs.hitSerious = big || intoDanger;
      rs.hitHeavy = big;
      const rel = Math.atan2(runtime.damageFrom.x, runtime.damageFrom.z) - bodyRot.current;
      const a = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)));
      rs.hitDir = a < Math.PI / 3 ? "front" : a > (2 * Math.PI) / 3 ? "back" : "side";
    }
    // Contact shadow stays flat on the ground under the player (even mid-jump).
    // Hidden in first person: it's the ambient occlusion for a body that isn't
    // drawn, so looking down would show a dark disc pooled under nothing.
    if (shadow.current) {
      shadow.current.position.set(pos.current.x, 0.02, pos.current.z);
      shadow.current.visible = !gameMode().firstPerson;
    }

    // Hint proximity: which hint zone (if any) the player is standing in.
    runtime.nearHintIndex = -1;
    runtime.nearHintIsReal = false;
    for (let i = 0; i < HINTS.length; i++) {
      const h = HINTS[i];
      if (!h.real && runtime.hintSilenced[i]) continue; // silenced decoy is gone
      if (h.real && runtime.hintStolen[i]) continue; // stolen treasure is gone
      if (Math.hypot(h.pos.x - pos.current.x, h.pos.z - pos.current.z) < HINT_RADIUS) {
        runtime.nearHintIndex = i;
        runtime.nearHintIsReal = h.real;
        break;
      }
    }

    // Bank vault proximity (deposit with E). Generous radius so depositing is easy
    // to trigger, especially with touch movement.
    runtime.nearBank =
      Math.hypot(VILLAGE.bank.x - pos.current.x, VILLAGE.bank.z - pos.current.z) < 3.2;
    // Shop opens (E / B) anywhere INSIDE the market enclosure, or when walking up
    // to the stall from just outside the gate.
    const inMarket = runtime.shelterIndex >= 0 && ENTERABLES[runtime.shelterIndex]?.kind === "market";
    runtime.nearMarket =
      inMarket ||
      Math.hypot(VILLAGE.market.x - pos.current.x, VILLAGE.market.z - pos.current.z) < 4.5;

    // Publish for fox + HUD.
    runtime.playerPos.copy(pos.current);
    runtime.yaw = yaw.current;
    runtime.grounded = grounded.current;

    // Aim direction from free-look (yaw + pitch). This is the crosshair/shot line,
    // decoupled from the body's facing. The camera looks ALONG this (not at the
    // player), so the crosshair points into the scene and shots travel level at
    // range — fixing the old "aimed at the ground past your feet" bug.
    // Recoil eases back to zero each frame; it's an additive kick on the AIM
    // angles only (camera + shot line), never on the movement/body basis.
    const rec = Math.min(1, FEEL.recoilRecover * dt);
    recoilPitch.current += (0 - recoilPitch.current) * rec;
    recoilYaw.current += (0 - recoilYaw.current) * rec;
    const aimYaw = yaw.current + recoilYaw.current;
    const aimPitch = THREE.MathUtils.clamp(pitch.current + recoilPitch.current, FEEL.pitchMin, FEEL.pitchMax + 0.35);
    rigState.current.aimPitch = aimPitch; // drives the rig's spine aim-elevation

    const cp = Math.cos(aimPitch);
    const sp = Math.sin(aimPitch);
    const aim = new THREE.Vector3(-Math.sin(aimYaw) * cp, sp, -Math.cos(aimYaw) * cp);
    const head = new THREE.Vector3(pos.current.x, pos.current.y + eyeH.current, pos.current.z);
    const rightV = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    // Bomb aim telegraph: predict the landing point along the current aim line
    // (same origin + arc as the actual throw, so the ring never lies).
    if (bombAim.current && frozen) bombAim.current = false;
    runtime.bombAiming = bombAim.current;
    if (bombAim.current) predictLanding(head, aim, runtime.bombAimPoint);

    // Ease the hip→aim blend. Both camera rigs ride this same curve (third person
    // pulls the boom in; first person narrows the lens and centres the gun), and
    // the viewmodel reads it off runtime rather than running a second ease that
    // would drift a frame or two out of sync with the FOV.
    adsT.current += ((adsHeld.current && !frozen && !resting.current ? 1 : 0) - adsT.current) *
      Math.min(1, FEEL.adsLerp * dt);
    const aimBlend = adsT.current;
    runtime.adsBlend = aimBlend;

    // What the camera looks AT. Both rigs converge on a distant point rather than
    // aiming along a parallel vector, so lens jitter barely moves the reticle.
    let lookTarget: THREE.Vector3;
    /** First-person bodycam roll, folded into the damage-stagger roll below. */
    let driftRoll = 0;

    if (gameMode().firstPerson) {
      // ── Camera: first person (Nighthaul) ──
      //
      // The lens IS the eye, so there is no boom to collide and nothing to smooth:
      // the head was already resolved against the world by the movement step, and
      // a follow lerp here would read as input lag rather than as weight.
      //
      // BODYCAM DRIFT — ported from Valor, where it is the signature of the look.
      // Three sines on incommensurate periods, so the wander never visibly loops,
      // applied to the VIEW rather than to the weapon. That distinction is the
      // whole thing: swaying the gun inside a locked lens animates a prop while
      // the head stays dead, which is what reads as "no personality". Drifting the
      // lens makes the whole frame handheld and the weapon comes along with it.
      //
      // Aiming steadies it to a fraction, so precision never fights the camera.
      const moving = runtime.playerMoving && grounded.current;
      driftT.current +=
        dt * (moving ? FIRST_PERSON.driftMoveRate : FIRST_PERSON.driftStillRate);
      const amt =
        (moving ? 1 : FIRST_PERSON.driftStillAmt) * (1 - aimBlend * FIRST_PERSON.driftAdsDamp);
      const driftPitch = Math.sin(driftT.current * 1.07) * FIRST_PERSON.driftPitch * amt;
      const driftYaw = Math.sin(driftT.current * 0.63) * FIRST_PERSON.driftYaw * amt;
      driftRoll = Math.sin(driftT.current * 0.51) * FIRST_PERSON.driftRoll * amt;
      const driftY = Math.sin(driftT.current * 2.1) * FIRST_PERSON.driftEyeBob * amt;

      camBase.current
        .copy(head)
        .addScaledVector(aim, FIRST_PERSON.eyeForward)
        .addScaledVector(UP, driftY);
      camera.position.copy(camBase.current);

      // Look along the DRIFTED aim. The hitscan is taken from the camera, so the
      // drift moves your point of aim too — as it does in Valor. That is the cost
      // of a handheld camera and the reason ADS steadies it.
      const dp = Math.cos(aimPitch + driftPitch);
      const driftedAim = new THREE.Vector3(
        -Math.sin(aimYaw + driftYaw) * dp,
        Math.sin(aimPitch + driftPitch),
        -Math.cos(aimYaw + driftYaw) * dp
      );
      lookTarget = camBase.current.clone().addScaledVector(driftedAim, FEEL.cameraConverge);

      // You are not rendered from inside your own head. (Body awareness — legs and
      // a torso when you look down — is a later pass: it needs the head bone hidden
      // rather than the whole rig, so the shadow survives.)
      rs.opacity = 0;
      rs.visible = false;
    } else {
      // ── Camera: pivot + convergence over-the-shoulder rig (Foxglade) ──
      //
      // The rig orbits a PIVOT offset from the head (out to the shoulder, up by the
      // headroom) rather than sitting behind the head itself. Because the pivot is
      // beside the player, he renders down-and-left of the reticle instead of
      // standing on it — which is the whole difference between "I can see what I'm
      // shooting" and the old rig, where his back filled the middle of the screen.
      const camDistance = THREE.MathUtils.lerp(FEEL.cameraDistance, FEEL.adsDistance, aimBlend);
      const wantShoulder = THREE.MathUtils.lerp(FEEL.cameraShoulder, FEEL.adsShoulder, aimBlend);

      // ── Collision, solved from the HEAD ──
      //
      // The ray used to be cast from the PIVOT, which sits `cameraShoulder` out to
      // the side of the head. Walk along a building and that pivot is already
      // INSIDE the wall — so the ray started in solid geometry, the solve was
      // meaningless, and the lens ended up buried in masonry with a blurred wall
      // filling half the screen. The head can never be inside a wall (the player
      // capsule collides), so it is the only honest place to cast from.
      //
      // Two rays, because the boom has two components. First: how far back can we
      // actually go? Then: at that distance, is there room to step out to the
      // shoulder — and if not, ease the offset toward zero so the camera swings
      // BEHIND the character instead of sliding sideways into the wall.
      const headPivot = head.clone().addScaledVector(UP, FEEL.cameraHeadroom);
      const backTarget = headPivot.clone().addScaledVector(aim, -camDistance);
      // CAMERA_BOXES, not BOXES3D: chest-high cover is excluded so the lens rides
      // over a crate instead of being jammed against its face (see village.ts).
      const tBack = raycastBoxes(headPivot, backTarget, CAMERA_BOXES);
      const backDist =
        tBack < 1
          ? Math.max(
              FEEL.cameraMinDistance,
              Math.min(camDistance, camDistance * tBack - FEEL.cameraCollisionBuffer)
            )
          : camDistance;

      const behind = headPivot.clone().addScaledVector(aim, -backDist);
      const shoulderTarget = behind.clone().addScaledVector(rightV, wantShoulder);
      const tSide = Math.abs(wantShoulder) > 0.01 ? raycastBoxes(behind, shoulderTarget, CAMERA_BOXES) : 1;
      // Keep the framing PROPORTIONAL as the boom shortens: the character's
      // on-screen offset is atan(shoulder / distance), so a shoulder held at its
      // full width on a boom pulled to half length throws him twice as far across
      // the frame — which is how a wall used to fling him off the side.
      const boomScale = backDist / camDistance;
      const camShoulder = wantShoulder * boomScale * (tSide < 1 ? Math.max(0, tSide - 0.15) : 1);

      // Headroom shrinks with the boom for exactly the same reason — held at full
      // height on a short boom it pitches the character down out of frame.
      const pivot = head
        .clone()
        .addScaledVector(UP, FEEL.cameraHeadroom * boomScale)
        .addScaledVector(rightV, camShoulder);
      // Far enough out that small rig motion barely moves it, which is most of why
      // the old follow read as "swimmy".
      lookTarget = pivot.clone().addScaledVector(aim, FEEL.cameraConverge);

      const desired = pivot.clone().addScaledVector(aim, -backDist);
      desired.y = Math.max(desired.y, FEEL.cameraMinHeight);

      // Smooth the follow on a base position; keep shake separate so it never
      // contaminates the follow (and the collision solve stays stable).
      camBase.current.lerp(desired, Math.min(1, FEEL.cameraLerp * dt));
      camera.position.copy(camBase.current);

      // Fade the character as the camera closes in (near a wall, or the near-
      // first-person indoor pull-in) instead of hard-hiding him — smooth, so he
      // never abruptly vanishes. Fully solid past fadeStart, gone by fadeEnd.
      const camDist = camBase.current.distanceTo(head);
      rs.opacity = THREE.MathUtils.clamp(
        (camDist - FEEL.cameraFadeEnd) / (FEEL.cameraFadeStart - FEEL.cameraFadeEnd),
        0,
        1
      );
      rs.visible = rs.opacity > 0.02;
    }

    // ── Damage shake + DIRECTIONAL stagger ──
    // A hit now shoves the view away from the shooter, kicks the pitch up, rolls
    // the camera, and jitters — all decaying over shakeDuration. The directional
    // shove is the important part: the stagger itself tells you where the shot
    // came from, instead of a symmetric rattle that could have come from anywhere.
    const shakeT = (performance.now() - runtime.damageAt) / (FEEL.shakeDuration * 1000);
    let roll = driftRoll; // first-person bodycam wander (zero in third person)
    if (shakeT >= 0 && shakeT < 1) {
      const k = (1 - shakeT) * (1 - shakeT); // ease-out
      const heavy = runtime.damageAmount >= useGame.getState().maxPlayerHealth * FEEL.heavyHitFraction ? 2 : 1;
      const amp = FEEL.shakePosAmp * k * heavy;
      camera.position.x += (Math.random() - 0.5) * 2 * amp;
      camera.position.y += (Math.random() - 0.5) * 2 * amp;
      camera.position.z += (Math.random() - 0.5) * 2 * amp;
      // Shoved AWAY from the shooter (damageFrom points at them, so subtract).
      const push = FEEL.hitPushAmp * k * heavy;
      camera.position.x -= runtime.damageFrom.x * push;
      camera.position.z -= runtime.damageFrom.z * push;
      // Roll consistently to one side per hit rather than a random rattle, so it
      // reads as a body flinch instead of noise.
      roll = runtime.hitRollSign * FEEL.shakeRollAmp * k * heavy;
    }

    // Critical health: a slow heartbeat sway on the camera. Pairs with the pulsing
    // red edge the HUD draws — you should be able to feel you're nearly dead
    // without reading a number.
    {
      const g = useGame.getState();
      const frac = g.playerHealth / g.maxPlayerHealth;
      if (frac > 0 && frac < FEEL.lowHealthFraction && !g.isDead) {
        const severity = 1 - frac / FEEL.lowHealthFraction;
        const beat = Math.sin((performance.now() / 1000) * FEEL.lowHealthPulseHz * Math.PI * 2);
        roll += beat * FEEL.lowHealthSwayAmp * severity;
      }
    }

    // Look at the CONVERGENCE point rather than along a parallel aim vector. The
    // crosshair (screen centre) is still exactly the hitscan direction, because
    // both are camera-forward — but converging on a distant point means camera
    // jitter barely moves the reticle, which is what makes the view feel planted.
    camera.lookAt(lookTarget);
    if (roll !== 0) camera.rotateZ(roll); // stagger tilt, applied after lookAt

    // Lens: widens while running so speed is felt, narrows while aiming. First
    // person runs Valor's 55°/42° pair — with a viewmodel in frame, a 60° hip
    // lens stretches the weapon at the edge and the ADS step reads as too small.
    const cam = camera as THREE.PerspectiveCamera;
    const fp = gameMode().firstPerson;
    const baseFov = fp ? FIRST_PERSON.fov : FEEL.baseFov;
    const adsFov = fp ? FIRST_PERSON.adsFov : FEEL.adsFov;
    const hipFov = baseFov + (runtime.running ? FEEL.runFovKick : 0);
    const targetFov = THREE.MathUtils.lerp(hipFov, adsFov, aimBlend);
    cam.fov += (targetFov - cam.fov) * Math.min(1, FEEL.fovLerp * dt);
    cam.updateProjectionMatrix();

    // Fire (hold left-click or F) — uses the just-updated camera aim. You CAN
    // now shoot from indoors. That used to be banned as the other half of the
    // safe-room bargain ("untouchable in there, so you don't get to shoot out").
    // With the immunity gone the ban is just a punishment: you'd be standing in a
    // room a blocker is walking into, unable to answer. Holding a doorway is a
    // legitimate position now, and a contestable one.
    // Reload bookkeeping: land the pending reload, and auto-start one the moment
    // the magazine runs dry so holding the trigger never just silently stops.
    {
      const gs = useGame.getState();
      if (gs.reloadEndsAt > 0 && performance.now() >= gs.reloadEndsAt) gs.finishReload();
      else if (gs.ammoInMag <= 0 && gs.reloadEndsAt < 0 && !gs.isDead) gs.startReload();
      runtime.reloading = gs.reloadEndsAt > 0;
    }

    fireCd.current -= dt;
    if (
      (fireHeld.current || touch.fire) &&
      (document.pointerLockElement || touch.enabled) &&
      !frozen &&
      !resting.current &&
      !runtime.paused &&
      fireCd.current <= 0 &&
      useGame.getState().spendAmmo()
    ) {
      // Equipped weapon (bought in the market) drives cadence + damage; the
      // foregrip attachment speeds any gun up.
      const gs = useGame.getState();
      const w = WEAPON_STATS[gs.equippedWeapon];
      fireCd.current = w.fireInterval * (gs.owned.includes("a_grip") ? 0.8 : 1);
      // Touch players get aim magnetism — a thumb-drag reticle cannot track a
      // strafing blocker, so the shot bends onto a nearby target (see fireHitscan).
      const shot = fireHitscan(camera, w.damage, touch.enabled);
      runtime.fireAt = performance.now();
      if (shot.hit) runtime.hitAt = performance.now();
      if (shot.headshot) runtime.headshotAt = performance.now();
      // Kick the view up + a touch sideways so each shot is FELT (recovers above).
      // The Reflex Sight attachment steadies the aim (less kick).
      const kick = gs.owned.includes("a_sight") ? 0.6 : 1;
      recoilPitch.current += FEEL.recoilKickPitch * kick;
      recoilYaw.current += (Math.random() - 0.5) * 2 * FEEL.recoilKickYaw * kick;
      // Tracer + flash leave the REAL barrel tip, which the rig publishes each
      // frame now that the weapon is aimed rather than posed. The old version used
      // fixed offsets from the eye, so the streak started somewhere near the
      // shoulder regardless of where the gun actually was.
      spawnShot(runtime.muzzlePos, shot.point, shot.hit, shot.wallNormal);
      if (shot.wallNormal) spawnDecal(shot.point, shot.wallNormal);
      // A landed body hit sprays; a killing one sprays harder and leaves a pool
      // on the ground below (Valor's flesh-surface burst + death pool, same
      // read via FoxGlade's own pooled-mesh VFX — see blood.ts).
      if (shot.hit) {
        spawnBlood(shot.point, camera.position, shot.lethal);
        const groundPos = new THREE.Vector3(shot.point.x, 0, shot.point.z);
        if (shot.lethal) {
          spawnBloodStain(groundPos, 0.85 + Math.random() * 0.3);
          if (Math.random() < 0.5) {
            spawnBloodStain(
              groundPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)),
              0.32 + Math.random() * 0.18
            );
          }
        } else if (Math.random() < 0.7) {
          spawnBloodStain(groundPos, 0.3 + Math.random() * 0.16);
        }
      }
    }
  });

  return (
    <>
      {/* Animated character rig, driven by rigState each frame. */}
      <PlayerRig state={rigState.current} />
      {/* Contact pool under the feet. This used to BE the grounding; now the rig
          casts a real shadow it's demoted to ambient occlusion — the dark patch
          directly under a body that a directional shadow alone never gives you. */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} renderOrder={2}>
        <planeGeometry args={[FEEL.playerRadius * 3.4, FEEL.playerRadius * 3.4]} />
        <meshBasicMaterial map={softShadowTexture()} transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </>
  );
}
