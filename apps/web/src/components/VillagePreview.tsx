"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Html, Bounds } from "@react-three/drei";
import * as THREE from "three";

/**
 * Isolated look-at-it preview of candidate whole-village models (no gameplay).
 * Orbit to inspect; switch models with the buttons. Local models are served from
 * the gitignored /preview-local (symlinks into design/), so nothing here ships.
 */
const MODELS: { label: string; url: string; note?: string }[] = [
  // REALISTIC building models (CC-BY) — the assembled-village direction
  { label: "◆ Realistic house", url: "/models/buildings/house_timber.glb", note: "CC-BY ✓ realistic" },
  { label: "◆ Realistic tavern", url: "/models/buildings/tavern.glb", note: "CC-BY ✓ realistic" },
  { label: "◆ Realistic stone hall", url: "/models/buildings/stone_hall.glb", note: "CC-BY ✓ realistic" },
  { label: "◆ Realistic stilt house", url: "/models/buildings/stilt_house.glb", note: "CC-BY ✓ has interior" },
  // Complete villages (CC-BY, but stylized/cartoonish)
  { label: "Castle Village (cartoon)", url: "/models/village/castle_village.glb", note: "stylized" },
  { label: "Mini Village (cartoon)", url: "/models/village/mini_village.glb", note: "stylized" },
];

function VillageModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const root = useMemo(() => {
    const r = scene.clone(true);
    const box = new THREE.Box3().setFromObject(r);
    const center = box.getCenter(new THREE.Vector3());
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
  const [i, setI] = useState(0);
  const model = MODELS[i];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#1a1712" }}>
      <Canvas shadows camera={{ position: [40, 30, 40], fov: 45, near: 0.1, far: 5000 }}>
        <Suspense
          fallback={
            <Html center style={{ color: "#e8eef2", fontFamily: "system-ui" }}>
              loading…
            </Html>
          }
        >
          <Environment files="/env/dusk_2k.hdr" background />
          <directionalLight position={[50, 60, 30]} intensity={2} castShadow />
          <Bounds key={model.url} fit clip observe margin={1.15}>
            <VillageModel url={model.url} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      {/* Model switcher */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {MODELS.map((m, idx) => (
          <button
            key={m.url}
            onClick={() => setI(idx)}
            style={{
              textAlign: "left",
              padding: "7px 12px",
              borderRadius: 8,
              border: idx === i ? "1px solid #ffd873" : "1px solid rgba(255,255,255,0.2)",
              background: idx === i ? "rgba(255,216,115,0.18)" : "rgba(0,0,0,0.5)",
              color: "#e8eef2",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {m.label}
            {m.note && <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 11 }}>· {m.note}</span>}
          </button>
        ))}
      </div>

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
        <b>{model.label}</b> — drag to orbit, scroll to zoom
      </div>
    </div>
  );
}

// Only preload the light default; the heavy models load on demand when clicked.
useGLTF.preload(MODELS[0].url);
