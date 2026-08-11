"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skyAt } from "@/engine/config/day";
import { runtime } from "@/engine/runtime";

/**
 * The sky, driven by the run's day clock.
 *
 * The scene used to be lit by three hardcoded lights at a fixed midday — which
 * is why every screenshot looked like the same moment, and why the eight street
 * lanterns were pure decoration. Now the sun swings from a low dawn through
 * overhead to a red dusk and out, the fog closes in as the light goes, and the
 * lanterns take over. That arc IS the round timer (see config/day.ts), so the
 * lighting isn't atmosphere bolted on — it's the thing you're racing.
 *
 * Everything is imperative (refs + useFrame) rather than React state: this
 * updates every frame and must never re-render the scene graph.
 */
export function Daylight({ shadows, shadowSize }: { shadows: boolean; shadowSize: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const sunTarget = useRef<THREE.Object3D>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();
  const sunColor = useRef(new THREE.Color("#fff4e0"));
  const fogColor = useRef(new THREE.Color("#c3ccd6"));

  // `target={sunTarget.current}` in the JSX below can't work: refs are still
  // null on the render that mounts the light, and this component never
  // re-renders on its own to pick the ref up later (everything after mount
  // is driven imperatively through useFrame). Without this, the light quietly
  // keeps THREE's default target — a point fixed at world origin — while its
  // position swings around wherever the player actually is, so the sun's real
  // direction drifts by however far the player has walked from (0,0). Wiring
  // it explicitly here, once both refs exist, is what makes the tracking in
  // useFrame below actually reach the light.
  useEffect(() => {
    if (sun.current && sunTarget.current) sun.current.target = sunTarget.current;
  }, []);

  useFrame(() => {
    const s = skyAt(runtime.dayProgress);

    if (sun.current) {
      // The shadow camera FOLLOWS the player. It used to be a fixed ±40m box
      // covering the whole village, which meant every building in the map was
      // re-drawn into the shadow map every single frame — a second full pass over
      // ~480k triangles for geometry nowhere near the camera. A trace showed the
      // renderer waiting ~28ms on the GPU every frame (which IS the ~35fps), so
      // halving the shadow workload is the single biggest lever available without
      // touching the art. Following the player also buys sharper shadows: the same
      // 1024 map now covers 56m instead of 80m.
      if (sunTarget.current) {
        sunTarget.current.position.set(runtime.playerPos.x, 0, runtime.playerPos.z);
        sunTarget.current.updateMatrixWorld();
      }
      // Swing the sun across the sky, anchored to the player so the shadow box
      // travels with them. Distance is fixed — only angle and height matter.
      const R = 46;
      sun.current.position.set(
        runtime.playerPos.x + Math.sin(s.sunAzimuth) * R,
        Math.max(2, s.sunHeight * 34),
        runtime.playerPos.z + Math.cos(s.sunAzimuth) * R * 0.4
      );
      sunColor.current.set(s.sunColor);
      sun.current.color.copy(sunColor.current);
      sun.current.intensity = s.sunIntensity;
    }
    if (ambient.current) ambient.current.intensity = s.ambient;
    if (hemi.current) hemi.current.intensity = s.hemi;

    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fogColor.current.set(s.fog);
      fog.color.copy(fogColor.current);
      fog.near = s.fogNear;
      fog.far = s.fogFar;
    }
    // The visible sky is <SkyDome> now (it cross-fades day → dusk → night), so
    // there's no `background` left to dim. What still has to fall away is the
    // image-based fill: at midnight the world must not keep picking up bounce
    // light off a noon sky.
    scene.environmentIntensity = 0.3 * (1 - s.nightMix * 0.85);
  });

  return (
    <>
      <fog attach="fog" args={["#c3ccd6", 55, 175]} />
      <ambientLight ref={ambient} intensity={0.45} />
      <hemisphereLight ref={hemi} color="#cfe0f2" groundColor="#6a5b48" intensity={1.0} />
      <directionalLight
        ref={sun}
        position={[38, 26, 14]}
        color="#fff4e0"
        intensity={2.4}
        castShadow={shadows}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
      />
      {/* The light aims at this, and it rides with the player (see above). */}
      <object3D ref={sunTarget} />
    </>
  );
}
