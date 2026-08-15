"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import * as THREE from "three";
import { skyAt } from "@/engine/config/day";
import { runtime } from "@/engine/runtime";

/**
 * The sky, as three real skies cross-fading into one another.
 *
 * The scene used to set ONE daytime HDRI as `scene.background` and dim it with
 * `backgroundIntensity` as the day ran out. That is not a night. A blue sky full
 * of white cumulus, turned down, is an underexposed afternoon — and it read
 * exactly that way in play: the HUD said 19:10 NIGHT, the fog went dark, the
 * lanterns came up, and overhead it was still broad daylight.
 *
 * So the background is now geometry we own: a big inverted sphere sampling three
 * equirectangular HDRIs (day → dusk → night, all CC0 from Poly Haven) and mixing
 * them by the day clock. Two mixes, three texture fetches per sky pixel — the
 * sky is a handful of pixels' worth of overdraw at the back of the frame, so the
 * cost is nothing and the control is total.
 *
 * `scene.environment` still comes from the day HDRI for image-based lighting —
 * it contributes at 0.3 and falls off with the light, so it isn't worth a
 * second PMREM pass to swap it. Built here with our OWN `PMREMGenerator` off
 * the SAME loaded `day` texture, rather than a second `<Environment files=...>`
 * pointed at the same URL: `files` does its own independent RGBELoader
 * fetch+decode+PMREM, which used to mean this one 5MB HDR paid that full cost
 * TWICE every load for no reason (Marvy's call, 2026-08-14 perf pass — see
 * foxglade's load-time audit). `drei`'s `<Environment map={tex}>` was the
 * obvious-looking shortcut here but turned out to skip PMREM entirely when
 * given a raw texture instead of `files` — sets `scene.environment` straight
 * to the unfiltered equirect, which is wrong for PBR lighting. Doing the
 * PMREM pass by hand is what keeps the lighting identical to before.
 */

const DAY = "/env/day_clouds_2k.hdr";
const DUSK = "/env/dusk_2k.hdr";
const NIGHT = "/env/dikhololo_night_2k.hdr";

/** Comfortably inside the camera's far plane (400) and outside the village. */
const RADIUS = 320;

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // Direction from the camera to this point on the dome, in world space.
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const frag = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uDusk;
  uniform sampler2D uNight;
  uniform float uDusk_;
  uniform float uNight_;
  uniform float uIntensity;
  varying vec3 vDir;

  const float PI = 3.141592653589793;

  // Equirectangular lookup for a unit direction.
  vec3 sampleSky(sampler2D tex, vec3 d) {
    vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
    return texture2D(tex, uv).rgb;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 col = sampleSky(uDay, d);
    col = mix(col, sampleSky(uDusk, d), uDusk_);
    col = mix(col, sampleSky(uNight, d), uNight_);
    gl_FragColor = vec4(col * uIntensity, 1.0);

    // Match the rest of the scene: ACES + output colour space. A raw
    // ShaderMaterial gets neither injected for it, so without these the sky
    // would be the one surface in the frame not going through the grade.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function SkyDome() {
  const [day, dusk, night] = useLoader(RGBELoader, [DAY, DUSK, NIGHT]);
  const { camera, gl, scene } = useThree();
  const grp = useRef<THREE.Group>(null);

  // A clone, taken BEFORE the shader-sampling tweaks below touch `day` (wrap/
  // filter/mipmap settings tuned for this component's own equirect lookup,
  // not for what PMREMGenerator expects of its source) — cheap (shares the
  // same underlying image data, only the texture object's own properties are
  // duplicated), and keeps the two uses from fighting over one texture's config.
  const dayEnv = useMemo(() => day.clone(), [day]);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envRT = pmrem.fromEquirectangular(dayEnv);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.3;
    return () => {
      scene.environment = null;
      envRT.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, dayEnv]);

  const material = useMemo(() => {
    // Equirect maps sampled by hand in the shader: clamp vertically so the poles
    // don't bleed, wrap horizontally so the seam behind you closes.
    for (const t of [day, dusk, night]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
    }
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uDay: { value: day },
        uDusk: { value: dusk },
        uNight: { value: night },
        uDusk_: { value: 0 },
        uNight_: { value: 0 },
        uIntensity: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false, // we run the tonemap include ourselves
    });
  }, [day, dusk, night]);

  useFrame(() => {
    const s = skyAt(runtime.dayProgress);
    material.uniforms.uDusk_.value = s.duskMix;
    material.uniforms.uNight_.value = s.nightMix;
    material.uniforms.uIntensity.value = s.skyIntensity;
    // Ride with the camera so the dome can never be walked out of or seen past.
    if (grp.current) grp.current.position.copy(camera.position);
  });

  return (
    <>
      <group ref={grp}>
        {/* renderOrder -1000 + depthTest off: drawn first, behind everything. */}
        <mesh material={material} renderOrder={-1000} frustumCulled={false}>
          <sphereGeometry args={[RADIUS, 32, 20]} />
        </mesh>
      </group>
    </>
  );
}
