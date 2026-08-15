import { useGLTF } from "@react-three/drei";

/**
 * Self-hosted Draco decoder (2026-08-14) — drei's `useGLTF` otherwise defaults
 * to fetching the decoder WASM from Google's CDN (gstatic.com) on first load
 * of any Draco-compressed model, an extra uncontrolled, uncached-until-warm
 * cross-origin dependency in the critical path. `public/draco/` is a copy of
 * `three/examples/jsm/libs/draco/gltf/` (checked in, ~740KB, effectively free
 * after the browser's first fetch).
 *
 * Side-effect only — import this once, before any `useGLTF()`/`useGLTF.preload()`
 * call, so every model (now Draco-compressed, see the optimize:models script)
 * resolves the decoder locally. Game.tsx imports it first for exactly that
 * ordering reason.
 */
useGLTF.setDecoderPath("/draco/");
