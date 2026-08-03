import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test config for the Nighthaul gameplay core.
 *
 * The sim under test is deliberately headless — no THREE, no DOM, no React — so
 * it runs in plain node with no environment setup. That is the whole reason it
 * is worth having: gunplay is the part of a shooter you cannot judge by looking
 * at a screenshot, and this is the only layer where it can be asserted.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
