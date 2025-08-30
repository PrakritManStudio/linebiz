import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

// ESLint v9 flat config using installed TS parser/plugin
export default [
  // Ignore build artifacts and deps
  { ignores: ["dist", "node_modules", "**/*.test.ts"] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      // Define globals to avoid no-undef on standard globals like `console`
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Use the plugin's recommended rules
      ...tsPlugin.configs.recommended.rules,
      // Relax typing strictness: allow `any` as a warning instead of an error
      "@typescript-eslint/no-explicit-any": "warn",
      // TypeScript already handles undefined vars; disable core rule for TS files
      "no-undef": "off",
    },
  },
];
