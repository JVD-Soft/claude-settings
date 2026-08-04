/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

// Mirrors the backend prefixes in docker/nginx/conf.d/default.conf. The service
// worker claims scope "/", so without this it would answer navigations to
// Filament and the API with the SPA shell — and /admin would stop opening for
// anyone who had ever loaded the app. Keep the two lists in step.
const BACKEND_PATHS =
  /^\/(api|sanctum|storage|docs|horizon|admin|log-viewer|livewire|_debugbar)(\/|$)/;

// Vitest reads its config from here rather than a separate vitest.config.ts, so
// the plugins (notably vite-tsconfig-paths, which resolves `@/`) and the test
// run can never drift apart.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      // 'prompt', never 'autoUpdate' with skipWaiting: swapping the worker
      // mid-session while the pages are dynamic imports produces
      // "Failed to fetch dynamically imported module" on whatever the user is
      // looking at. The user decides when to reload.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "{{APP_NAME}}",
        short_name: "{{APP_SHORT_NAME}}",
        description: "{{APP_DESCRIPTION}}",
        // `id` is what identifies the app to the browser. Without it the
        // identity is start_url, so changing that would register as a
        // different app and orphan every existing install.
        id: "/",
        lang: "{{LANG}}",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Falls back left to right; "standalone" alone gives no say in what
        // happens when it is unavailable.
        display_override: ["standalone", "minimal-ui", "browser"],
        orientation: "any",
        background_color: "{{THEME_COLOR_LIGHT}}",
        theme_color: "{{THEME_COLOR_LIGHT}}",
        categories: {{PWA_CATEGORIES}},
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Explicit rather than `**/*`: the prerendered documents must stay out.
        // They exist for crawlers, which never run a service worker, and
        // navigations are answered from app.html anyway.
        globPatterns: ["assets/**/*.{js,css,woff2}", "app.html", "*.png", "*.svg", "*.ico"],
        navigateFallback: "/app.html",
        navigateFallbackDenylist: [BACKEND_PATHS],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        // Deliberately empty. Caching /api at runtime would put authorised JSON
        // in Cache Storage, where it outlives both the logout and the token's
        // 120-minute lifetime. Offline reads, if they are ever wanted, belong
        // to a TanStack Query persister that can be cleared on logout.
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Allow all hosts (required for Docker/Nginx proxy)
    hmr: {
      host: "localhost",
      clientPort: 80, // Browser connects to Nginx on port 80, which proxies to Vite
    },
    watch: {
      usePolling: true, // Required for Docker on Windows/macOS for file-change detection
    },
  },
  build: {
    // Maps are emitted but not referenced from the bundle, and nginx denies
    // *.map — they exist to be pulled out of the image for a stack trace, not
    // to be served.
    sourcemap: "hidden",
    // Off so the built HTML contains no inline <script>, which is what lets
    // the CSP say `script-src 'self'` with no hash or nonce. Every browser
    // this app targets supports modulepreload natively.
    modulePreload: { polyfill: false },
    // Chunking applies to the browser build only. In the prerender's SSR build
    // react and react-dom are external, and Rollup refuses to put an external
    // module in a manual chunk.
    rollupOptions: isSsrBuild
      ? {}
      : {
          // app.html is a real entry, not something the prerender step writes
          // afterwards: the service-worker manifest is generated during this
          // build, so a fallback created later would not be precached and
          // offline navigation would fail.
          input: { main: "index.html", app: "app.html" },
          output: {
            // Deliberately short. Rollup's own splitting is good; these three
            // are carved out only because they change on a different clock
            // than the app, so a release shouldn't invalidate them in
            // everyone's cache. react-dom stays with react — splitting them
            // risks init order.
            manualChunks: {
              // react-dom/client is listed separately on purpose: it is a
              // distinct module id from react-dom, and it is the one the app
              // imports — without it most of react-dom stays in the app chunk
              // and the split is cosmetic.
              "react-vendor": [
                "react",
                "react-dom",
                "react-dom/client",
                "react-router-dom",
                "scheduler",
              ],
              i18n: ["i18next", "react-i18next"],
              query: ["@tanstack/react-query"],
            },
          },
        },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Kept off on purpose — see the note in src/test/setup.ts.
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // Vendored shadcn primitives and the test helpers themselves are not
      // ours to cover; counting them would only flatter the number.
      exclude: [
        "src/components/ui/**",
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/entry-prerender.tsx",
      ],
    },
  },
}));
