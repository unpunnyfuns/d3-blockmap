import { defineConfig } from "vitest/config";

export const config = defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

export default config;
