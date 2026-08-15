import { describe, expect, it } from "vitest";
import { classifyTier, type TierSignals } from "../deviceTier";

const base: TierSignals = {
  touch: false,
  deviceMemory: undefined,
  hardwareConcurrency: undefined,
  gpuRenderer: null,
};

describe("classifyTier", () => {
  it("defaults desktop (non-touch) to high with no signals at all", () => {
    expect(classifyTier(base)).toBe("high");
  });

  it("never drops a non-touch device below medium, even with weak-looking signals", () => {
    expect(classifyTier({ ...base, deviceMemory: 1, hardwareConcurrency: 2 })).toBe("medium");
  });

  it("a touch device with no signals is medium, not penalised for being unknown", () => {
    expect(classifyTier({ ...base, touch: true })).toBe("medium");
  });

  it("a touch device with a known weak GPU string is low", () => {
    expect(
      classifyTier({ ...base, touch: true, gpuRenderer: "ANGLE (Qualcomm, Adreno (TM) 405, OpenGL ES 3.0)" })
    ).toBe("low");
  });

  it("a touch device with a known strong GPU string is high", () => {
    expect(classifyTier({ ...base, touch: true, gpuRenderer: "Apple GPU" })).toBe("high");
  });

  it("a touch device with low memory AND low cores (two weak signals) is low", () => {
    expect(classifyTier({ ...base, touch: true, deviceMemory: 2, hardwareConcurrency: 4 })).toBe("low");
  });

  it("a touch device with only ONE weak signal stays medium — conservative on ambiguous evidence", () => {
    expect(classifyTier({ ...base, touch: true, deviceMemory: 2 })).toBe("medium");
    expect(classifyTier({ ...base, touch: true, hardwareConcurrency: 4 })).toBe("medium");
  });

  it("a touch device with only high memory (one signal) stays medium, same conservative rule", () => {
    expect(classifyTier({ ...base, touch: true, deviceMemory: 8 })).toBe("medium");
  });

  it("a touch device with a strong GPU string alone (worth two) is high", () => {
    expect(
      classifyTier({ ...base, touch: true, gpuRenderer: "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)" })
    ).toBe("high");
  });

  it("an unrecognised/generic GPU string (privacy-hardened browser) is treated as unknown, not weak", () => {
    expect(
      classifyTier({ ...base, touch: true, gpuRenderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader), SwiftShader)" })
    ).toBe("medium");
  });

  it("a strong GPU string outweighs a merely-low core count", () => {
    expect(
      classifyTier({ ...base, touch: true, gpuRenderer: "ANGLE (ARM, Mali-G78 MP14, OpenGL ES 3.2)", hardwareConcurrency: 4 })
    ).toBe("high");
  });
});
