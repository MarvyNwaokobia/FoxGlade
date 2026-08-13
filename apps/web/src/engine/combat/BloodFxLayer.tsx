"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_BLOOD, bloodPool } from "./blood";

// Lifetimes (seconds). Back-spray is the visible half (toward the shooter) and
// throws furthest; through-spray is tighter and shorter — it's the exit side,
// less of it reads before the body's in the way. Mist hangs a beat after both
// have landed, same relationship shot debris has to its smoke puff.
const SPRAY_S = 0.42;
const MIST_S = 0.5;
const BACK_PER_HIT = 4;
const THROUGH_PER_HIT = 2;
// A kill throws harder — Valor's death pool is a bigger single event, not
// just "one more regular hit"; the extra reach here is that same beat.
const LETHAL_SPEED_MULT = 1.5;

const _dir = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _arbitrary = new THREE.Vector3(0.41, 0.87, 0.22); // never parallel to backDir

const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 15.233 + salt * 91.71) * 24634.635;
  return x - Math.floor(x);
};

let _mistTex: THREE.CanvasTexture | null = null;
function mistTexture(): THREE.CanvasTexture {
  if (_mistTex) return _mistTex;
  const s = 48;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(120,14,12,0.55)");
  g.addColorStop(0.5, "rgba(90,10,9,0.28)");
  g.addColorStop(1, "rgba(90,10,9,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _mistTex = new THREE.CanvasTexture(c);
  _mistTex.colorSpace = THREE.SRGBColorSpace;
  return _mistTex;
}

/**
 * Draws pooled blood: a back-spray toward the shooter, a tighter through-spray
 * the other way, and a fine mist that hangs a moment longer — reads the pool
 * each frame and poses a fixed set of meshes, same shape as ShotFX's debris.
 */
export function BloodFX() {
  const back = useRef<(THREE.Mesh | null)[]>([]);
  const through = useRef<(THREE.Mesh | null)[]>([]);
  const mist = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_BLOOD; i++) {
      const b = bloodPool[i];
      const age = (now - b.at) / 1000;
      const speedMult = b.lethal ? LETHAL_SPEED_MULT : 1;

      if (age >= 0 && age < SPRAY_S) {
        _dir.copy(b.backDir);
        _t1.crossVectors(_dir, _arbitrary).normalize();
        _t2.crossVectors(_dir, _t1).normalize();
        const t = age / SPRAY_S;
        const k = 1 - t;

        for (let c = 0; c < BACK_PER_HIT; c++) {
          const m = back.current[i * BACK_PER_HIT + c];
          if (!m) continue;
          const theta = jitter(i * 6 + c, 1) * 0.55; // tight cone around backDir
          const phi = jitter(i * 6 + c, 2) * Math.PI * 2;
          const speed = (2.6 + jitter(i * 6 + c, 3) * 2.2) * speedMult;
          _pos
            .copy(_dir)
            .multiplyScalar(Math.cos(theta))
            .addScaledVector(_t1, Math.cos(phi) * Math.sin(theta))
            .addScaledVector(_t2, Math.sin(phi) * Math.sin(theta));
          _pos.multiplyScalar(speed * t).add(b.pos);
          _pos.addScaledVector(_up, -5.2 * t * t + 0.4 * t); // arcs up briefly, then drops
          m.position.copy(_pos);
          const sc = 0.018 + jitter(i * 6 + c, 4) * 0.022;
          m.scale.setScalar(sc);
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.opacity = k;
          mat.color.set(jitter(i * 6 + c, 5) > 0.6 ? "#8c0f0b" : "#5a0a08");
          m.visible = true;
        }
        for (let c = 0; c < THROUGH_PER_HIT; c++) {
          const m = through.current[i * THROUGH_PER_HIT + c];
          if (!m) continue;
          const theta = jitter(i * 3 + c, 6) * 0.4;
          const phi = jitter(i * 3 + c, 7) * Math.PI * 2;
          const speed = (1.4 + jitter(i * 3 + c, 8) * 1.2) * speedMult;
          _pos
            .copy(_dir)
            .multiplyScalar(-Math.cos(theta))
            .addScaledVector(_t1, Math.cos(phi) * Math.sin(theta))
            .addScaledVector(_t2, Math.sin(phi) * Math.sin(theta));
          _pos.multiplyScalar(speed * t).add(b.pos);
          _pos.addScaledVector(_up, -5.2 * t * t);
          m.position.copy(_pos);
          const sc = 0.014 + jitter(i * 3 + c, 9) * 0.016;
          m.scale.setScalar(sc);
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.opacity = k * 0.85;
          mat.color.set("#6d0f0c");
          m.visible = true;
        }
      } else {
        for (let c = 0; c < BACK_PER_HIT; c++) {
          const m = back.current[i * BACK_PER_HIT + c];
          if (m?.visible) m.visible = false;
        }
        for (let c = 0; c < THROUGH_PER_HIT; c++) {
          const m = through.current[i * THROUGH_PER_HIT + c];
          if (m?.visible) m.visible = false;
        }
      }

      const ms = mist.current[i];
      if (ms) {
        if (age >= 0 && age < MIST_S) {
          const t = age / MIST_S;
          ms.position.copy(b.pos).addScaledVector(_up, 0.25);
          ms.quaternion.copy(camera.quaternion);
          ms.scale.setScalar((0.1 + t * 0.35) * (b.lethal ? 1.4 : 1));
          (ms.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.45;
          ms.visible = true;
        } else if (ms.visible) {
          ms.visible = false;
        }
      }
    }
  });

  return (
    <>
      {Array.from({ length: MAX_BLOOD }).map((_, i) => (
        <group key={i}>
          {Array.from({ length: BACK_PER_HIT }).map((_, c) => (
            <mesh
              key={`b${c}`}
              ref={(el) => {
                back.current[i * BACK_PER_HIT + c] = el;
              }}
              visible={false}
            >
              <sphereGeometry args={[1, 5, 4]} />
              <meshBasicMaterial color="#5a0a08" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
          {Array.from({ length: THROUGH_PER_HIT }).map((_, c) => (
            <mesh
              key={`t${c}`}
              ref={(el) => {
                through.current[i * THROUGH_PER_HIT + c] = el;
              }}
              visible={false}
            >
              <sphereGeometry args={[1, 5, 4]} />
              <meshBasicMaterial color="#6d0f0c" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
          <mesh
            ref={(el) => {
              mist.current[i] = el;
            }}
            visible={false}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={mistTexture()} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
