import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/types/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  exports: true,
  publint: "ci-only",
  attw: "ci-only",
  failOnWarn: "ci-only",
});
