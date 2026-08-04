/**
 * Every `import.meta.env.VITE_*` read in the app funnels through here, so a
 * variable is typed once (`src/vite-env.d.ts`) and defaulted once. Components
 * import `APP_CONFIG`, never `import.meta.env` directly.
 */
export const APP_CONFIG = {
  NAME: '{{APP_NAME}}',
  VERSION: '1.0.0',
  DESCRIPTION: '{{APP_DESCRIPTION}}',
  API_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:80/api',
  /**
   * Absolute origin, used for canonical URLs, `og:url` and the sitemap. It has
   * to be absolute — a relative canonical is ignored — and it is the one value
   * that must be set correctly per environment.
   */
  SITE_URL: (import.meta.env.VITE_SITE_URL ?? '{{SITE_URL}}').replace(/\/$/, ''),
} as const;
