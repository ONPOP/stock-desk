import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist-electron/**",
      "electron/**",
      "scripts/electron-*.js",
      "next-env.d.ts",
      // exFAT 외장 볼륨에서 macOS가 만드는 AppleDouble 부산물 — 소스가 아니다
      "**/._*",
    ],
  },
];

export default eslintConfig;
