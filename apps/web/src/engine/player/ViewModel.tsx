"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FIRST_PERSON } from "@/engine/config/feel";
import { gameMode } from "@/engine/config/mode";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { makeGunMesh, muzzleWorldPos } from "@/engine/character/GunMesh";
import { BOXES3D } from "@/engine/world/village";
import { raycastBoxes } from "@/engine/world/collision";

/**
 * @module player/ViewModel
 * @description The first-person weapon viewmodel — the gun in the corner of the
 * screen. First person without one is a floating lens, which is exactly why the
 * old V toggle was cut from Foxglade (it put the camera at the eyes with no arms,
 * no hands and no weapon). This is the body you have left, so nearly all of the
 * game's felt weight is carried here: bob, sway, recoil, reload, wall contact.
 *
 * The holder is parented to the CAMERA, so it inherits the lens transform for
 * free and never has to chase it a frame late. That does mean the camera has to
 * be in the scene graph for its children to render — R3F does not guarantee it,
 * so we add it explicitly on mount.
 *
 * Everything below is in camera space: +X right, +Y up, **-Z forward**. The gun
 * models point their barrel down +Z (see aimGunWorldMatrix), so the mesh gets a
 * half turn to face away from the viewer.
 */
export function ViewModel() {
  const { camera, scene } = useThree();
  const equipped = useGame((s) => s.equippedWeapon);

  const holder = useMemo(() => {
    const g = new THREE.Group();
    g.name = "viewmodel";
    return g;
  }, []);

  // Live gun mesh, swapped when a new weapon is bought.
  const gunRef = useRef<THREE.Group | null>(null);

  // Animation state, all kept out of React.
  const sway = useRef(new THREE.Vector2()); // eased look-lag (x, y) in metres
  const prevYaw = useRef(0);
  const prevPitch = useRef(0);
  const recoil = useRef(0); // 0..1, decays
  const reloadT = useRef(0); // eased 0..1 while reloading
  const wallT = useRef(0); // eased 0..1 contact with geometry ahead
  const bobPhase = useRef(0);
  const bobAmt = useRef(0);
  const lastFireAt = useRef(-1);

  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      probe: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      euler: new THREE.Euler(0, 0, 0, "YXZ"),
    }),
    []
  );

  // Parent the holder to the lens. Adding the camera to the scene is idempotent
  // in three (it just reparents) and is what makes camera children render at all —
  // R3F does not guarantee the default camera is in the graph.
  useEffect(() => {
    if (!gameMode().firstPerson) return;
    scene.add(camera);
    camera.add(holder);
    return () => {
      camera.remove(holder);
    };
  }, [camera, scene, holder]);

  // Build (and rebuild) the weapon model for whatever is equipped. Skipped in
  // third person, where the weapon is socketed into the character's hands and a
  // second copy on the lens would be pure waste. (Mode is fixed for the life of a
  // canvas — routing between the two games remounts it — so this needs no dep.)
  useEffect(() => {
    if (!gameMode().firstPerson) return;
    const gun = makeGunMesh(equipped);
    gun.rotation.y = Math.PI; // barrel (+Z) → camera forward (-Z)
    gun.scale.setScalar(FIRST_PERSON.gunScale);
    // The viewmodel sits centimetres from the lens and must never be occlusion-
    // tested against the world it's drawn over.
    gun.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = false;
        (o as THREE.Mesh).receiveShadow = false;
        o.renderOrder = 10;
      }
    });
    holder.add(gun);
    gunRef.current = gun;
    return () => {
      holder.remove(gun);
      gun.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      gunRef.current = null;
    };
  }, [equipped, holder]);

  useFrame((_, rawDt) => {
    const gun = gunRef.current;
    const mode = gameMode();
    if (!gun) return;
    // Foxglade renders the weapon in the character's hands, not on the lens.
    if (!mode.firstPerson) {
      holder.visible = false;
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    const g = useGame.getState();
    holder.visible = !g.isDead;
    if (!holder.visible) return;

    const ads = runtime.adsBlend;

    // ── Sway: the gun trails the look, then catches up ──
    // Driven by the frame's look DELTA rather than by velocity, so it responds to
    // a flick the moment it happens instead of a smoothed frame later.
    scratch.euler.setFromQuaternion(camera.quaternion);
    let dYaw = scratch.euler.y - prevYaw.current;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dPitch = scratch.euler.x - prevPitch.current;
    prevYaw.current = scratch.euler.y;
    prevPitch.current = scratch.euler.x;

    const swayDamp = 1 - ads * FIRST_PERSON.swayAdsDamp;
    const targetSwayX = THREE.MathUtils.clamp(
      dYaw * FIRST_PERSON.swayYaw * swayDamp,
      -FIRST_PERSON.swayMax,
      FIRST_PERSON.swayMax
    );
    const targetSwayY = THREE.MathUtils.clamp(
      -dPitch * FIRST_PERSON.swayPitch * swayDamp,
      -FIRST_PERSON.swayMax,
      FIRST_PERSON.swayMax
    );
    const swayK = Math.min(1, FIRST_PERSON.swayLerp * dt);
    sway.current.x += (targetSwayX - sway.current.x) * swayK;
    sway.current.y += (targetSwayY - sway.current.y) * swayK;

    // ── Bob ── same shape as the camera's, at smaller amplitude, so the gun
    // visibly lags the head instead of being welded to it.
    const bobTarget = runtime.playerMoving && runtime.grounded ? (runtime.running ? 1 : 0.55) : 0;
    bobAmt.current += (bobTarget - bobAmt.current) * Math.min(1, FIRST_PERSON.bobLerp * dt);
    const hz = THREE.MathUtils.lerp(FIRST_PERSON.bobHz, FIRST_PERSON.bobRunHz, bobAmt.current);
    bobPhase.current += dt * hz * Math.PI * 2;
    const bobK = bobAmt.current * (1 - ads * FIRST_PERSON.adsBobDamp);
    const bobX = Math.sin(bobPhase.current) * FIRST_PERSON.gunBobX * bobK;
    const bobY = Math.sin(bobPhase.current * 2) * FIRST_PERSON.gunBobY * bobK;

    // ── Recoil ── one impulse per shot (edge-detected off the runtime timestamp
    // the fire path already publishes), decaying back to rest.
    if (runtime.fireAt !== lastFireAt.current) {
      lastFireAt.current = runtime.fireAt;
      recoil.current = 1;
    }
    recoil.current -= recoil.current * Math.min(1, FIRST_PERSON.recoilRecover * dt);

    // ── Reload ── the gun drops out of the sightline while you work.
    const reloading = g.reloadEndsAt > 0;
    reloadT.current += ((reloading ? 1 : 0) - reloadT.current) * Math.min(1, FIRST_PERSON.reloadLerp * dt);

    // ── Wall contact ── probe straight ahead from the eye; the closer the
    // geometry, the further the barrel tucks up, so it stops short of the wall
    // instead of punching through it.
    camera.getWorldPosition(scratch.pos);
    camera.getWorldDirection(scratch.fwd);
    scratch.probe.copy(scratch.pos).addScaledVector(scratch.fwd, FIRST_PERSON.wallProbe);
    const hit = raycastBoxes(scratch.pos, scratch.probe, BOXES3D);
    wallT.current += ((hit < 1 ? 1 - hit : 0) - wallT.current) * Math.min(1, FIRST_PERSON.wallLerp * dt);

    // ── Compose ──
    const hip = FIRST_PERSON.gunHip;
    const aim = FIRST_PERSON.gunAds;
    const k = Math.min(1, FIRST_PERSON.gunLerp * dt);
    const tx = THREE.MathUtils.lerp(hip[0], aim[0], ads) + sway.current.x + bobX;
    const ty =
      THREE.MathUtils.lerp(hip[1], aim[1], ads) +
      sway.current.y +
      bobY +
      recoil.current * FIRST_PERSON.recoilRise -
      reloadT.current * FIRST_PERSON.reloadDrop;
    const tz =
      THREE.MathUtils.lerp(hip[2], aim[2], ads) + recoil.current * FIRST_PERSON.recoilBack;

    gun.position.x += (tx - gun.position.x) * k;
    gun.position.y += (ty - gun.position.y) * k;
    gun.position.z += (tz - gun.position.z) * k;

    // Rotation. The resting yaw/pitch angle the weapon across the view and both
    // ease to zero down the sights — that straightening is most of what sells ADS
    // as lining up rather than as a zoom. On top: recoil climbs the muzzle, reload
    // rolls it toward the viewer, wall contact lifts it clear of the geometry.
    // Yaw keeps the half turn (π) that points the barrel downrange.
    const rx =
      THREE.MathUtils.lerp(FIRST_PERSON.gunPitch, 0, ads) -
      recoil.current * FIRST_PERSON.recoilPitch +
      wallT.current * FIRST_PERSON.wallPitch;
    const ry = Math.PI + THREE.MathUtils.lerp(FIRST_PERSON.gunYaw, 0, ads);
    const rz = reloadT.current * FIRST_PERSON.reloadRoll;
    gun.rotation.x += (rx - gun.rotation.x) * k;
    gun.rotation.y += (ry - gun.rotation.y) * k;
    gun.rotation.z += (rz - gun.rotation.z) * k;

    // Publish the real barrel tip so tracers and muzzle flash leave the gun you can
    // see. PlayerRig writes this too, from the (hidden) third-person weapon — this
    // runs after it, because ViewModel mounts as a later sibling of PlayerController.
    gun.updateWorldMatrix(true, false);
    muzzleWorldPos(runtime.muzzlePos, gun, gun.matrixWorld);
  });

  return null;
}
