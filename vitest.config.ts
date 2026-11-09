import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const NODE_TESTS = [
  "src/__tests__/bitset.test.ts",
  "src/__tests__/bins.test.ts",
  "src/__tests__/ranges.test.ts",
  "src/__tests__/view.test.ts",
  "src/__tests__/state.test.ts",
  "src/__tests__/state.scale.test.ts",
  "src/__tests__/renderer.test.ts",
];

export const config = defineConfig({
  test: {
    projects: [
      { test: { name: "node", environment: "node", globals: true, include: NODE_TESTS } },
      {
        test: {
          name: "browser",
          globals: true,
          include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: NODE_TESTS,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

export default config;
