"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";
import { useKeyboard } from "@/engine/input/useKeyboard";
import { VILLAGE, COLLIDERS, BOXES3D, interiorIndexAt } from "@/engine/world/village";
import { resolveColliders, raycastBoxes } from "@/engine/world/collision";
import { useGame } from "@/engine/store";
import { fireHitscan, enemies } from "@/engine/combat/enemies";
import { spawnShot } from "@/engine/combat/shotfx";
import { spawnBomb, predictLanding } from "@/engine/combat/bombs";
import { audio } from "@/engine/audio/audio";
import { HINTS, HINT_RADIUS, SNIFF_COOLDOWN, SNIFF_REVEAL } from "@/engine/world/hints";
import { foxGrowthFor } from "@/engine/config/fox";
import { SESSION_SECONDS, REST, BOMB } from "@/engine/config/round";
import { PlayerRig, type PlayerRigState } from "@/engine/character/PlayerRig";
import { touch } from "@/engine/input/touch";

const FIRE_INTERVAL = 0.16; // seconds between shots when holding fire

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
    position: VILLAGE.spawn.clone(),
    rotation: VILLAGE.spawnYaw,
    aimPitch: 0.35,
    velocity: new THREE.Vector3(),
    moving: false,
    running: false,
    crouching: false,
    grounded: true,
    dead: false,
    fireAt: -1,
    throwAt: -1,
    resting: false,
    visible: true,
    opacity: 1,
  });
  const camBase = useRef(new THREE.Vector3(0, 4, 8)); // smoothed camera pos (shake kept separate)
  const pos = useRef(VILLAGE.spawn.clone());
  const vel = useRef(new THREE.Vector3(0, 0, 0));
  const yaw = useRef(VILLAGE.spawnYaw); // camera/heading yaw
  const pitch = useRef(0.35);
  const bodyRot = useRef(VILLAGE.spawnYaw);
  const grounded = useRef(true);
  const fireHeld = useRef(false);
  const fireCd = useRef(0);
  const bombAim = useRef(false); // holding G: telegraph shows, release throws
  const recoilPitch = useRef(0); // transient view kick from firing (recovers to 0)
  const recoilYaw = useRef(0);
  const crouching = useRef(false); // C toggles; jump stands you back up
  const firstPerson = useRef(false); // V toggles the camera between 3rd and 1st person
  const resting = useRef(false); // sitting indoors (X); any movement stands up
  const eyeH = useRef(FEEL.lookAtHeight); // eased eye height (stand ↔ crouch ↔ sit)

  // Interaction keys: E claim (only at the real hint), R respawn, F fire,
  // Q fox-sniff (reveals the real hint on a cooldown).
  // Start the round timer when play begins.
  useEffect(() => {
    runtime.roundStartAt = performance.now();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE") {
        if (runtime.nearHintIsReal && !useGame.getState().treasureClaimed) {
          useGame.getState().claimTreasure(runtime.nearHintIndex);
        } else if (runtime.nearBank && useGame.getState().villeCarrying > 0) {
          useGame.getState().depositLoot();
        }
      }
      if (e.code === "KeyR" && useGame.getState().isDead) {
        useGame.getState().respawn();
      }
      if (e.code === "Enter" && useGame.getState().roundState !== "playing") {
        useGame.getState().restart();
      }
      if (e.code === "KeyF") fireHeld.current = true; // keyboard fire (hold to auto-fire)
      if (e.code === "KeyC" && !e.repeat) crouching.current = !crouching.current;
      if (e.code === "KeyV" && !e.repeat) firstPerson.current = !firstPerson.current;
      if (e.code === "KeyX" && !e.repeat) {
        // Sit to rest — only indoors, and standing back up is always allowed.
        if (resting.current) resting.current = false;
        else if (runtime.sheltered && useGame.getState().roundState === "playing" && !useGame.getState().isDead) {
          resting.current = true;
          crouching.current = false;
          fireHeld.current = false;
          bombAim.current = false;
        }
      }
      if (e.code === "KeyG" && !e.repeat) {
        // Start aiming a bomb throw (needs the mouse captured, a bomb, live
        // play, and being outside — the world is paused indoors).
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
      if (e.code === "KeyQ") {
        const now = performance.now();
        if (now >= runtime.sniffReadyAt) {
          runtime.revealRealUntil = now + SNIFF_REVEAL * 1000;
          // A matured fox sniffs more often (DESIGN §2.5): cooldown scales with stage.
          const mult = foxGrowthFor(useGame.getState().villeBanked).sniffCooldownMult;
          runtime.sniffReadyAt = now + SNIFF_COOLDOWN * mult * 1000;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "KeyF") fireHeld.current = false;
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

  // On respawn, return the player to the spawn point.
  const respawnNonce = useGame((s) => s.respawnNonce);
  useEffect(() => {
    pos.current.copy(VILLAGE.spawn);
    vel.current.set(0, 0, 0);
    crouching.current = false;
    resting.current = false;
  }, [respawnNonce]);

  // Mouse look via pointer lock; left-click fires once the mouse is captured.
  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) fireHeld.current = true; // hold to auto-fire
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) fireHeld.current = false;
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yaw.current -= e.movementX * FEEL.mouseSensitivity;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * FEEL.mouseSensitivity,
        FEEL.pitchMin,
        FEEL.pitchMax
      );
    };
    const onLockChange = () => {
      if (document.pointerLockElement !== canvas) fireHeld.current = false; // stop firing when unfocused
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [gl, camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp big frame gaps so physics stays sane
    const k = keys.current;

    // Indoors the WORLD pauses (Marvy's call): hold the clock by pushing the
    // round start forward — thieves/blockers/projectiles freeze on this flag too.
    if (useGame.getState().roundState === "playing" && runtime.sheltered) {
      runtime.roundStartAt += dt * 1000;
    }
    // Round timer: end the round when it runs out; freeze play when it's over.
    if (
      useGame.getState().roundState === "playing" &&
      SESSION_SECONDS - (performance.now() - runtime.roundStartAt) / 1000 <= 0
    ) {
      useGame.getState().endRound("timeout");
    }
    const frozen = useGame.getState().isDead || useGame.getState().roundState !== "playing";

    // Mobile look: apply the accumulated touch-drag to yaw/pitch (already in
    // radians), then consume it. No pointer lock on touch, so this replaces it.
    if (touch.enabled && (touch.lookDX !== 0 || touch.lookDY !== 0)) {
      yaw.current -= touch.lookDX;
      pitch.current = THREE.MathUtils.clamp(pitch.current - touch.lookDY, FEEL.pitchMin, FEEL.pitchMax);
      touch.lookDX = 0;
      touch.lookDY = 0;
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
    if (resting.current && (wish.lengthSq() > 0 || k.jump || touch.jump || frozen || !runtime.sheltered)) {
      resting.current = false;
    }
    runtime.resting = resting.current;
    if (resting.current) {
      wish.set(0, 0, 0); // seated: no locomotion until you stand
      useGame.getState().healPlayer(REST.regenPerSec * dt);
    }

    const run = k.run || touch.run;
    const jump = k.jump || touch.jump;
    const moving = wish.lengthSq() > 0 && !frozen;
    runtime.running = moving && run && !crouching.current;
    runtime.crouching = crouching.current;

    if (moving) {
      wish.normalize();
      const speed = crouching.current ? FEEL.crouchSpeed : run ? FEEL.runSpeed : FEEL.walkSpeed;
      const t = Math.min(1, FEEL.accel * dt);
      vel.current.x += (wish.x * speed - vel.current.x) * t;
      vel.current.z += (wish.z * speed - vel.current.z) * t;
      // Rotate the body to face where it's heading.
      const target = Math.atan2(wish.x, wish.z);
      bodyRot.current = lerpAngle(bodyRot.current, target, FEEL.turnSpeed * dt);
    } else {
      const d = Math.exp(-FEEL.decay * dt);
      vel.current.x *= d;
      vel.current.z *= d;
    }

    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.z * dt;

    // Jump + gravity (jumping stands you back up).
    if (grounded.current && jump && !frozen) {
      crouching.current = false;
      vel.current.y = FEEL.jumpForce;
      grounded.current = false;
    }
    if (!grounded.current) {
      vel.current.y += FEEL.gravity * dt;
      pos.current.y += vel.current.y * dt;
      if (pos.current.y <= 0) {
        pos.current.y = 0;
        vel.current.y = 0;
        grounded.current = true;
      }
    }

    // Push out of buildings, then out of any NPC bodies, then keep inside walls.
    resolveColliders(pos.current, FEEL.playerRadius, COLLIDERS);
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
    // Feed the animated rig: face travel while moving, aim while standing.
    const rs = rigState.current;
    rs.position.copy(pos.current);
    const planarSpeed = Math.hypot(vel.current.x, vel.current.z);
    rs.rotation = planarSpeed > 0.5 && !frozen ? bodyRot.current : yaw.current + Math.PI;
    rs.velocity.set(vel.current.x, 0, vel.current.z);
    rs.moving = planarSpeed > 0.5 && !frozen && !resting.current;
    rs.running = runtime.running;
    rs.crouching = crouching.current;
    rs.grounded = grounded.current;
    rs.dead = useGame.getState().isDead;
    rs.fireAt = runtime.fireAt;
    rs.resting = resting.current;
    // Contact shadow stays flat on the ground under the player (even mid-jump).
    if (shadow.current) {
      shadow.current.position.set(pos.current.x, 0.02, pos.current.z);
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

    // Bank vault proximity (deposit with E).
    runtime.nearBank =
      Math.hypot(VILLAGE.bank.x - pos.current.x, VILLAGE.bank.z - pos.current.z) < 2.2;

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

    // Camera target: FIRST-PERSON sits right at the eyes (V toggles); otherwise
    // it rides over the shoulder behind the aim line, with wall collision.
    let desired: THREE.Vector3;
    if (firstPerson.current) {
      // At the eyes, nudged a touch forward so we're past the neck. The body
      // fades out on its own here (camera is essentially inside it).
      desired = head.clone().addScaledVector(aim, 0.14);
      desired.y = Math.max(desired.y, 0.3);
    } else {
      // Over-the-shoulder desired target (behind the aim line, offset to the side).
      desired = head
        .clone()
        .addScaledVector(aim, -FEEL.cameraDistance)
        .addScaledVector(rightV, FEEL.cameraShoulder);
      desired.y = Math.max(desired.y, FEEL.cameraMinHeight);

      // Camera collision: raycast head → the DESIRED target (a stable point, not the
      // current camera position) and pull the target in to just before any wall.
      // Correcting the target once and then smoothing to it avoids the per-frame
      // lerp-out / snap-in oscillation that made the camera shake against buildings.
      const toDesired = desired.clone().sub(head);
      const dist = toDesired.length();
      if (dist > 0.001) {
        const t = raycastBoxes(head, desired, BOXES3D);
        if (t < 1) {
          const d = Math.max(FEEL.cameraMinDistance, Math.min(dist, dist * t - FEEL.cameraCollisionBuffer));
          desired.copy(head).addScaledVector(toDesired.multiplyScalar(1 / dist), d);
          desired.y = Math.max(desired.y, FEEL.cameraMinHeight);
        }
      }
    }

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

    // Damage shake + stagger tilt, decaying over shakeDuration.
    const shakeT = (performance.now() - runtime.damageAt) / (FEEL.shakeDuration * 1000);
    let roll = 0;
    if (shakeT >= 0 && shakeT < 1) {
      const k = (1 - shakeT) * (1 - shakeT); // ease-out
      const amp = FEEL.shakePosAmp * k;
      camera.position.x += (Math.random() - 0.5) * 2 * amp;
      camera.position.y += (Math.random() - 0.5) * 2 * amp;
      camera.position.z += (Math.random() - 0.5) * 2 * amp;
      roll = (Math.random() - 0.5) * 2 * FEEL.shakeRollAmp * k;
    }

    // Look along the aim direction so crosshair (screen center) == shot line.
    camera.lookAt(camera.position.x + aim.x, camera.position.y + aim.y, camera.position.z + aim.z);
    if (roll !== 0) camera.rotateZ(roll); // stagger tilt, applied after lookAt

    // Widen the lens slightly while running so speed is felt, not just numeric.
    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = FEEL.baseFov + (runtime.running ? FEEL.runFovKick : 0);
    cam.fov += (targetFov - cam.fov) * Math.min(1, FEEL.fovLerp * dt);
    cam.updateProjectionMatrix();

    // Fire (hold left-click or F) — uses the just-updated camera aim.
    // Not while seated or sheltered: indoors the world is paused (no shooting
    // frozen enemies through the doorway), stand and step out to fight.
    fireCd.current -= dt;
    if (
      (fireHeld.current || touch.fire) &&
      (document.pointerLockElement || touch.enabled) &&
      !frozen &&
      !resting.current &&
      !runtime.sheltered &&
      fireCd.current <= 0
    ) {
      fireCd.current = FIRE_INTERVAL;
      const shot = fireHitscan(camera);
      runtime.fireAt = performance.now();
      if (shot.hit) runtime.hitAt = performance.now();
      if (shot.headshot) runtime.headshotAt = performance.now();
      // Kick the view up + a touch sideways so each shot is FELT (recovers above).
      recoilPitch.current += FEEL.recoilKickPitch;
      recoilYaw.current += (Math.random() - 0.5) * 2 * FEEL.recoilKickYaw;
      // Cosmetic tracer + muzzle flash, launched from a shouldered-rifle muzzle
      // offset (not the camera) so the streak reads as leaving the gun.
      const muzzle = head
        .clone()
        .addScaledVector(aim, FEEL.muzzleForward)
        .addScaledVector(rightV, FEEL.muzzleSide);
      muzzle.y -= FEEL.muzzleDrop;
      spawnShot(muzzle, shot.point, shot.hit);
    }
  });

  return (
    <>
      {/* Animated character rig, driven by rigState each frame. */}
      <PlayerRig state={rigState.current} />
      {/* Soft contact shadow so the player reads as grounded, never floating. */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[FEEL.playerRadius * 1.5, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  );
}
