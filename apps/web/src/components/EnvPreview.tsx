"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { BUILDINGS, VILLAGE, doorOpening, type Building } from "@/engine/world/village";
import { BuildingModel } from "@/engine/world/Buildings3D";

/**
 * Live environment prototype (design/environment-plan.html). Direction:
 * UNIFORM, LIGHT houses — cheap procedural geometry skinned with the real PBR
 * wall/roof textures the game ships (realistic surface, tiny cost), matte (no
 * shine). Only the BANK and MARKET are distinct landmark models. Nice daytime
 * look now; a day→night cycle comes later. Reuses the real village.ts layout.
 */
const DIALS = {
  // Daytime sky (soft blue → pale horizon)
  skyTop: "#6f9fce",
  skyHorizon: "#cdd9e2",
  fog: "#c3cdd6",
  fogNear: 45,
  fogFar: 150,
  sunColor: "#fff2dc",
  sunIntensity: 2.4,
  ambient: 0.35,
  hemiSky: "#bcd2ea",
  hemiGround: "#5a4d3c",
  hemiIntensity: 0.7,
  exposure: 1.0,
  ground: "#8a7d68",
  road: "#6f5a41",
} as const;

// Landmark buildings (distinct models). Everything else is a uniform house.
const BANK = { x: -26, z: -3 };
const MARKET = { x: -14, z: 6 };
const isAt = (b: Building, p: { x: number; z: number }) => b.x === p.x && b.z === p.z;

const ROADS: [number, number][][] = [
  [[0, 35], [0, 22], [-2, 14], [-3, 4], [-4, -5], [-2, -14], [0, -22], [3, -31]],
  [[-3, 4], [-13, 6], [-22, 5], [-26, -3]],
  [[-4, -5], [8, -3], [19, -6], [26, -13]],
  [[0, 22], [-16, 20], [-24, 14]],
];
const ROAD_W = 4.6;

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(DIALS.skyTop) }, horizon: { value: new THREE.Color(DIALS.skyHorizon) } },
        vertexShader: `varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vp;
          void main(){ float h=clamp((normalize(vp).y+0.05)/0.6,0.0,1.0); gl_FragColor=vec4(mix(horizon,top,h),1.0);} `,
      }),
    []
  );
  return (
    <mesh material={mat}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

// One uniform textured house — box walls (medieval wall PBR) + timber frame +
// thatch gable roof. Cheap geometry, shared materials.
function House({ b, wall, roof, timber, glass }: {
  b: Building;
  wall: THREE.Material;
  roof: THREE.Material;
  timber: THREE.Material;
  glass: THREE.Material;
}) {
  const roofH = Math.min(b.w, b.d) * 0.55;
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-b.w / 2 - 0.3, 0);
    s.lineTo(b.w / 2 + 0.3, 0);
    s.lineTo(0, roofH);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: b.d + 0.6, bevelEnabled: false });
    g.translate(0, 0, -(b.d + 0.6) / 2);
    return g;
  }, [b.w, b.d, roofH]);

  const corners: [number, number][] = [
    [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2], [-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2],
  ];
  const cols = Math.max(1, Math.floor(b.w / 3));
  const winY = b.h * 0.5;

  return (
    <group position={[b.x, 0, b.z]}>
      <mesh material={wall} position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
      </mesh>
      {/* timber corner posts + top plate rails (half-timber look) */}
      {corners.map(([px, pz], i) => (
        <mesh key={i} material={timber} position={[px, b.h / 2, pz]}>
          <boxGeometry args={[0.28, b.h, 0.28]} />
        </mesh>
      ))}
      <mesh material={timber} position={[0, b.h - 0.15, b.d / 2]}>
        <boxGeometry args={[b.w, 0.3, 0.34]} />
      </mesh>
      <mesh material={timber} position={[0, b.h - 0.15, -b.d / 2]}>
        <boxGeometry args={[b.w, 0.3, 0.34]} />
      </mesh>
      {/* windows on front + back */}
      {Array.from({ length: cols }).map((_, i) => {
        const wx = -b.w / 2 + (b.w / (cols + 1)) * (i + 1);
        return (
          <group key={i}>
            <mesh material={glass} position={[wx, winY, b.d / 2 + 0.03]}>
              <planeGeometry args={[0.85, 1.15]} />
            </mesh>
            <mesh material={glass} position={[wx, winY, -b.d / 2 - 0.03]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.85, 1.15]} />
            </mesh>
          </group>
        );
      })}
      {/* roof */}
      <mesh geometry={roofGeo} material={roof} position={[0, b.h, 0]} castShadow />
    </group>
  );
}

function Streets() {
  const segs: React.ReactNode[] = [];
  ROADS.forEach((line, li) => {
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, z0] = line[i];
      const [x1, z1] = line[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      segs.push(
        <mesh key={`${li}-${i}`} position={[(x0 + x1) / 2, 0.03, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, ang]}>
          <planeGeometry args={[ROAD_W, len + ROAD_W * 0.5]} />
          <meshStandardMaterial color={DIALS.road} roughness={1} metalness={0} transparent opacity={0.85} />
        </mesh>
      );
    }
    line.forEach(([x, z], i) =>
      segs.push(
        <mesh key={`${li}-j${i}`} position={[x, 0.029, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[ROAD_W / 2, 20]} />
          <meshStandardMaterial color={DIALS.road} roughness={1} metalness={0} transparent opacity={0.85} />
        </mesh>
      )
    );
  });
  return <group>{segs}</group>;
}

function Village() {
  const H = VILLAGE.half;
  // Real PBR textures, loaded once and shared across every house.
  const cobble = useTexture({
    map: "/textures/cobblestone_05_diff.jpg",
    normalMap: "/textures/cobblestone_05_nor_gl.jpg",
    roughnessMap: "/textures/cobblestone_05_rough.jpg",
  });
  const wallT = useTexture({
    map: "/textures/medieval_wall_01_diff.jpg",
    normalMap: "/textures/medieval_wall_01_nor_gl.jpg",
    roughnessMap: "/textures/medieval_wall_01_rough.jpg",
  });
  const roofT = useTexture({
    map: "/textures/thatch_roof_angled_diff.jpg",
    normalMap: "/textures/thatch_roof_angled_nor_gl.jpg",
    roughnessMap: "/textures/thatch_roof_angled_rough.jpg",
  });

  const { wallMat, roofMat, timberMat, glassMat } = useMemo(() => {
    Object.values(cobble).forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.anisotropy = 8; });
    Object.values(wallT).forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.2); });
    Object.values(roofT).forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); });
    return {
      wallMat: new THREE.MeshStandardMaterial({ ...wallT, roughness: 1, metalness: 0 }),
      roofMat: new THREE.MeshStandardMaterial({ ...roofT, roughness: 1, metalness: 0 }),
      timberMat: new THREE.MeshStandardMaterial({ color: "#4a3626", roughness: 1, metalness: 0 }),
      glassMat: new THREE.MeshStandardMaterial({ color: "#2b3440", roughness: 0.35, metalness: 0.1 }),
    };
  }, [cobble, wallT, roofT]);

  return (
    <>
      {/* cobbled ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[H * 2, H * 2]} />
        <meshStandardMaterial {...cobble} color="#8a7d68" roughness={1} metalness={0} />
      </mesh>
      <Streets />

      {BUILDINGS.filter((b) => b.h > 2).map((b, i) => {
        if (isAt(b, BANK)) return <BuildingModel key={i} b={b} model="hall" seed={i} />;
        if (isAt(b, MARKET)) return <BuildingModel key={i} b={b} model="tavern" seed={i} />;
        return <House key={i} b={b} wall={wallMat} roof={roofMat} timber={timberMat} glass={glassMat} />;
      })}

      {/* perimeter wall */}
      {([[0, -H, H * 2, 0.6], [0, H, H * 2, 0.6], [-H, 0, 0.6, H * 2], [H, 0, 0.6, H * 2]] as [number, number, number, number][]).map(
        ([x, z, w, d], i) => (
          <mesh key={i} material={wallMat} position={[x, 1.5, z]} castShadow>
            <boxGeometry args={[w, 3, d]} />
          </mesh>
        )
      )}

      {/* unlit lantern posts (they'll glow once the day→night cycle lands) */}
      {([[0, 20], [-2, 2], [0, -12], [1, -26], [-13, 6], [8, -3]] as [number, number][]).map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={timberMat} position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 2.8, 6]} />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <boxGeometry args={[0.3, 0.4, 0.3]} />
            <meshStandardMaterial color="#d8c48a" roughness={0.5} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Scene() {
  return (
    <>
      <SkyDome />
      <fog attach="fog" args={[DIALS.fog, DIALS.fogNear, DIALS.fogFar]} />
      <ambientLight intensity={DIALS.ambient} />
      <hemisphereLight color={DIALS.hemiSky} groundColor={DIALS.hemiGround} intensity={DIALS.hemiIntensity} />
      <directionalLight
        position={[40, 44, 22]}
        color={DIALS.sunColor}
        intensity={DIALS.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0004}
      />
      <Village />
      <OrbitControls makeDefault target={[0, 2, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export default function EnvPreview() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#aeb9c4" }}>
      <Canvas
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: DIALS.exposure }}
        camera={{ position: [0, 13, 46], fov: 50, near: 0.1, far: 1000 }}
      >
        <Suspense fallback={<Html center style={{ color: "#33261b", fontFamily: "system-ui" }}>building the village…</Html>}>
          <Scene />
        </Suspense>
        <EffectComposer>
          <Bloom intensity={0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur radius={0.5} />
          <Vignette darkness={0.35} offset={0.4} />
        </EffectComposer>
      </Canvas>
      <div
        style={{
          position: "absolute", top: 12, left: 14, padding: "8px 12px", borderRadius: 8,
          background: "rgba(20,16,28,0.55)", color: "#ffe9c2", font: "600 13px system-ui, sans-serif",
        }}
      >
        Village — uniform light houses · daytime · orbit to inspect
      </div>
    </div>
  );
}
