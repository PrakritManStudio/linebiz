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
  deps: {
    // Types from the @line/bot-sdk devDependency are inlined into the .d.ts on
    // purpose (see THIRD_PARTY_NOTICES.md); anything else getting bundled fails.
    onlyBundle: ["@line/bot-sdk"],
  },
  publint: "ci-only",
  // ESM-only package: ignore node10 and CJS resolution results.
  attw: { enabled: "ci-only", profile: "esm-only", level: "error" },
  failOnWarn: "ci-only",
});
