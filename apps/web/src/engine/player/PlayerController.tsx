"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";
import { useKeyboard } from "@/engine/input/useKeyboard";
import { VILLAGE, COLLIDERS, BOXES3D } from "@/engine/world/village";
import { resolveColliders, raycastBoxes } from "@/engine/world/collision";
import { useGame } from "@/engine/store";
import { fireHitscan, enemies } from "@/engine/combat/enemies";

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
  const pos = useRef(VILLAGE.spawn.clone());
  const vel = useRef(new THREE.Vector3(0, 0, 0));
  const yaw = useRef(VILLAGE.spawnYaw); // camera/heading yaw
  const pitch = useRef(0.35);
  const bodyRot = useRef(VILLAGE.spawnYaw);
  const grounded = useRef(true);

  // Point the HUD compass at the real treasure zone once on mount, and wire the
  // placeholder "claim" key (the real on-chain mint arrives at M3).
  useEffect(() => {
    runtime.treasurePos.copy(VILLAGE.treasure);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && runtime.nearTreasure && !useGame.getState().treasureClaimed) {
        useGame.getState().claimTreasure();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mouse look via pointer lock; left-click fires once the mouse is captured.
  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        const hit = fireHitscan(camera);
        runtime.fireAt = performance.now();
        if (hit) runtime.hitAt = performance.now();
      }
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
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
    };
  }, [gl, camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp big frame gaps so physics stays sane
    const k = keys.current;

    // Movement basis from camera yaw.
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    const wish = new THREE.Vector3();
    if (k.forward) wish.add(forward);
    if (k.back) wish.sub(forward);
    if (k.right) wish.add(right);
    if (k.left) wish.sub(right);

    const moving = wish.lengthSq() > 0;
    runtime.running = moving && k.run;

    if (moving) {
      wish.normalize();
      const speed = k.run ? FEEL.runSpeed : FEEL.walkSpeed;
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

    // Jump + gravity.
    if (grounded.current && k.jump) {
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

    // Apply to the visible body.
    if (body.current) {
      body.current.position.copy(pos.current);
      body.current.rotation.y = bodyRot.current;
    }
    // Contact shadow stays flat on the ground under the player (even mid-jump).
    if (shadow.current) {
      shadow.current.position.set(pos.current.x, 0.02, pos.current.z);
    }

    // Treasure proximity (placeholder pickup — full mint is M3).
    const td = Math.hypot(runtime.treasurePos.x - pos.current.x, runtime.treasurePos.z - pos.current.z);
    runtime.nearTreasure = td < 3.5;

    // Publish for fox + HUD.
    runtime.playerPos.copy(pos.current);
    runtime.yaw = yaw.current;

    // Orbit-follow camera.
    const horiz = FEEL.cameraDistance * Math.cos(pitch.current);
    const camTarget = new THREE.Vector3(
      pos.current.x + Math.sin(yaw.current) * horiz,
      pos.current.y + FEEL.cameraHeight + FEEL.cameraDistance * Math.sin(pitch.current),
      pos.current.z + Math.cos(yaw.current) * horiz
    );
    // Never let the camera dip below ground, or you see under the world.
    camTarget.y = Math.max(camTarget.y, FEEL.cameraMinHeight);
    camera.position.lerp(camTarget, Math.min(1, FEEL.cameraLerp * dt));

    // Camera collision: if a building is between the player and the camera, pull
    // the camera in to just in front of it — the wall stays solid, you stay in
    // view (no more camera ending up inside/behind a block).
    const head = new THREE.Vector3(pos.current.x, pos.current.y + FEEL.lookAtHeight, pos.current.z);
    const toCam = camera.position.clone().sub(head);
    const dist = toCam.length();
    if (dist > 0.001) {
      const t = raycastBoxes(head, camera.position, BOXES3D);
      if (t < 1) {
        const pulled = Math.max(dist * t - FEEL.cameraCollisionBuffer, FEEL.cameraMinDistance);
        camera.position.copy(head).addScaledVector(toCam.multiplyScalar(1 / dist), pulled);
      }
    }
    camera.lookAt(head.x, head.y, head.z);

    // Widen the lens slightly while running so speed is felt, not just numeric.
    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = FEEL.baseFov + (runtime.running ? FEEL.runFovKick : 0);
    cam.fov += (targetFov - cam.fov) * Math.min(1, FEEL.fovLerp * dt);
    cam.updateProjectionMatrix();
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
