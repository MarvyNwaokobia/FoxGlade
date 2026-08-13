"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FIRST_PERSON } from "@/engine/config/feel";
import { gameMode } from "@/engine/config/mode";
import { runtime } from "@/engine/runtime";
import { useGame } from "@/engine/store";
import { muzzleWorldPos } from "@/engine/character/GunMesh";
import { buildGunModel, useGunModelScene } from "@/engine/character/gunModels";
import { makeViewArms } from "@/engine/character/ViewArms";
import { BOXES3D } from "@/engine/world/village";
import { raycastBoxes } from "@/engine/world/collision";

/**
 * @module player/ViewModel
 * @description The first-person weapon viewmodel.
 *
 * PORTED FROM VALOR's ValorScene viewmodel block. The structure is Valor's:
 *
 *  - The group is NOT parented to the camera. It is positioned with
 *    `camera.localToWorld(local)` every frame, which sidesteps the question of
 *    whether the camera is in the scene graph at all (R3F does not guarantee it).
 *  - Hip and ADS poses share a DEPTH; ADS only lifts the weapon and eases it
 *    toward centre. The aim "zoom" is the FOV narrowing, nothing else.
 *  - Wall contact RETRACTS the weapon toward the eye by scaling its depth,
 *    rather than rotating the barrel up out of the way.
 *  - Bob is a figure-eight: x on the sine, y on |cos|, so it bounces on every
 *    footfall instead of dipping once per stride.
 *
 * The camera's own bodycam drift — the thing that actually makes first person
 * feel handheld — lives in PlayerController, because it belongs to the lens.
 *
 * Ordering: this must run AFTER PlayerController, which moves the camera and
 * publishes the drift. It does, because ViewModel mounts as a later sibling in
 * Game.tsx and R3F subscribes useFrame in mount order at equal priority.
 */
export function ViewModel() {
  const { camera, scene } = useThree();
  const equipped = useGame((s) => s.equippedWeapon);
  // The real weapon mesh (ported from Valor) — preloaded per URL, so this is
  // an instant cache hit after first load, not a re-suspend on weapon swap.
  const gltfScene = useGunModelScene(equipped);

  const holder = useMemo(() => {
    const g = new THREE.Group();
    g.name = "viewmodel";
    return g;
  }, []);

  const gunRef = useRef<THREE.Group | null>(null);

  // Animation state, all kept out of React.
  const bobPhase = useRef(0);
  const recoil = useRef(0); // radians of view kick; drives the viewmodel punch too
  const reloadT = useRef(0);
  const sprintT = useRef(0);
  const raise = useRef(1); // weapon dips in from below on spawn / weapon swap
  const land = useRef(0);
  const wasGrounded = useRef(true);
  const lastFireAt = useRef(-1);
  // Hip / ADS poses, derived from the equipped weapon's real size (see the build
  // effect) rather than hard-coded, so a pistol and a DMR both frame correctly.
  const hipPose = useRef(new THREE.Vector3());
  const adsPose = useRef(new THREE.Vector3());

  const tmp = useMemo(
    () => ({ local: new THREE.Vector3(), fwd: new THREE.Vector3(), probe: new THREE.Vector3() }),
    []
  );

  // Mount the holder in the SCENE (not on the camera) — see the module note.
  useEffect(() => {
    if (!gameMode().firstPerson) return;
    scene.add(holder);
    return () => {
      scene.remove(holder);
    };
  }, [scene, holder]);

  // Valor's lens: near 0.01 and a 55° base FOV. The near plane is what lets a
  // full-size weapon sit half a metre away without being sliced, and it is the
  // single number an earlier pass here was missing.
  useEffect(() => {
    if (!gameMode().firstPerson) return;
    const cam = camera as THREE.PerspectiveCamera;
    const prevNear = cam.near;
    cam.near = FIRST_PERSON.near;
    cam.updateProjectionMatrix();
    return () => {
      cam.near = prevNear;
      cam.updateProjectionMatrix();
    };
  }, [camera]);

  // Build (and rebuild) the weapon for whatever is equipped.
  useEffect(() => {
    if (!gameMode().firstPerson) return;
    const gun = buildGunModel(gltfScene, equipped);
    gun.rotation.y = Math.PI; // barrel (+Z) → camera forward (-Z)
    gun.scale.setScalar(FIRST_PERSON.gunScale);

    // NORMALISE THE ORIGIN TO THE WEAPON'S CENTRE.
    //
    // Valor's HIP/ADS offsets assume a gun model centred on its own origin (its
    // rifle is ~0.88m long with the rear ~0.44m behind the origin), because its
    // models are normalised that way. FoxGlade's guns are built with the origin
    // AT THE GRIP, with the receiver above it and the barrel forward. Feed Valor's
    // numbers to a grip-origin model and the body swings up and across the view —
    // which is exactly what ADS did before this. Re-centring makes the ported
    // constants mean the same thing they mean in Valor.
    //
    // Computed while the gun is still parentless, so its world matrix IS its local
    // one and the resulting centre is in holder space.
    gun.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gun);
    const centre = box.getCenter(new THREE.Vector3());
    gun.position.sub(centre);

    // Derive the hip/ADS poses from the weapon's actual length: push it out until
    // its BUTT clears the lens, then scale Valor's lateral offsets by the same
    // factor so the on-screen framing is Valor's no matter how long the gun is.
    const halfLen = box.getSize(new THREE.Vector3()).z / 2;
    const depth = FIRST_PERSON.rearClearance + halfLen;
    const k = depth / FIRST_PERSON.refDepth;
    hipPose.current.set(FIRST_PERSON.gunHip[0] * k, FIRST_PERSON.gunHip[1] * k, -depth);
    adsPose.current.set(FIRST_PERSON.gunAds[0] * k, FIRST_PERSON.gunAds[1] * k, -depth);

    // Hands are parented to the WEAPON so they stay welded to it through recoil,
    // bob and wall pullback without a line of per-frame code. Added AFTER the
    // centring so they don't drag the weapon's centre off toward the shoulder.
    gun.add(makeViewArms());
    gun.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 10;
    });
    holder.add(gun);
    gunRef.current = gun;
    raise.current = 1; // the new weapon dips in from below
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
  }, [equipped, gltfScene, holder]);

  useFrame((_, rawDt) => {
    const gun = gunRef.current;
    if (!gun || !gameMode().firstPerson) return;
    const dt = Math.min(rawDt, 0.05);
    const g = useGame.getState();
    holder.visible = !g.isDead;
    if (!holder.visible) return;

    const cam = camera as THREE.PerspectiveCamera;
    const ads = runtime.adsBlend;
    const moving = runtime.playerMoving && runtime.grounded;

    // ── Recoil ── edge-detected off the timestamp the fire path already
    // publishes, then recovered at Valor's rate. One value feeds both the
    // viewmodel punch and its tilt, so they cannot disagree.
    if (runtime.fireAt !== lastFireAt.current) {
      lastFireAt.current = runtime.fireAt;
      recoil.current += FIRST_PERSON.recoilKick * (1 - FIRST_PERSON.recoilAdsDamp * ads);
    }
    recoil.current += (0 - recoil.current) * Math.min(1, dt * FIRST_PERSON.recoilRecover);

    // ── Bob ── figure-eight, |cos| on Y so it bounces every footfall.
    if (moving) {
      bobPhase.current += dt * (ads > 0.5 ? FIRST_PERSON.bobAdsRate : FIRST_PERSON.bobRate);
    }

    // ── Sprint ── into the pose slowly (effort), out of it fast (you may be
    // about to shoot). Suppressed while aiming so ADS always wins.
    const sprinting = runtime.running && moving && ads < 0.05;
    sprintT.current +=
      ((sprinting ? 1 : 0) - sprintT.current) *
      Math.min(1, (sprinting ? FIRST_PERSON.sprintLerp : FIRST_PERSON.sprintOutLerp) * dt);
    const sp = sprintT.current;

    // ── Reload / raise / landing ──
    reloadT.current +=
      ((g.reloadEndsAt > 0 ? 1 : 0) - reloadT.current) * Math.min(1, FIRST_PERSON.reloadLerp * dt);
    raise.current = Math.max(0, raise.current - dt * FIRST_PERSON.raiseRate);
    if (runtime.grounded && !wasGrounded.current) land.current = 1;
    wasGrounded.current = runtime.grounded;
    land.current -= land.current * Math.min(1, FIRST_PERSON.landRecover * dt);

    // ── Compose the pose, in camera space ──
    const local = tmp.local.copy(hipPose.current).lerp(adsPose.current, ads);

    if (moving) {
      local.x += Math.sin(bobPhase.current) * FIRST_PERSON.bobAmp;
      local.y += Math.abs(Math.cos(bobPhase.current)) * FIRST_PERSON.bobAmp;
    }
    local.y -= raise.current * FIRST_PERSON.raiseDrop;
    local.y -= reloadT.current * FIRST_PERSON.reloadDrop;
    local.y -= land.current * FIRST_PERSON.landDrop;
    local.y -= sp * FIRST_PERSON.sprintDrop;
    local.x -= sp * FIRST_PERSON.sprintIn;
    local.z += recoil.current * FIRST_PERSON.recoilBack; // punch back toward the eye

    // ── Wall pullback ── retract toward the eye as geometry closes, scaling
    // DEPTH rather than rotating the barrel: scaling keeps the weapon framed,
    // rotating swings the whole thing across the view.
    cam.getWorldDirection(tmp.fwd);
    tmp.probe.copy(cam.position).addScaledVector(tmp.fwd, FIRST_PERSON.wallClear);
    const hit = raycastBoxes(cam.position, tmp.probe, BOXES3D);
    if (hit < 1) {
      const k = Math.max(FIRST_PERSON.wallMinScale, hit);
      local.z *= k;
      local.y -= (1 - k) * FIRST_PERSON.wallDip;
    }

    holder.position.copy(cam.localToWorld(local));
    holder.quaternion.copy(cam.quaternion);
    holder.rotateX(-recoil.current * FIRST_PERSON.recoilTilt);
    holder.rotateZ(reloadT.current * FIRST_PERSON.reloadRoll + sp * FIRST_PERSON.sprintRoll);
    holder.rotateY(sp * FIRST_PERSON.sprintYaw);
    holder.rotateX(sp * FIRST_PERSON.sprintPitch + land.current * FIRST_PERSON.landPitch);
    holder.updateMatrixWorld();

    // Publish the real barrel tip so tracers and flash leave the weapon you can
    // see, not the hidden third-person rig's hands.
    muzzleWorldPos(runtime.muzzlePos, gun, gun.matrixWorld);
  });

  return null;
}
