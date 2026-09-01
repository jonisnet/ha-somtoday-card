import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "tests/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        customElements: "readonly",
        document: "readonly",
        window: "readonly",
        ResizeObserver: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
      },
    },
  },
];
