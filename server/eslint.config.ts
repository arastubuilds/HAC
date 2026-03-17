/// <reference types="node" />
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "eqeqeq": ["error", "always"],
      "no-console": "off",

      // LangGraph/LangChain library boundary — infers `any` on complex generics
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",

      // numbers in template literals are always safe
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],

      // allow _-prefixed vars used for destructuring discard
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],

      // Fastify preHandler hooks type as void-return in some overloads
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { properties: false } }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "src/test.ts", "eslint.config.ts", "prisma.config.ts"],
  },
]);
