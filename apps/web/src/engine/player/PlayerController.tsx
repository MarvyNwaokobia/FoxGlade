"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";
import { useKeyboard } from "@/engine/input/useKeyboard";
import { VILLAGE, COLLIDERS, BOXES3D, insideInterior } from "@/engine/world/village";
import { resolveColliders, raycastBoxes } from "@/engine/world/collision";
import { useGame } from "@/engine/store";
import { fireHitscan, enemies } from "@/engine/combat/enemies";
import { spawnBomb, predictLanding } from "@/engine/combat/bombs";
import { HINTS, HINT_RADIUS, SNIFF_COOLDOWN, SNIFF_REVEAL } from "@/engine/world/hints";
import { SESSION_SECONDS, REST } from "@/engine/config/round";

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

  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
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
  const crouching = useRef(false); // C toggles; jump stands you back up
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
          document.pointerLockElement &&
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
          runtime.sniffReadyAt = now + SNIFF_COOLDOWN * 1000;
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
          spawnBomb(head, aim);
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

    // Movement basis from camera yaw.
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    const wish = new THREE.Vector3();
    if (k.forward) wish.add(forward);
    if (k.back) wish.sub(forward);
    if (k.right) wish.add(right);
    if (k.left) wish.sub(right);

    // Shelter + rest bookkeeping. Moving (or leaving the house) stands you up.
    runtime.sheltered = insideInterior(pos.current.x, pos.current.z);
    if (resting.current && (wish.lengthSq() > 0 || k.jump || frozen || !runtime.sheltered)) {
      resting.current = false;
    }
    runtime.resting = resting.current;
    if (resting.current) {
      wish.set(0, 0, 0); // seated: no locomotion until you stand
      useGame.getState().healPlayer(REST.regenPerSec * dt);
    }

    const moving = wish.lengthSq() > 0 && !frozen;
    runtime.running = moving && k.run && !crouching.current;
    runtime.crouching = crouching.current;

    if (moving) {
      wish.normalize();
      const speed = crouching.current ? FEEL.crouchSpeed : k.run ? FEEL.runSpeed : FEEL.walkSpeed;
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
    if (grounded.current && k.jump && !frozen) {
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

    // Apply to the visible body (squashing the capsule while crouched/seated).
    const eyeTarget = resting.current ? 0.75 : crouching.current ? FEEL.crouchEyeHeight : FEEL.lookAtHeight;
    eyeH.current += (eyeTarget - eyeH.current) * Math.min(1, FEEL.crouchLerp * dt);
    if (body.current) {
      body.current.position.copy(pos.current);
      body.current.rotation.y = bodyRot.current;
      let scaleTarget = crouching.current ? FEEL.crouchHeight / FEEL.playerHeight : 1;
      if (resting.current) {
        // Seated, with a slow visible breathing rise-and-fall.
        scaleTarget = 0.52 + Math.sin(performance.now() / 480) * 0.015;
      }
      body.current.scale.y += (scaleTarget - body.current.scale.y) * Math.min(1, FEEL.crouchLerp * dt);
    }
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

    // Aim direction from free-look (yaw + pitch). This is the crosshair/shot line,
    // decoupled from the body's facing. The camera looks ALONG this (not at the
    // player), so the crosshair points into the scene and shots travel level at
    // range — fixing the old "aimed at the ground past your feet" bug.
    const cp = Math.cos(pitch.current);
    const sp = Math.sin(pitch.current);
    const aim = new THREE.Vector3(-Math.sin(yaw.current) * cp, sp, -Math.cos(yaw.current) * cp);
    const head = new THREE.Vector3(pos.current.x, pos.current.y + eyeH.current, pos.current.z);
    const rightV = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    // Bomb aim telegraph: predict the landing point along the current aim line
    // (same origin + arc as the actual throw, so the ring never lies).
    if (bombAim.current && frozen) bombAim.current = false;
    runtime.bombAiming = bombAim.current;
    if (bombAim.current) predictLanding(head, aim, runtime.bombAimPoint);

    // Over-the-shoulder desired target (behind the aim line, offset to the side).
    const desired = head
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

    // Smooth the follow on a base position; keep shake separate so it never
    // contaminates the follow (and the collision solve stays stable).
    camBase.current.lerp(desired, Math.min(1, FEEL.cameraLerp * dt));
    camera.position.copy(camBase.current);

    // In tight interiors the camera pulls right up to the shoulder (near-first-
    // person). Hide the capsule at that range so it doesn't fill the screen.
    if (body.current) body.current.visible = camBase.current.distanceTo(head) > FEEL.bodyHideDistance;

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
      fireHeld.current &&
      document.pointerLockElement &&
      !frozen &&
      !resting.current &&
      !runtime.sheltered &&
      fireCd.current <= 0
    ) {
      fireCd.current = FIRE_INTERVAL;
      const hit = fireHitscan(camera);
      runtime.fireAt = performance.now();
      if (hit) runtime.hitAt = performance.now();
    }
  });

  const h = FEEL.playerHeight;
  return (
    <>
      <group ref={body}>
        {/* Body capsule */}
        <mesh position={[0, h / 2, 0]} castShadow>
          <capsuleGeometry args={[FEEL.playerRadius, h - FEEL.playerRadius * 2, 6, 12]} />
          <meshStandardMaterial color="#9aa7b2" roughness={0.7} metalness={0.05} />
        </mesh>
        {/* Facing indicator — a nose pointing +Z (the body's forward). */}
        <mesh position={[0, h * 0.62, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 0.4, 12]} />
          <meshStandardMaterial color="#ffb347" roughness={0.5} />
        </mesh>
      </group>
      {/* Soft contact shadow so the player reads as grounded, never floating. */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[FEEL.playerRadius * 1.5, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  );
}
