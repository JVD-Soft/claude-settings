/**
 * Every `import.meta.env.VITE_*` read in the app funnels through here, so a
 * variable is typed once (`src/vite-env.d.ts`) and defaulted once. Components
 * import `APP_CONFIG`, never `import.meta.env` directly.
 */
export const APP_CONFIG = {
  NAME: '{{APP_NAME}}',
  VERSION: '1.0.0',
  DESCRIPTION: '{{APP_DESCRIPTION}}',
  /**
   * Relative on purpose. nginx serves the SPA and `/api` from one origin, so a
   * relative base is same-origin by construction — at `localhost`, at
   * `127.0.0.1`, on a LAN address and on the real domain, without a rebuild.
   *
   * An absolute default bakes one hostname into the bundle, and the moment the
   * app is opened by any other name the browser sees a cross-origin request and
   * `connect-src 'self'` blocks every call. On Docker under WSL2 that happens
   * immediately: `localhost` resolves to `::1` there, so the app is reached at
   * `127.0.0.1` and an API pinned to `localhost` is a different origin.
   *
   * Setting `VITE_API_BASE_URL` to an absolute URL is supported — for a
   * genuinely separate API host — but then `connect-src` in
   * `docker/nginx/snippets/csp.conf` has to name that host too.
   */
  API_URL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  /**
   * Absolute origin, used for canonical URLs, `og:url` and the sitemap. It has
   * to be absolute — a relative canonical is ignored — and it is the one value
   * that must be set correctly per environment.
   */
  SITE_URL: (import.meta.env.VITE_SITE_URL ?? '{{SITE_URL}}').replace(/\/$/, ''),
} as const;
