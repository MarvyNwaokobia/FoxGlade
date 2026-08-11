"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Motes } from "./motes";

/** Every mote on the floor, in one draw call. */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
/** Hoisted. Allocating this per mote per frame was ~900 Vector3 a frame, and the
 *  resulting GC churn showed up as frame spikes down into single digits. */
const _up = new THREE.Vector3(0, 1, 0);

export function MoteMesh({ motes }: { motes: Motes }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.17, 0), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        // Unlit and bright: motes have to be visible out at the edge of the
        // lantern, which is exactly where the light has already fallen off.
        color: "#8fd0e0",
        toneMapped: false,
      }),
    []
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.frustumCulled = false;
    for (let i = 0; i < motes.max; i++) {
      if (!motes.alive[i]) {
        _m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _m);
        continue;
      }
      const b = motes.bob[i];
      _p.set(motes.pos[i * 2], 0.42 + Math.sin(b) * 0.11, motes.pos[i * 2 + 1]);
      _q.setFromAxisAngle(_up, b * 0.8);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, motes.max]} />;
}
