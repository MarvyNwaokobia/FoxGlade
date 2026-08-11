"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Horde } from "./horde";

/**
 * The whole crowd, in one draw call.
 *
 * Every live walker is an instance of the same low-poly body. Walking is sold by
 * a bob and a lean written into the instance matrix, not by a skeleton — see the
 * note at the top of horde.ts for why that trade is the right one here.
 *
 * Dead slots are collapsed to zero scale rather than removed, because rewriting
 * `count` and repacking the matrix buffer every frame costs more than drawing a
 * handful of degenerate triangles the GPU throws away immediately.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
/** Hoisted for the same reason as the mote axis: this was being cloned inside
 *  the per-instance loop, once for every walker flashing from a hit. */
const _hit = new THREE.Color("#ff8a5c");

const BODY = "#98a1b5"; // light enough to read as a silhouette at the light's edge
const HIT = "#ff8a5c";

export function HordeMesh({ horde }: { horde: Horde }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  // A tapered capsule reads as a hunched figure at distance and costs almost
  // nothing. Detail here is wasted: at this density the player sees silhouettes.
  const geometry = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.34, 1.0, 4, 8);
    g.translate(0, 0.84, 0);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: BODY,
        // A floor on how dark a walker can get. Beyond the lantern they were
        // falling to pure black, and an enemy walking at you that you cannot
        // see is not tension, it is a bug.
        emissive: new THREE.Color("#2a3242"),
        // Instance colour is how the damage flash happens without a second draw.
        vertexColors: false,
      }),
    []
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(horde.p.max * 3).fill(1),
      3
    );
    mesh.frustumCulled = false; // the crowd surrounds the camera; culling it per-instance is pointless
  }, [horde]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = performance.now();
    const n = horde.p.max;

    for (let i = 0; i < n; i++) {
      if (!horde.alive[i]) {
        _m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _m);
        continue;
      }
      const x = horde.pos[i * 2];
      const z = horde.pos[i * 2 + 1];
      const ph = horde.phase[i];
      // Bob up, and roll side to side a little out of phase with it. Two cheap
      // sines are enough to read as a walk cycle in a crowd.
      const bob = Math.abs(Math.sin(ph)) * 0.09;
      const roll = Math.sin(ph * 0.5) * 0.08;

      _pos.set(x, bob, z);
      _euler.set(0.06, horde.yaw[i], roll);
      _q.setFromEuler(_euler);
      _scale.set(1, 1, 1);
      _m.compose(_pos, _q, _scale);
      mesh.setMatrixAt(i, _m);

      // Flash on hit, decaying over ~150ms.
      const since = now - horde.hitAt[i];
      if (horde.hitAt[i] > 0 && since < 150) {
        const t = 1 - since / 150;
        _color.set(BODY).lerp(_hit, t);
      } else {
        _color.set(BODY);
      }
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, horde.p.max]}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
