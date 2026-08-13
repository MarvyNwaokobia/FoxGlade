"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_DUST, dustPool } from "./dust";
import { smokePuffTexture } from "./ShotFxLayer";

// Slower and lower than an impact puff — a footstep kicks up a little ground
// haze that drifts and settles, not a burst.
const DUST_S = 0.7;

/**
 * Draws pooled footstep dust: a soft billboard per slot, blooming outward and
 * fading — same read as the impact smoke puff (reuses its texture), lower to
 * the ground and slower, since a footstep disturbs dirt, not an explosion.
 */
export function DustFX() {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_DUST; i++) {
      const d = dustPool[i];
      const m = puffs.current[i];
      if (!m) continue;
      const age = (now - d.at) / 1000;
      if (age >= 0 && age < DUST_S) {
        const t = age / DUST_S;
        m.position.copy(d.pos);
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar(d.scale * (0.6 + t * 0.9));
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.35;
        m.visible = true;
      } else if (m.visible) {
        m.visible = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_DUST }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el;
          }}
          visible={false}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={smokePuffTexture()} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
