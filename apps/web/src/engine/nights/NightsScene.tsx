"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Horde } from "./horde";
import { HordeMesh } from "./HordeMesh";
import { Motes } from "./motes";
import { MoteMesh } from "./MoteMesh";
import { NIGHTS, addXp, hurt, tick, waveSpec, type RunState } from "./run";
import { useKeyboard } from "@/engine/input/useKeyboard";
import { touch } from "@/engine/input/touch";
import { nightsRuntime } from "./runtime";

/**
 * One night in the village green.
 *
 * The camera is high and angled rather than over the shoulder, because the crowd
 * IS the information: you are reading the shape of the tide and picking a gap,
 * and you cannot do that from inside your own shoulder. Aiming is gone for the
 * same reason — the gun picks the nearest target so the player's whole attention
 * goes on where to stand.
 */
// Close enough that the player is a readable figure and the crowd fills the
// frame. At 25 up the character was thirty pixels tall and the fight was
// happening in the dark somewhere off-screen.
// Shallow, not steep. Looking down at 54 degrees, an upright figure projects to
// a foreshortened oval no matter how correct its transform is, and the whole
// crowd read as pills scattered on a table. Around 30 degrees is the angle where
// a body still looks like a body while you can read the ground around it. The
// genre normally solves this with camera-facing sprites; a shallower lens gets
// part of the way there without leaving 3D.
//
// It cannot go much shallower than this. At 12 up and 20 back the frustum
// swallows most of the ground plane and the frame time fell off a cliff, from a
// steady 60 to single digits. This is the compromise: bodies read as bodies,
// and the horizon stays out of shot.
const CAM_OFFSET = new THREE.Vector3(0, 15, 17);
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function NightsScene({ run }: { run: RunState }) {
  const keys = useKeyboard();
  const { camera } = useThree();

  const horde = useMemo(() => new Horde({ max: 700, half: NIGHTS.half }), []);
  const motes = useMemo(() => new Motes(900), []);

  const pos = useRef(new THREE.Vector3(0, 0, 0));
  const vel = useRef(new THREE.Vector3());
  const player = useRef<THREE.Group>(null);
  const lantern = useRef<THREE.PointLight>(null);
  const muzzle = useRef<THREE.PointLight>(null);
  const tracer = useRef<THREE.Mesh>(null);

  const fireCd = useRef(0);
  const touchCd = useRef(0);
  const invuln = useRef(0);
  const spawnAcc = useRef(0);
  const shake = useRef(0);
  const near = useRef<number[]>([]);

  // Publish for the DOM HUD, which reads on its own rAF (no React re-render
  // from inside the frame loop — same pattern as Foxglade's `runtime`).
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (run.over) {
      nightsRuntime.alive = horde.count;
      return;
    }
    tick(run, dt);

    // ---- move ----
    // Screen-relative: the camera never rotates, so W is always up-screen.
    const k = keys.current;
    let ix = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    let iz = (k.back ? 1 : 0) - (k.forward ? 1 : 0);
    if (touch.enabled) {
      ix = touch.moveX;
      iz = -touch.moveY;
    }
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    vel.current.set(ix, 0, iz).multiplyScalar(NIGHTS.moveSpeed);
    pos.current.addScaledVector(vel.current, dt);
    const h = NIGHTS.half - 1;
    pos.current.x = THREE.MathUtils.clamp(pos.current.x, -h, h);
    pos.current.z = THREE.MathUtils.clamp(pos.current.z, -h, h);

    if (player.current) {
      player.current.position.copy(pos.current);
      if (len > 0.01) player.current.rotation.y = Math.atan2(ix, iz);
    }

    // ---- spawn ----
    const spec = waveSpec(run.t);
    spawnAcc.current += spec.rate * dt;
    while (spawnAcc.current >= 1) {
      spawnAcc.current -= 1;
      // Always from beyond the light, so they walk out of the dark at you.
      const a = Math.random() * Math.PI * 2;
      const r = NIGHTS.spawnRing + Math.random() * 6;
      horde.spawn(
        THREE.MathUtils.clamp(pos.current.x + Math.cos(a) * r, -NIGHTS.half, NIGHTS.half),
        THREE.MathUtils.clamp(pos.current.z + Math.sin(a) * r, -NIGHTS.half, NIGHTS.half),
        spec.hp
      );
    }
    horde.p.speed = spec.speed;
    horde.step(dt, pos.current.x, pos.current.z);

    // ---- shoot ----
    fireCd.current -= dt;
    if (fireCd.current <= 0) {
      const target = horde.nearest(pos.current.x, pos.current.z, NIGHTS.fireRange);
      if (target >= 0) {
        fireCd.current = NIGHTS.fireInterval;
        const now = performance.now();
        const killed = horde.damage(target, NIGHTS.fireDamage, now);
        if (killed) {
          run.kills++;
          motes.drop(horde.pos[target * 2], horde.pos[target * 2 + 1], 1);
        }
        // A tracer stretched from muzzle to target, alive for a couple of frames.
        const tx = horde.pos[target * 2];
        const tz = horde.pos[target * 2 + 1];
        if (tracer.current) {
          _tmp.set(tx - pos.current.x, 0, tz - pos.current.z);
          const dist = _tmp.length();
          tracer.current.visible = true;
          tracer.current.position.set(
            pos.current.x + _tmp.x / 2,
            1.05,
            pos.current.z + _tmp.z / 2
          );
          tracer.current.rotation.y = Math.atan2(_tmp.x, _tmp.z);
          tracer.current.scale.set(1, 1, dist);
        }
        if (muzzle.current) muzzle.current.intensity = 26;
        if (player.current) player.current.rotation.y = Math.atan2(tx - pos.current.x, tz - pos.current.z);
      }
    }
    // Decay the one-frame flourishes.
    if (muzzle.current) muzzle.current.intensity = Math.max(0, muzzle.current.intensity - dt * 190);
    if (tracer.current && tracer.current.visible) {
      const m = tracer.current.material as THREE.MeshBasicMaterial;
      m.opacity -= dt * 9;
      if (m.opacity <= 0) {
        tracer.current.visible = false;
        m.opacity = 0.85;
      }
    }

    // ---- get hit ----
    invuln.current -= dt;
    touchCd.current -= dt;
    if (touchCd.current <= 0 && invuln.current <= 0) {
      horde.within(pos.current.x, pos.current.z, NIGHTS.touchRange, near.current);
      if (near.current.length) {
        touchCd.current = NIGHTS.touchInterval;
        invuln.current = NIGHTS.invulnAfterHit;
        hurt(run, NIGHTS.touchDamage);
        shake.current = 0.5;
        nightsRuntime.hitAt = performance.now();
      }
    }

    // ---- collect ----
    const gained = motes.step(dt, pos.current.x, pos.current.z, NIGHTS.magnetRadius);
    if (gained > 0) addXp(run, gained);

    // ---- lantern ----
    const radius = NIGHTS.lightRadius + run.level * NIGHTS.lightPerLevel;
    if (lantern.current) {
      lantern.current.position.set(pos.current.x, 3.1, pos.current.z);
      lantern.current.distance = radius * 2.8;
      // A slow flicker so the edge of the light is never quite still.
      lantern.current.intensity = 95 + Math.sin(run.t * 7) * 5;
    }

    // ---- camera ----
    shake.current = Math.max(0, shake.current - dt * 2.2);
    const s = shake.current * shake.current;
    camera.position.set(
      pos.current.x + CAM_OFFSET.x + (Math.random() - 0.5) * s * 1.6,
      CAM_OFFSET.y + (Math.random() - 0.5) * s * 1.6,
      pos.current.z + CAM_OFFSET.z
    );
    _look.set(pos.current.x, 0, pos.current.z);
    camera.lookAt(_look);

    nightsRuntime.alive = horde.count;
    nightsRuntime.motes = motes.count;
    nightsRuntime.px = pos.current.x;
    nightsRuntime.pz = pos.current.z;

    // Dev-only: publish the run so a headless playtest can read the real state
    // rather than scraping the HUD, which is how the first harness ended up
    // reading "Dawn" out of the permanent UNTIL DAWN label and calling every
    // run dead on the opening frame.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__nights = { run, horde, motes };
    }
  });

  return (
    <>
      {/* Almost nothing ambient: the lantern is meant to be the reason you can
          see anything at all. */}
      {/* Enough moonlight to keep walkers as silhouettes at the edge of the
          lantern. Without it they are simply not drawn, and an enemy you cannot
          see is not tension, it is a bug. */}
      <ambientLight intensity={0.34} color="#8fa0cc" />
      <hemisphereLight intensity={0.26} color="#5a6a9a" groundColor="#12161f" />
      <pointLight ref={lantern} color="#ffcf9a" intensity={95} distance={60} decay={1.15} />
      <pointLight ref={muzzle} color="#ffd9a0" intensity={0} distance={12} decay={2} position={[0, 1.2, 0]} />

      {/* Far larger than the arena on purpose. The camera looks down and past
          the player, so a plane sized to the playable area left a hard edge and
          a black void across the bottom of the frame. Fog closes the distance;
          the ground just has to never run out. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[260, 260]} />
        <meshLambertMaterial color="#2e3440" />
      </mesh>

      {/* The wall you can actually see. Without it the arena edge is invisible
          until you are pressed against it wondering why you stopped. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[NIGHTS.half - 0.6, NIGHTS.half, 96]} />
        <meshBasicMaterial color="#f2c14e" transparent opacity={0.16} toneMapped={false} />
      </mesh>

      <group ref={player}>
        {/* Stand-in body. The real rig comes once the feel is signed off —
            judging movement against a capsule is honest and costs nothing. */}
        <mesh position={[0, 0.85, 0]} castShadow>
          <capsuleGeometry args={[0.34, 0.95, 6, 12]} />
          <meshLambertMaterial color="#e8dcc6" />
        </mesh>
        <mesh position={[0, 1.15, 0.42]}>
          <boxGeometry args={[0.16, 0.16, 0.7]} />
          <meshLambertMaterial color="#8a8f99" />
        </mesh>
      </group>

      <mesh ref={tracer} visible={false}>
        <boxGeometry args={[0.05, 0.05, 1]} />
        <meshBasicMaterial color="#ffe9b0" transparent opacity={0.85} />
      </mesh>

      <HordeMesh horde={horde} />
      <MoteMesh motes={motes} />
    </>
  );
}
