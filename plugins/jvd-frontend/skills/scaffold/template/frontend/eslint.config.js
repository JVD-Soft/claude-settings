import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedPlugins = {
  react: reactPlugin,
  "react-hooks": reactHooks,
  "react-refresh": reactRefresh,
  "jsx-a11y": jsxA11y,
  import: importPlugin,
  "simple-import-sort": simpleImportSort,
};

const sharedSettings = {
  react: { version: "detect" },
  "import/resolver": {
    typescript: { project: "./tsconfig.json" },
  },
};

const sharedRules = {
  // New JSX transform (tsconfig "jsx": "react-jsx") — React need not be in scope.
  "react/react-in-jsx-scope": "off",
  "react/jsx-uses-react": "off",
  // Without this, `no-unused-vars` doesn't count `<Foo />` as a use of `Foo`,
  // and every component imported purely for JSX reports as unused.
  "react/jsx-uses-vars": "error",
  ...reactHooks.configs.recommended.rules,
  // These do NOT catch an icon-only button with no accessible name — that gap
  // belongs to a getByRole(name) test, not to lint.
  ...jsxA11y.flatConfigs.recommended.rules,
  "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error",
  "import/first": "error",
  "import/newline-after-import": "error",
  "import/no-duplicates": "error",

  // Two rules for two bugs that already shipped, both of which look like
  // working code and fail silently at runtime.
  "no-restricted-syntax": [
    "error",
    {
      // A <form> without noValidate never submits when a field fails the
      // browser's own constraint validation: the submit event is suppressed,
      // react-hook-form never runs, and the translated zod message can never
      // appear. The button does nothing and nothing is logged.
      selector: "JSXOpeningElement[name.name='form']:not(:has(JSXAttribute[name.name='noValidate']))",
      message:
        "Add noValidate to <form>. Without it the browser's validation blocks the submit event, zod never runs, and the button silently does nothing.",
    },
  ],
  "no-restricted-globals": [
    "error",
    {
      name: "localStorage",
      message:
        "Use safeStorage from @/lib/storage. localStorage throws in private mode and does not exist under the build-time prerender, where i18n reads it at module scope.",
    },
    {
      name: "sessionStorage",
      message: "Use safeStorage from @/lib/storage — same reason as localStorage.",
    },
  ],
};

export default [
  { ignores: ["dist", "dist-ssr", "node_modules", "coverage", ".tsbuild"] },

  js.configs.recommended,

  // JS / JSX — React rules without type-aware TS linting
  {
    files: ["**/*.{js,jsx}"],
    plugins: sharedPlugins,
    settings: sharedSettings,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...sharedRules,
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Build scripts run in Node, not the browser.
  {
    files: ["scripts/**/*.{js,mjs}"],
    plugins: { "simple-import-sort": simpleImportSort },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },

  // TS / TSX — full TypeScript + type-aware rules.
  // These MUST be scoped with `files`: spread bare, they apply to .js/.jsx too,
  // and `recommendedTypeChecked` enables type-aware rules (await-thenable, …)
  // that hard-crash ESLint on any file outside the TS project.
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.{ts,tsx}"] })),
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    plugins: sharedPlugins,
    settings: sharedSettings,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        // `project` cannot reach files that TSConfig exposes through
        // "references", which is exactly this layout — vite.config.ts was
        // failing to lint at all with "not supported by parserOptions.project".
        // projectService is typescript-eslint's supported answer: it asks the
        // TypeScript project service which project owns each file.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // safeStorage is the wrapper itself, so it has to reach the API it wraps.
  {
    files: ["src/lib/storage.ts"],
    rules: { "no-restricted-globals": "off" },
  },

  // Tests and test helpers. `recommendedTypeChecked` sees RTL matchers, mocked
  // modules and JSON fixtures as `any`-shaped and buries real findings under
  // no-unsafe-* noise. The guarantee those rules buy in application code isn't
  // available to buy here — a test asserts on its own result.
  {
    files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "react-refresh/only-export-components": "off",
      // A test asserting what actually landed in storage has to read storage.
      // The rule exists to stop application code depending on an API that
      // throws in private mode; a test is where that is verified, not violated.
      "no-restricted-globals": "off",
    },
  },

  // Vendored shadcn/ui primitives. Upstream ships each cva variant object in the
  // same module as its component, so `only-export-components` fires on nearly
  // every one. Splitting them would fork the vendor layer for a dev-only HMR
  // nicety, and re-running `npx shadcn add` would undo it. Scoping the rule off
  // here is the cheaper trade — our own components are still held to it.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      // carousel.tsx syncs embla's initial state from an effect. Upstream has
      // not adapted to the compiler rules; restructuring it here would be
      // undone by the next `npx shadcn add`.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
