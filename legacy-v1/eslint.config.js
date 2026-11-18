import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "output/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        "Buffer",
        "__dirname",
        "__filename",
        "module",
        "process",
        "require",
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron", "electron/*", "node:*"],
              message:
                "Renderer modules must use the typed window.texpulse bridge.",
            },
          ],
        },
      ],
    },
  },
);
