// eslint.config.js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/build/**", "legacy/**"] },
  ...tseslint.configs.recommended
);