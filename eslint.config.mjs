import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import nextPlugin from "@next/eslint-plugin-next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  // Ensure Next.js plugin is explicitly registered for Next's detection
  {
    plugins: {
      "@next/next": nextPlugin,
    },
  },
  {
    ignores: [
      // Generated/build files
      "**/generated/**/*",
      ".next/**/*",
      "out/**/*",
      "build/**/*",
      "dist/**/*",
      // Dependencies
      "node_modules/**/*",
      // Config files that don't need linting
      "*.config.js",
      "*.config.mjs",
    ],
  },
  js.configs.recommended,
  // Keep existing Next.js configs via compat for rule coverage and TS support
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("next/typescript"),
];
