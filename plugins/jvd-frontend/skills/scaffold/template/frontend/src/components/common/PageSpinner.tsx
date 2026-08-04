/**
 * Full-height loading state: the Suspense fallback for a lazily-loaded route,
 * and what the route guards show while the session is still settling.
 *
 * Uses design tokens rather than the raw slate palette, so it is not invisible
 * in dark mode.
 */
export const PageSpinner = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-screen items-center justify-center bg-background"
  >
    <div className="size-12 animate-spin rounded-full border-b-2 border-foreground" />
    <span className="sr-only">Loading</span>
  </div>
);
