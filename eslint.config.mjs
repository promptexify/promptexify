import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      "**/generated/**/*",
      ".next/**/*",
      "out/**/*",
      "build/**/*",
      "dist/**/*",
      "node_modules/**/*",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
];
