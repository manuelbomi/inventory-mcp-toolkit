// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "data/*.db"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // allow leading-underscore params/vars for intentionally-unused values
      // (common in handler signatures where we must match an SDK shape)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
