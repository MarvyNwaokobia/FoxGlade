"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MAX_BLOOD_STAINS, bloodStainPool, bloodStainTexture, BLOOD_STAIN_LIFE_S, BLOOD_STAIN_FADE_S } from "./bloodStains";

const FADE_IN_S = 0.15;
const _up = new THREE.Vector3(0, 1, 0);
const _twistQ = new THREE.Quaternion();
const _alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), _up);

/**
 * Draws the pooled blood-pool decals: flat billboards on the ground, popping
 * in like a bullet hole but — unlike one — fading back out near the end of
 * their life (BLOOD_STAIN_LIFE_S), same shape as DecalFX but with a tail.
 */
export function BloodStainFX() {
  const planes = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_BLOOD_STAINS; i++) {
      const d = bloodStainPool[i];
      const m = planes.current[i];
      if (!m) continue;
      if (d.at < 0) {
        if (m.visible) m.visible = false;
        continue;
      }
      const age = (now - d.at) / 1000;
      if (age > BLOOD_STAIN_LIFE_S) {
        if (m.visible) m.visible = false;
        continue;
      }
      const fadeStart = BLOOD_STAIN_LIFE_S - BLOOD_STAIN_FADE_S;
      const op =
        age < FADE_IN_S
          ? age / FADE_IN_S
          : age > fadeStart
            ? 1 - (age - fadeStart) / BLOOD_STAIN_FADE_S
            : 1;
      m.position.copy(d.pos);
      _twistQ.setFromAxisAngle(_up, d.twist);
      m.quaternion.copy(_alignQ).premultiply(_twistQ);
      m.scale.setScalar(d.scale);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, op);
      m.visible = true;
    }
  });

  return (
    <>
      {Array.from({ length: MAX_BLOOD_STAINS }).map((_, i) => (
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
            map={bloodStainTexture()}
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
