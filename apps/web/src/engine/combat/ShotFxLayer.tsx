"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_SHOTS, shotPool } from "./shotfx";

// Lifetimes (seconds). Tracers are brief streaks; the impact spark lingers a
// touch so a hit reads. All bloom (PostFX) makes the emissive bits glow.
const TRACER_S = 0.07;
const MUZZLE_S = 0.05;
const IMPACT_S = 0.14;

// Scratch (module-level so the frame loop never allocates).
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);

/**
 * Draws the pooled player shots: tracer + muzzle flash + impact spark. Reads the
 * shot pool each frame and poses a fixed set of meshes — no per-shot mounts.
 */
export function ShotFX() {
  const tracers = useRef<(THREE.Mesh | null)[]>([]);
  const muzzles = useRef<(THREE.Mesh | null)[]>([]);
  const impacts = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shotPool[i];
      const age = (now - s.at) / 1000;

      // Tracer: a thin box stretched from muzzle to impact, fading out fast.
      const tr = tracers.current[i];
      if (tr) {
        if (age >= 0 && age < TRACER_S) {
          _dir.copy(s.to).sub(s.from);
          const len = _dir.length();
          if (len > 1e-4) {
            _dir.multiplyScalar(1 / len);
            _mid.copy(s.from).addScaledVector(_dir, len / 2);
            tr.position.copy(_mid);
            tr.quaternion.setFromUnitVectors(_zAxis, _dir);
            tr.scale.set(1, 1, len);
            (tr.material as THREE.MeshBasicMaterial).opacity = 1 - age / TRACER_S;
            tr.visible = true;
          } else if (tr.visible) tr.visible = false;
        } else if (tr.visible) tr.visible = false;
      }

      // Muzzle flash: a small additive burst at the origin.
      const mz = muzzles.current[i];
      if (mz) {
        if (age >= 0 && age < MUZZLE_S) {
          const k = 1 - age / MUZZLE_S;
          mz.position.copy(s.from);
          mz.scale.setScalar(0.1 + (1 - k) * 0.16);
          (mz.material as THREE.MeshBasicMaterial).opacity = k;
          mz.visible = true;
        } else if (mz.visible) mz.visible = false;
      }

      // Impact spark: grows + fades at the hit point (red on a body, warm on cover).
      const im = impacts.current[i];
      if (im) {
        if (age >= 0 && age < IMPACT_S) {
          const k = 1 - age / IMPACT_S;
          im.position.copy(s.to);
          im.scale.setScalar(0.04 + (1 - k) * 0.22);
          const mat = im.material as THREE.MeshBasicMaterial;
          mat.opacity = k;
          mat.color.set(s.hit ? "#ff5a4a" : "#ffce7a");
          im.visible = true;
        } else if (im.visible) im.visible = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_SHOTS }).map((_, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              tracers.current[i] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[0.04, 0.04, 1]} />
            <meshBasicMaterial
              color="#fff1b0"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              muzzles.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
              color="#ffe08a"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              impacts.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
              color="#ffce7a"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
