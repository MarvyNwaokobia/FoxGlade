"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_DECALS, decalPool, bulletHoleTexture } from "./decals";

// Fade-in only — a decal is meant to persist once it's landed (see decals.ts),
// so there's no fade-out timer here, just a quick pop so it doesn't just snap
// into existence.
const FADE_IN_S = 0.12;

const _zAxis = new THREE.Vector3(0, 0, 1);
const _twistQ = new THREE.Quaternion();
const _alignQ = new THREE.Quaternion();

/** Deterministic per-slot size variance, same trick ShotFxLayer uses for sparks. */
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.11) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the pooled bullet-hole decals: fixed set of small billboarded planes,
 * posed imperatively from decalPool each frame — no per-decal mounts.
 */
export function DecalFX() {
  const planes = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_DECALS; i++) {
      const d = decalPool[i];
      const m = planes.current[i];
      if (!m) continue;
      if (d.at < 0) {
        if (m.visible) m.visible = false;
        continue;
      }
      const age = (now - d.at) / 1000;
      const op = Math.min(1, age / FADE_IN_S);
      m.position.copy(d.pos);
      _alignQ.setFromUnitVectors(_zAxis, d.normal);
      _twistQ.setFromAxisAngle(_zAxis, d.twist);
      m.quaternion.copy(_alignQ).multiply(_twistQ);
      const size = 0.22 + jitter(i) * 0.16;
      m.scale.setScalar(size);
      (m.material as THREE.MeshBasicMaterial).opacity = op;
      m.visible = true;
    }
  });

  return (
    <>
      {Array.from({ length: MAX_DECALS }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            planes.current[i] = el;
          }}
          visible={false}
          renderOrder={1}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={bulletHoleTexture()}
            transparent
            opacity={0}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}
