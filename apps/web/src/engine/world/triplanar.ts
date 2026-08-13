import * as THREE from "three";

/**
 * Triplanar-mapped MeshStandardMaterial.
 *
 * Walls, ramparts and roofs are box/extrude geometry, ONE shared material
 * reused across buildings from 6m to 15m (ramparts: 72m), each with a fixed
 * texture `repeat`. Box UVs span 0..1 per face regardless of that face's
 * actual size, so the same repeat makes a small wall's bricks tiny and a big
 * wall's bricks huge — the rampart used to need its own hand-tuned repeat
 * clone just to look right at 72m (see git history), and ordinary house walls
 * never got the same treatment.
 *
 * Triplanar sidesteps the mesh's UVs entirely: it samples the texture from
 * WORLD position, projected along whichever of the three axes a point's
 * surface mostly faces, blended across all three. Tile size becomes a world
 * scale instead of a UV repeat, so one material looks right on every box
 * regardless of its dimensions — no per-building clones, no per-instance
 * tuning.
 *
 * Normal maps are deliberately NOT triplanar-sampled here. True triplanar
 * normal mapping needs a per-axis tangent-space reconstruction (the
 * "whiteout blend") — real shader weight for a subtle bump-detail win on a
 * stylized village that's rarely inspected at point-blank range. Left out
 * rather than shipped half-verified; diffuse + roughness (the channels that
 * actually SHOW the stretching) get the full treatment.
 *
 * Instancing-aware: `mats.wall`/`mats.rampart` are also drawn via
 * InstancedMesh (chimneys, dormers, battlements — see HouseDressing.tsx /
 * Battlements), so the injected vertex code applies `instanceMatrix` before
 * `modelMatrix`, matching three's own `worldpos_vertex` convention.
 */
export interface TriplanarOptions {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  /** World metres per texture tile. */
  scale: number;
  /** Blend sharpness — higher snaps faster to the dominant axis. */
  sharpness?: number;
  roughness?: number;
  color?: THREE.ColorRepresentation;
}

export function makeTriplanarMaterial(opts: TriplanarOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: opts.map,
    roughnessMap: opts.roughnessMap,
    roughness: opts.roughness ?? 1,
    color: opts.color ?? 0xffffff,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.triScale = { value: 1 / opts.scale };
    shader.uniforms.triSharpness = { value: opts.sharpness ?? 4 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;`)
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
	vec3 triObjNormal = objectNormal;
	#ifdef USE_INSTANCING
		triObjNormal = mat3( instanceMatrix ) * triObjNormal;
	#endif
	vTriNormal = normalize( mat3( modelMatrix ) * triObjNormal );`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
	vec4 triWorldPos = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		triWorldPos = instanceMatrix * triWorldPos;
	#endif
	vTriPos = ( modelMatrix * triWorldPos ).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform float triScale;\nuniform float triSharpness;`
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
	vec3 triBlend = pow( abs( normalize( vTriNormal ) ), vec3( triSharpness ) );
	triBlend /= max( triBlend.x + triBlend.y + triBlend.z, 1e-5 );
	vec2 triUvX = vTriPos.zy * triScale;
	vec2 triUvY = vTriPos.xz * triScale;
	vec2 triUvZ = vTriPos.xy * triScale;`
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
	vec4 triDiffuseX = texture2D( map, triUvX );
	vec4 triDiffuseY = texture2D( map, triUvY );
	vec4 triDiffuseZ = texture2D( map, triUvZ );
	diffuseColor *= triDiffuseX * triBlend.x + triDiffuseY * triBlend.y + triDiffuseZ * triBlend.z;
#endif`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 triRoughX = texture2D( roughnessMap, triUvX );
	vec4 triRoughY = texture2D( roughnessMap, triUvY );
	vec4 triRoughZ = texture2D( roughnessMap, triUvZ );
	roughnessFactor *= ( triRoughX * triBlend.x + triRoughY * triBlend.y + triRoughZ * triBlend.z ).g;
#endif`
      );
  };

  return mat;
}
