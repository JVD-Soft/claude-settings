/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Vite's own `ImportMetaEnv` carries an `[key: string]: any` index signature, so
 * every `import.meta.env.VITE_*` read is `any` — which defeats `strict` and trips
 * the type-aware `no-unsafe-*` lint rules. Declaring the app's variables here
 * merges into that interface and gives them real types.
 *
 * Keep this list in sync with `.env.example`. Every variable is optional: a
 * `.env` file is not guaranteed to exist, and `src/config/index.ts` is where the
 * fallbacks live.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
