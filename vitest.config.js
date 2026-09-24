import { defineConfig } from "vitest/config";

// Unit tests cover the pure logic layers: src/lib/* (storage normalization,
// share links, markdown, error humanizing) and the serverless proxy core.
// UI is verified via the deployed preview; this keeps CI fast and dependency-light.
export default defineConfig({
  test: {
    environment: "node",
    include: ["nexus/src/lib/*.test.js", "nexus/api/*.test.js"],
    reporters: "default",
  },
});
