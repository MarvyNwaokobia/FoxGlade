"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { runtime } from "@/engine/runtime";
import { enemies, type Enemy } from "@/engine/combat/enemies";
import { useGame } from "@/engine/store";
import { audio } from "@/engine/audio/audio";
import { FOX, foxGrowthFor } from "@/engine/config/fox";
import { softShadowTexture } from "@/engine/world/softShadow";
import { findPath } from "@/engine/world/navgrid";
import {
  applyLunge,
  findAttackTarget,
  findScoutTarget,
  pruneStagger,
  steerTowards,
  type FoxState,
} from "./foxBrain";

/**
 * The fox companion — a real rigged, animated fox (CC-BY "Fox" by pxltiger, see
 * public/CREDITS.md), now with an actual brain (see foxBrain.ts).
 *
 * It keeps LOOSE station beside and slightly ahead of you rather than being
 * welded to an offset, so it lags, cuts corners and catches up like an animal.
 * It can be SENT: to scout out the real treasure (and it genuinely runs there, so
 * you follow it) or to jump a threat (staggering a blocker, slowing a thief). And
 * it can be shot — it never dies, but it goes down and you lose it for a while,
 * which is what makes any of the above feel like it costs something.
 */
const FOX_URL = "/models/fox/fox.glb";
const FOX_SCALE = 1.0;
const WALK_ABOVE = 0.4; // planar speed (m/s) above which it walks
const RUN_ABOVE = 4.5; // …above which it runs

const CLIP = {
  idle: "A3_Stand_Idle_01",
  walk: "Loco_Walk",
  run: "Run",
  angry: "A5_StandAngry_Breathing_01", // alert / lunge
  hit: "Hit_Stand_R01", // flinch, and the downed pose
  sniff: "A2_Stand_Eating_01", // nose-down: scenting, and digging at a find
};

const ALERT_RANGE = 18; // a threat this close to the player → growl
const GROWL_INTERVAL = 1.3;
const _enemyPos = new THREE.Vector3();
const _target = new THREE.Vector3();
// Separate scratch for the previous position + the frame's travel delta. These
// MUST NOT share storage with _target: copying into a shared vector makes "prev"
// an alias of the follow target, so the moment the target is recomputed the
// previous position changes too and the measured speed goes to nonsense.
const _prev = new THREE.Vector3();
const _delta = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(t, 1);
}

export function FoxCompanion() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const foxPos = useRef(new THREE.Vector3(1, 0, 3));
  const facing = useRef(0);
  const speed = useRef(0);
  const growlClock = useRef(0.4);
  const wasAlerting = useRef(false);
  const lastDamageAt = useRef(-1);
  const foxScale = useRef(0.6);
  const lastStage = useRef(-1);

  // Brain state.
  const state = useRef<FoxState>("heel");
  const scoutTarget = useRef<THREE.Vector3 | null>(null);
  const scoutClock = useRef(0); // counts up while scouting (timeout guard)
  const holdClock = useRef(0); // waiting at the find, barking
  const attackTarget = useRef<Enemy | null>(null);
  const idleClock = useRef(0); // how long the player has been still
  const wanderTarget = useRef<THREE.Vector3 | null>(null);
  // A* route while travelling anywhere far (scout / attack / catching up). Local
  // steering handles the metre-to-metre; this guarantees the route exists at all.
  const path = useRef<THREE.Vector3[]>([]);
  const repathClock = useRef(0);

  const { scene, animations } = useGLTF(FOX_URL);
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.scale.setScalar(FOX_SCALE);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m && "roughness" in m) m.roughness = 1;
      }
    });
    return clone;
  }, [scene]);

  // Strip root motion so code drives the body and the feet stay planted.
  const clips = useMemo(
    () =>
      animations.map((c) => {
        const cc = c.clone();
        cc.tracks = cc.tracks.filter((t) => !/RigRoot_01\.position$/.test(t.name));
        return cc;
      }),
    [animations]
  );
  const { actions } = useAnimations(clips, inner);
  const current = useRef<string>("");

  const play = (name: string) => {
    if (current.current === name || !actions[name]) return;
    const next = actions[name]!;
    const prev = current.current ? actions[current.current] : null;
    next.reset().fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    current.current = name;
  };

  useEffect(() => {
    play(CLIP.idle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // Commands come from the controller as a window event so the fox can be sent
  // from anywhere (keyboard, touch button) without threading props through.
  useEffect(() => {
    const onCommand = () => {
      const now = performance.now();
      const gs = useGame.getState();
      if (state.current === "down" || now < runtime.foxReadyAt) return;
      if (gs.isDead || gs.roundState !== "playing") return;

      // ONE contextual command: a threat nearby means "go get it", otherwise
      // "go find the treasure". One button that always does the sensible thing
      // beats two buttons the player has to choose between mid-fight.
      const threat = findAttackTarget();
      const mult = foxGrowthFor(gs.villeEarned).sniffCooldownMult;
      if (threat) {
        attackTarget.current = threat;
        state.current = "attack";
        audio.play("foxGrowl");
      } else {
        const t = findScoutTarget();
        if (!t) return;
        scoutTarget.current = t;
        scoutClock.current = 0;
        state.current = "scout";
        runtime.foxFoundTreasure = false;
        audio.play("foxYip");
      }
      runtime.foxReadyAt = now + FOX.commandCooldown * mult * 1000;
    };
    window.addEventListener("foxcommand", onCommand);
    return () => window.removeEventListener("foxcommand", onCommand);
  }, []);

  /**
   * Travel toward a distant goal using an A* route, re-planning periodically.
   * Returns metres covered this frame.
   */
  const travelTo = (goal: THREE.Vector3, spd: number, dt: number): number => {
    repathClock.current -= dt;
    const needPath =
      path.current.length === 0 ||
      repathClock.current <= 0 ||
      goal.distanceToSquared(path.current[path.current.length - 1]) > 4;
    if (needPath) {
      repathClock.current = 0.75;
      path.current = findPath(foxPos.current, goal) ?? [];
    }
    // Pop waypoints we've reached.
    while (path.current.length && path.current[0].distanceTo(foxPos.current) < 0.9) {
      path.current.shift();
    }
    const next = path.current[0] ?? goal;
    return steerTowards(foxPos.current, next, spd, dt);
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const now = performance.now();
    const gs = useGame.getState();
    const active = gs.roundState === "playing" && !gs.isDead;
    pruneStagger();

    // ── Growth (unchanged): the fox matures as you bank loot ──
    const growth = foxGrowthFor(gs.villeEarned);
    foxScale.current += (growth.scale - foxScale.current) * Math.min(1, 3 * dt);
    if (inner.current) inner.current.scale.setScalar(foxScale.current);
    if (lastStage.current < 0) {
      lastStage.current = growth.stage;
    } else if (growth.stage > lastStage.current) {
      lastStage.current = growth.stage;
      runtime.foxGrewAt = now;
      runtime.foxStageName = growth.name;
      audio.play("foxYip");
    }

    // ── Downed: it stays put until it recovers ──
    if (state.current === "down" && now >= runtime.foxDownUntil) {
      state.current = "heel";
      runtime.foxDownUntil = -1;
      audio.play("foxYip");
    }

    _prev.copy(foxPos.current);
    let moveSpeed = 0;

    if (state.current === "down") {
      // Lies where it fell.
    } else if (state.current === "attack") {
      const t = attackTarget.current;
      if (!t || !enemies.has(t) || !active) {
        attackTarget.current = null;
        state.current = "heel";
      } else {
        const tp = t.getPosition();
        _enemyPos.set(tp.x, 0, tp.z);
        const d = Math.hypot(tp.x - foxPos.current.x, tp.z - foxPos.current.z);
        if (d <= FOX.attackReachDist) {
          applyLunge(t);
          audio.playAt("foxGrowl", foxPos.current.x, foxPos.current.z, 6, 40);
          attackTarget.current = null;
          path.current.length = 0;
          state.current = "heel";
        } else {
          moveSpeed = travelTo(_enemyPos, FOX.attackSpeed, dt);
        }
      }
    } else if (state.current === "scout") {
      scoutClock.current += dt;
      const t = scoutTarget.current;
      if (!t || !active || scoutClock.current > FOX.scoutTimeout) {
        scoutTarget.current = null;
        path.current.length = 0;
        state.current = "heel";
      } else {
        const d = Math.hypot(t.x - foxPos.current.x, t.z - foxPos.current.z);
        if (d <= FOX.scoutArriveDist) {
          // Found it. Hold position, bark, dig — this is the fox telling you
          // something true, and it's the only thing in the game that can't lie.
          if (!runtime.foxFoundTreasure) {
            runtime.foxFoundTreasure = true;
            runtime.foxFoundAt = now;
            holdClock.current = FOX.scoutHoldTime;
            audio.playAt("foxYip", foxPos.current.x, foxPos.current.z, 8, 50);
          }
          holdClock.current -= dt;
          if (holdClock.current <= 0) {
            scoutTarget.current = null;
            path.current.length = 0;
            state.current = "heel";
          }
        } else {
          moveSpeed = travelTo(t, FOX.scoutSpeed, dt);
        }
      }
    } else {
      // ── HEEL: loose station-keeping, not a weld ──
      const yaw = runtime.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      _target.set(
        runtime.playerPos.x + fx * FOX.leadOffset + rx * FOX.sideOffset,
        0,
        runtime.playerPos.z + fz * FOX.leadOffset + rz * FOX.sideOffset
      );

      idleClock.current = runtime.playerMoving ? 0 : idleClock.current + dt;

      const gap = Math.hypot(_target.x - foxPos.current.x, _target.z - foxPos.current.z);
      const leash = Math.hypot(
        runtime.playerPos.x - foxPos.current.x,
        runtime.playerPos.z - foxPos.current.z
      );

      if (leash > FOX.leashRadius) {
        foxPos.current.set(_target.x, 0, _target.z); // hopelessly lost — snap back
      } else if (idleClock.current > FOX.idleWanderAfter) {
        // You've stopped; it goes and noses at something nearby, then comes back.
        if (!wanderTarget.current) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * FOX.idleWanderRadius;
          wanderTarget.current = new THREE.Vector3(
            runtime.playerPos.x + Math.cos(a) * r,
            0,
            runtime.playerPos.z + Math.sin(a) * r
          );
        }
        const wd = Math.hypot(
          wanderTarget.current.x - foxPos.current.x,
          wanderTarget.current.z - foxPos.current.z
        );
        if (wd < 0.6) {
          wanderTarget.current = null;
          idleClock.current = FOX.idleWanderAfter * 0.35; // pause before the next
        } else {
          moveSpeed = steerTowards(foxPos.current, wanderTarget.current, FOX.walkSpeed, dt);
        }
      } else {
        wanderTarget.current = null;
        // Inside the radius it doesn't bother chasing — that slack is the whole
        // difference between a companion and a tethered prop.
        if (gap > FOX.followRadius) {
          const sprint = gap > FOX.sprintRadius;
          const spd = sprint ? FOX.runSpeed : FOX.walkSpeed;
          // Close by, steer directly (cheap, and it keeps the follow supple).
          // Far off — round a building, say — plan a route instead, or it gets
          // stuck on the far side of a wall exactly like the scout used to.
          moveSpeed =
            gap > FOX.sprintRadius
              ? travelTo(_target, spd, dt)
              : steerTowards(foxPos.current, _target, spd, dt);
        }
      }
    }

    // Measured speed → drives idle/walk/run.
    const inst = moveSpeed / dt;
    speed.current += (inst - speed.current) * Math.min(1, 10 * dt);
    const s = speed.current;
    _delta.set(foxPos.current.x - _prev.x, 0, foxPos.current.z - _prev.z);

    runtime.foxPos.copy(foxPos.current);
    runtime.foxState = state.current;

    // ── Reactions ──
    let nearestD = Infinity;
    if (active && state.current !== "down") {
      for (const e of enemies) {
        if (e.kind === "distractor") continue;
        const p = e.getPosition();
        const d = Math.hypot(p.x - runtime.playerPos.x, p.z - runtime.playerPos.z);
        if (d < nearestD) {
          nearestD = d;
          _enemyPos.copy(p);
        }
      }
    }
    const alerting = active && nearestD < ALERT_RANGE && state.current === "heel";
    if (alerting) {
      growlClock.current -= dt;
      if (!wasAlerting.current || growlClock.current <= 0) {
        growlClock.current = GROWL_INTERVAL + Math.random() * 0.5;
        audio.play("foxGrowl");
      }
    }
    wasAlerting.current = alerting;
    if (runtime.damageAt !== lastDamageAt.current) {
      lastDamageAt.current = runtime.damageAt;
      if (active) audio.play("foxWhine");
    }

    // ── Facing + clip ──
    const moving = s > WALK_ABOVE;
    let targetFace: number;
    if (moving) targetFace = Math.atan2(_delta.x, _delta.z);
    else if (state.current === "scout" && runtime.foxFoundTreasure)
      targetFace = Math.atan2(runtime.playerPos.x - foxPos.current.x, runtime.playerPos.z - foxPos.current.z);
    else if (alerting) targetFace = Math.atan2(_enemyPos.x - foxPos.current.x, _enemyPos.z - foxPos.current.z);
    else targetFace = runtime.yaw + Math.PI;
    facing.current = lerpAngle(facing.current, targetFace, Math.min(1, 9 * dt));

    let clip: string;
    if (state.current === "down") clip = CLIP.hit;
    else if (state.current === "attack") clip = moving ? CLIP.run : CLIP.angry;
    else if (state.current === "scout")
      clip = runtime.foxFoundTreasure && !moving ? CLIP.sniff : moving ? CLIP.run : CLIP.walk;
    else if (moving) clip = s > RUN_ABOVE ? CLIP.run : CLIP.walk;
    else if (alerting) clip = CLIP.angry;
    else clip = CLIP.idle;
    play(clip);

    if (group.current) {
      group.current.position.copy(foxPos.current);
      group.current.rotation.y = facing.current;
      // Downed: roll onto its side so it reads as hurt, not just standing still.
      group.current.rotation.z = state.current === "down" ? Math.PI * 0.42 : 0;
    }
    if (shadow.current) shadow.current.position.set(foxPos.current.x, 0.02, foxPos.current.z);
  });

  return (
    <>
      <group ref={group}>
        <group ref={inner}>
          <primitive object={model} />
        </group>
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} renderOrder={2}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial map={softShadowTexture()} transparent opacity={0.32} depthWrite={false} />
      </mesh>
    </>
  );
}

useGLTF.preload(FOX_URL);
