"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAX_SHOTS, shotPool } from "./shotfx";

// Lifetimes (seconds). Tracers are brief streaks; the impact spark lingers a
// touch so a hit reads. Debris outlives the spark (it's still traveling when
// the spark's gone) and the smoke puff outlives debris (it drifts, not pops).
// All bloom (PostFX) makes the emissive bits glow.
const TRACER_S = 0.085;
const MUZZLE_S = 0.065;
const IMPACT_S = 0.16;
const DEBRIS_S = 0.32;
const SMOKE_S = 0.55;
const DEBRIS_PER_SHOT = 4;

// Scratch (module-level so the frame loop never allocates).
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _flareQ = new THREE.Quaternion();
// ConeGeometry's apex points along +Y by default, not +Z — this remaps that
// to +Z first so the same setFromUnitVectors(_zAxis, dir) alignment used for
// the tracer also works for the cone (found the hard way: without it the
// flare pointed straight up regardless of fire direction).
const _coneAxisFix = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const _axis = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _debrisDir = new THREE.Vector3();
const _debrisPos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _arbitrary = new THREE.Vector3(0.37, 0.91, 0.16); // never parallel to a shot direction

/** Deterministic 0..1 "random" off the pool slot, so each of the 16 shot slots
 *  gets a fixed but different burst shape instead of every impact looking
 *  identical (a real spark shower isn't radially symmetric). */
const jitter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A soft, warm-grey smoke puff — same lazy-CanvasTexture trick as the bullet
 * hole and the player's contact shadow (softShadow.ts): no image asset.
 */
let _smokeTex: THREE.CanvasTexture | null = null;
export function smokePuffTexture(): THREE.CanvasTexture {
  if (_smokeTex) return _smokeTex;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(150,138,120,0.55)");
  g.addColorStop(0.5, "rgba(120,108,92,0.28)");
  g.addColorStop(1, "rgba(120,108,92,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _smokeTex = new THREE.CanvasTexture(c);
  _smokeTex.colorSpace = THREE.SRGBColorSpace;
  return _smokeTex;
}

/**
 * Draws the pooled player shots: tracer + muzzle flash + impact spark. Reads the
 * shot pool each frame and poses a fixed set of meshes — no per-shot mounts.
 */
export function ShotFX() {
  const tracers = useRef<(THREE.Mesh | null)[]>([]);
  const tracerGlows = useRef<(THREE.Mesh | null)[]>([]);
  const muzzles = useRef<(THREE.Mesh | null)[]>([]);
  const muzzleHalos = useRef<(THREE.Mesh | null)[]>([]);
  const muzzleFlares = useRef<(THREE.Mesh | null)[]>([]);
  const impacts = useRef<(THREE.Mesh | null)[]>([]);
  const impactHalos = useRef<(THREE.Mesh | null)[]>([]);
  const debris = useRef<(THREE.Mesh | null)[]>([]);
  const smoke = useRef<(THREE.Mesh | null)[]>([]);
  const { camera } = useThree();

  useFrame(() => {
    const now = performance.now();
    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shotPool[i];
      const age = (now - s.at) / 1000;

      // Tracer: a thin hot core stretched from muzzle to impact, wrapped in a
      // wider, dimmer glow layer so bloom picks it up as a streak of light
      // rather than a flat coloured rod — the same core+halo trick real tracer
      // footage shows (a bright filament with a soft bloom around it).
      const tr = tracers.current[i];
      const trGlow = tracerGlows.current[i];
      if (tr) {
        if (age >= 0 && age < TRACER_S) {
          _dir.copy(s.to).sub(s.from);
          const len = _dir.length();
          if (len > 1e-4) {
            _dir.multiplyScalar(1 / len);
            _mid.copy(s.from).addScaledVector(_dir, len / 2);
            const q = tr.quaternion.setFromUnitVectors(_zAxis, _dir);
            const op = 1 - age / TRACER_S;
            tr.position.copy(_mid);
            tr.scale.set(1, 1, len);
            (tr.material as THREE.MeshBasicMaterial).opacity = op;
            tr.visible = true;
            if (trGlow) {
              trGlow.position.copy(_mid);
              trGlow.quaternion.copy(q);
              trGlow.scale.set(1, 1, len);
              (trGlow.material as THREE.MeshBasicMaterial).opacity = op * 0.4;
              trGlow.visible = true;
            }
          } else {
            tr.visible = false;
            if (trGlow) trGlow.visible = false;
          }
        } else {
          if (tr.visible) tr.visible = false;
          if (trGlow?.visible) trGlow.visible = false;
        }
      }

      // Muzzle flash: a bright core, a soft halo for bloom depth, and a flare
      // cone punched out along the barrel line — the same shape the enemy
      // rigs already use (Blocker.tsx), so the player's own gun finally reads
      // with as much presence as the ones aimed back at them.
      const mz = muzzles.current[i];
      const mzHalo = muzzleHalos.current[i];
      const mzFlare = muzzleFlares.current[i];
      if (mz) {
        if (age >= 0 && age < MUZZLE_S) {
          // Sharp pop then fast fade, not a linear fade — a real flash is
          // near-instant peak brightness that collapses, not a slow bleed.
          const t = age / MUZZLE_S;
          const k = (1 - t) * (1 - t);
          mz.position.copy(s.from);
          mz.scale.setScalar(0.09 + (1 - k) * 0.1);
          (mz.material as THREE.MeshBasicMaterial).opacity = k;
          mz.visible = true;
          if (mzHalo) {
            mzHalo.position.copy(s.from);
            mzHalo.scale.setScalar(0.16 + (1 - k) * 0.22);
            (mzHalo.material as THREE.MeshBasicMaterial).opacity = k * 0.5;
            mzHalo.visible = true;
          }
          if (mzFlare) {
            _dir.copy(s.to).sub(s.from);
            if (_dir.lengthSq() > 1e-6) {
              _dir.normalize();
              // Cone's own base sits at its local origin and points +Z, so
              // nudge it forward along the fire direction to clear the hand
              // rather than clipping back through the gun.
              mzFlare.position.copy(s.from).addScaledVector(_dir, 0.15);
              _flareQ.setFromUnitVectors(_zAxis, _dir).multiply(_coneAxisFix);
              mzFlare.quaternion.copy(_flareQ);
              mzFlare.scale.setScalar(0.7 + (1 - k) * 0.5);
              (mzFlare.material as THREE.MeshBasicMaterial).opacity = k * 0.85;
              mzFlare.visible = true;
            }
          }
        } else {
          if (mz.visible) mz.visible = false;
          if (mzHalo?.visible) mzHalo.visible = false;
          if (mzFlare?.visible) mzFlare.visible = false;
        }
      }

      // Impact spark: a hot core plus a wider halo, and a per-slot asymmetric
      // stretch (jitter) so the sixteen pooled sparks don't all bloom as the
      // identical perfect sphere — a real spark hit isn't radially even.
      const im = impacts.current[i];
      const imHalo = impactHalos.current[i];
      if (im) {
        if (age >= 0 && age < IMPACT_S) {
          const k = 1 - age / IMPACT_S;
          const jx = 0.8 + jitter(i, 1) * 0.5;
          const jy = 0.8 + jitter(i, 2) * 0.5;
          const jz = 0.8 + jitter(i, 3) * 0.5;
          const base = 0.04 + (1 - k) * 0.2;
          im.position.copy(s.to);
          im.scale.set(base * jx, base * jy, base * jz);
          const mat = im.material as THREE.MeshBasicMaterial;
          mat.opacity = k;
          mat.color.set(s.hit ? "#ff5a4a" : "#ffce7a");
          im.visible = true;
          if (imHalo) {
            const hbase = 0.06 + (1 - k) * 0.32;
            imHalo.position.copy(s.to);
            imHalo.scale.set(hbase * jx, hbase * jy, hbase * jz);
            const hmat = imHalo.material as THREE.MeshBasicMaterial;
            hmat.opacity = k * 0.4;
            hmat.color.set(s.hit ? "#ff5a4a" : "#ffce7a");
            imHalo.visible = true;
          }
        } else {
          if (im.visible) im.visible = false;
          if (imHalo?.visible) imHalo.visible = false;
        }
      }

      // Debris chips: a handful of small chips flying back off the impact in a
      // loose cone, tumbling and dropping under gravity as they go — the spark
      // is a flash, this is what makes the hit feel like it disturbed something
      // solid. Direction is a deterministic function of (slot, chip) so it's
      // stable frame to frame without storing any per-particle state.
      if (age >= 0 && age < DEBRIS_S) {
        _dir.copy(s.to).sub(s.from);
        if (_dir.lengthSq() > 1e-6) {
          _dir.normalize();
          _axis.copy(_dir).multiplyScalar(-1); // debris flies back off the surface
          _t1.crossVectors(_axis, _arbitrary).normalize();
          _t2.crossVectors(_axis, _t1).normalize();
          const t = age / DEBRIS_S;
          const k = 1 - t;
          for (let c = 0; c < DEBRIS_PER_SHOT; c++) {
            const ch = debris.current[i * DEBRIS_PER_SHOT + c];
            if (!ch) continue;
            const theta = jitter(i * 4 + c, 5) * 0.9 + 0.15; // cone half-angle, radians
            const phi = jitter(i * 4 + c, 6) * Math.PI * 2;
            _debrisDir
              .copy(_axis)
              .multiplyScalar(Math.cos(theta))
              .addScaledVector(_t1, Math.cos(phi) * Math.sin(theta))
              .addScaledVector(_t2, Math.sin(phi) * Math.sin(theta));
            const speed = 2.2 + jitter(i * 4 + c, 7) * 2.4;
            _debrisPos.copy(s.to).addScaledVector(_debrisDir, speed * t);
            _debrisPos.addScaledVector(_up, -4.2 * t * t); // gravity arc
            ch.position.copy(_debrisPos);
            const sc = 0.02 + jitter(i * 4 + c, 8) * 0.025;
            ch.scale.setScalar(sc);
            const cmat = ch.material as THREE.MeshBasicMaterial;
            cmat.opacity = k * 0.9;
            cmat.color.set(s.hit ? "#7a2e28" : "#6b5f4e");
            ch.visible = true;
          }
        }
      } else {
        for (let c = 0; c < DEBRIS_PER_SHOT; c++) {
          const ch = debris.current[i * DEBRIS_PER_SHOT + c];
          if (ch?.visible) ch.visible = false;
        }
      }

      // A soft dust/smoke puff that blooms outward from the impact and fades —
      // slower and longer-lived than the spark, so a hit still reads a beat
      // after the flash is gone.
      const sm = smoke.current[i];
      if (sm) {
        if (age >= 0 && age < SMOKE_S) {
          const t = age / SMOKE_S;
          sm.position.copy(s.to);
          sm.quaternion.copy(camera.quaternion); // billboard — always face the viewer
          sm.scale.setScalar(0.12 + t * 0.5);
          (sm.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5;
          sm.visible = true;
        } else if (sm.visible) {
          sm.visible = false;
        }
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
            <boxGeometry args={[0.026, 0.026, 1]} />
            <meshBasicMaterial
              color="#fffaf0"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              tracerGlows.current[i] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[0.09, 0.09, 1]} />
            <meshBasicMaterial
              color="#ffc169"
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
              muzzleHalos.current[i] = el;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
              color="#ffb35c"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          {/* Directional flare down the barrel line — same shape Blocker.tsx
              already uses for enemy muzzle flashes, so the player's shots
              finally carry the same visual weight as the ones fired back.
              Position is set imperatively each frame (offset along the fire
              direction), so this initial value is just where it sits hidden. */}
          <mesh
            ref={(el) => {
              muzzleFlares.current[i] = el;
            }}
            visible={false}
          >
            <coneGeometry args={[0.1, 0.4, 8]} />
            <meshBasicMaterial
              color="#ffc072"
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
          <mesh
            ref={(el) => {
              impactHalos.current[i] = el;
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
          {/* Debris chips — solid matter, not light, so plain (non-additive)
              blending: additive would make stone/wood chips glow like sparks. */}
          {Array.from({ length: DEBRIS_PER_SHOT }).map((_, c) => (
            <mesh
              key={c}
              ref={(el) => {
                debris.current[i * DEBRIS_PER_SHOT + c] = el;
              }}
              visible={false}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#6b5f4e" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
          {/* Dust puff — a soft billboard, not a glow either. */}
          <mesh
            ref={(el) => {
              smoke.current[i] = el;
            }}
            visible={false}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={smokePuffTexture()}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
