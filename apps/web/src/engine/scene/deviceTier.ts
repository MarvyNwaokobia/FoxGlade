import { isTouchDevice } from "@/engine/input/touch";

/**
 * A proactive quality tier, decided once at boot from what the device
 * actually reports — not just the reactive `degraded` flip in Game.tsx
 * (PerformanceMonitor.onDecline), which only fires AFTER framerate has
 * already visibly suffered, and even then only turns off bloom/shadows/props.
 * A weak Android phone was getting the exact same DPR ceiling, shadow
 * resolution, and antialiasing as a gaming desktop from frame one (2026-08-14
 * load-time/perf audit). This runs first; `degraded` still applies on TOP of
 * whatever tier this picks, as the emergency brake for whatever this
 * heuristic gets wrong.
 *
 * Signals, weakest to strongest:
 *  - touch (desktop is never downgraded by this alone — a touch laptop with a
 *    real GPU shouldn't get the phone treatment)
 *  - `navigator.deviceMemory` (Chrome/Android only; undefined elsewhere,
 *    including all of iOS — never penalise "unknown")
 *  - `navigator.hardwareConcurrency` (logical cores — a weak signal alone,
 *    many budget phones still report 8, but corroborates the others)
 *  - the WebGL renderer string, via WEBGL_debug_renderer_info — the most
 *    reliable signal, but privacy-hardened browsers increasingly return a
 *    generic/software string ("SwiftShader", "Apple GPU" with no model on
 *    iOS Safari); those are treated as unknown, not weak.
 *
 * Deliberately conservative: this only calls a device "low" when at least
 * two independent signals agree, and falls back to "medium" whenever the
 * evidence is ambiguous. Wrongly calling a capable device "low" costs
 * fidelity for no reason; wrongly calling a weak one "medium" just means
 * `degraded` catches it a few seconds later, same as today.
 */
export type QualityTier = "high" | "medium" | "low";

const WEAK_GPU_PATTERNS = [
  /mali-4\d\d/i,
  /mali-t7\d\d/i,
  /mali-t6\d\d/i,
  /adreno \(tm\) [23]\d\d/i,
  /adreno \(tm\) 4\d\d/i,
  /adreno \(tm\) 5[01]\d/i, // 5xx below ~530 — the low tier of that generation
  /powervr sgx/i,
  /powervr rogue/i,
  /mediatek/i, // budget-tier MediaTek SoCs skew heavily toward weak GPUs
];

const STRONG_GPU_PATTERNS = [
  /apple gpu/i, // Apple Silicon / A-series — no weak tier worth special-casing
  /adreno \(tm\) [67]\d\d/i,
  /mali-g7\d/i,
  /mali-g8\d/i,
  /mali-g9\d/i,
  /nvidia|geforce|quadro/i,
  /radeon|amd/i,
  /intel.*iris/i,
];

export interface TierSignals {
  touch: boolean;
  /** GB, coarse-bucketed by the browser. undefined on iOS/Firefox/older Chrome. */
  deviceMemory: number | undefined;
  /** Logical CPU cores. */
  hardwareConcurrency: number | undefined;
  /** Raw WEBGL_debug_renderer_info string, or null if unavailable/blocked. */
  gpuRenderer: string | null;
}

/**
 * Pure classifier — no DOM/browser access, so it's unit-testable without a
 * jsdom/browser environment (this repo's test config runs plain node — see
 * vitest.config.ts's own header comment on why). `detectDeviceTier()` below
 * is the thin browser-facing wrapper that gathers `TierSignals` and calls this.
 */
export function classifyTier(signals: TierSignals): QualityTier {
  const { touch, deviceMemory: mem, hardwareConcurrency: cores, gpuRenderer: renderer } = signals;

  let weakSignals = 0;
  let strongSignals = 0;

  if (renderer && WEAK_GPU_PATTERNS.some((p) => p.test(renderer))) weakSignals += 2; // most reliable — worth two
  if (renderer && STRONG_GPU_PATTERNS.some((p) => p.test(renderer))) strongSignals += 2;
  if (typeof mem === "number" && mem <= 2) weakSignals += 1;
  if (typeof mem === "number" && mem >= 6) strongSignals += 1;
  if (typeof cores === "number" && cores <= 4) weakSignals += 1;

  // Non-touch (desktop/laptop) is never classified low from these signals
  // alone — a real GPU behind a mouse-and-keyboard session gets the benefit
  // of the doubt even if deviceMemory/cores happen to read low in a VM/CI
  // environment.
  if (!touch) return strongSignals > 0 || weakSignals === 0 ? "high" : "medium";

  if (weakSignals >= 2) return "low";
  if (strongSignals >= 2) return "high";
  return "medium";
}

function gpuRenderer(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ||
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" ? renderer : null;
  } catch {
    return null;
  }
}

/** Client-only — reads real browser/GPU signals. Call once, not per frame. */
export function detectDeviceTier(): QualityTier {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "high";
  return classifyTier({
    touch: isTouchDevice(),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    gpuRenderer: gpuRenderer(),
  });
}

/** `?quality=low|medium|high` forces the tier — for testing on one device
 *  without needing a second physical phone, and as a support escape hatch. */
export function qualityOverride(): QualityTier | null {
  if (typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("quality");
  return v === "low" || v === "medium" || v === "high" ? v : null;
}
