"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Html, Bounds } from "@react-three/drei";
import * as THREE from "three";

/**
 * Isolated look-at-it preview of a candidate whole-village model (no gameplay).
 * Orbit to inspect it; lit by the same dusk HDRI the game uses.
 */
function VillageModel() {
  const { scene } = useGLTF("/models/village/castle_village.glb");
  const root = useMemo(() => {
    const r = scene.clone(true);
    const box = new THREE.Box3().setFromObject(r);
    const center = box.getCenter(new THREE.Vector3());
    // Recentre on origin and drop onto the ground plane.
    r.position.set(-center.x, -box.min.y, -center.z);
    r.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return r;
  }, [scene]);

  return <primitive object={root} />;
}

export default function VillagePreview() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#1a1712" }}>
      <Canvas shadows camera={{ position: [40, 30, 40], fov: 45, near: 0.1, far: 2000 }}>
        <Suspense
          fallback={
            <Html center style={{ color: "#e8eef2", fontFamily: "system-ui" }}>
              loading village…
            </Html>
          }
        >
          <Environment files="/env/dusk_2k.hdr" background />
          <directionalLight position={[50, 60, 30]} intensity={2} castShadow />
          <Bounds fit clip observe margin={1.15}>
            <VillageModel />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          color: "rgba(232,238,242,0.85)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          background: "rgba(0,0,0,0.45)",
          padding: "8px 12px",
          borderRadius: 8,
          pointerEvents: "none",
        }}
      >
        <b>Castle Village</b> preview — drag to orbit, scroll to zoom · &ldquo;Castle village scene&rdquo; (CC-BY) via Sketchfab
      </div>
    </div>
  );
}

useGLTF.preload("/models/village/castle_village.glb");
