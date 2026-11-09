import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

export const config = defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "**/*.browser.test.*"],
        },
      },
      {
        test: {
          name: "browser",
          globals: true,
          include: ["src/**/__tests__/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            viewport: { width: 800, height: 600 },
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

export default config;
