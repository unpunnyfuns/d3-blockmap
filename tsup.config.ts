import { defineConfig } from "tsup";

export const config = defineConfig({
  entry: { index: "src/index.ts", "react/index": "src/react/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react/jsx-runtime"],
});

export default config;
