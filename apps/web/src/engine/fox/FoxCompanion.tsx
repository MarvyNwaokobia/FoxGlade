"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { FEEL } from "@/engine/config/feel";
import { runtime } from "@/engine/runtime";
import { COLLIDERS } from "@/engine/world/village";
import { resolveColliders } from "@/engine/world/collision";

/**
 * The fox companion — a real rigged, animated fox (CC-BY "Fox" by pxltiger, see
 * public/CREDITS.md). It trails beside/ahead of the player so it's always on
 * screen, and plays idle / walk / run from its own clip set based on how fast
 * it's actually moving. The "_InPlace" clips have no root motion, so code moves
 * the body (same pattern as the human rigs) and the feet stay planted.
 */
const FOX_URL = "/models/fox/fox.glb";
// Fixed scale — this rigged model already renders ~fox-sized at scale 1; a
// bounding-box auto-scale is unreliable for skinned meshes (geometry bounds ≠
// skinned size). Tune FOX_SCALE / FOX_LIFT by eye.
const FOX_SCALE = 1.0;
const FOX_LIFT = 0; // vertical offset (m) if it floats/buries
const WALK_ABOVE = 0.4; // fox planar speed (m/s) above which it walks
const RUN_ABOVE = 4.5; // …above which it runs
// This realistic fox's own clip names (AnimalMesh3D). Locomotion clips carry root
// motion on RigRoot_01 — stripped below so code drives the follow, legs in place.
const CLIP = { idle: "A3_Stand_Idle_01", walk: "Loco_Walk", run: "Run" };

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(t, 1);
}

export function FoxCompanion() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null); // holds the scaled model (mixer target)
  const shadow = useRef<THREE.Mesh>(null);
  const foxPos = useRef(new THREE.Vector3(1, 0, 3));
  const facing = useRef(0);
  const speed = useRef(0);

  const { scene, animations } = useGLTF(FOX_URL);
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.scale.setScalar(FOX_SCALE);
    clone.position.y = FOX_LIFT;
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m && "roughness" in m) m.roughness = 1; // matte, no shine
      }
    });
    return clone;
  }, [scene]);

  // Strip root motion (RigRoot_01 translation) so the fox animates in place and
  // code moves it along the follow path — no forward drift / foot-skate compounding.
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

  // Crossfade to a clip by name (idempotent if already playing it).
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);

    // Target: BESIDE and slightly AHEAD of the player (camera-relative) so the
    // fox is always on-screen, never lost behind you.
    const yaw = runtime.yaw;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const target = runtime.playerPos
      .clone()
      .addScaledVector(forward, FEEL.foxForwardOffset)
      .addScaledVector(right, FEEL.foxSideOffset * FEEL.foxSide);

    const prev = foxPos.current.clone();
    foxPos.current.lerp(target, Math.min(1, FEEL.foxSpeed * dt));
    resolveColliders(foxPos.current, 0.25, COLLIDERS);

    // Measured planar speed → drives idle/walk/run.
    const delta = foxPos.current.clone().sub(prev);
    delta.y = 0;
    const inst = delta.length() / dt;
    speed.current += (inst - speed.current) * Math.min(1, 10 * dt); // smoothed
    const s = speed.current;

    // Face travel when moving; face the way the player faces when idle (so it
    // stands beside you looking ahead, not sideways). Fox model's nose is +Z.
    const targetFace = s > WALK_ABOVE ? Math.atan2(delta.x, delta.z) : yaw + Math.PI;
    facing.current = lerpAngle(facing.current, targetFace, Math.min(1, 9 * dt));

    play(s > RUN_ABOVE ? CLIP.run : s > WALK_ABOVE ? CLIP.walk : CLIP.idle);

    if (group.current) {
      group.current.position.set(foxPos.current.x, foxPos.current.y, foxPos.current.z);
      group.current.rotation.y = facing.current;

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
      {/* Contact shadow so the fox reads as grounded */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.35, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </>
  );
}

useGLTF.preload(FOX_URL);
