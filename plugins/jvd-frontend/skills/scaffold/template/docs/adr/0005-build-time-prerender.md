# ADR-0005: Build-time prerender, not SSR

## Status

Accepted — 2026-08-04. Amends [ADR-0001](0001-vite-spa-over-nextjs.md), which
chose a Vite SPA and asked to be revisited if a real SEO requirement appeared.
One has: the catalogue is public and meant to be found.

## Context

The app shipped `<div id="root"></div>` and `<title>frontend</title>` to every
crawler, with Vite's own logo as the favicon and no `robots.txt`, `sitemap.xml`
or `canonical`. ADR-0001 explicitly warned against bolting head-tag tricks onto
a CSR app as a substitute for SSR — so either the requirement was fake, or the
render model had to change.

## Decision

`vite build` is followed by `scripts/prerender.mjs`, which builds an SSR bundle
from `src/entry-prerender.tsx`, renders a fixed list of public routes with
`renderToString`, and writes static HTML.

**A script, not a plugin.** `react-snap` has been unmaintained since 2020 and
does not support React 19. The Vite prerender plugins impose their own entry
conventions, and the provider order here (`UIProvider` → `StaticRouter` →
`AuthProvider`) is not something a generic tool can guess. The script is about
a hundred lines and its failure mode is ours.

**It does not fetch.** There is no API at build time, so what a crawler gets is
the shell, the layout, the static copy and the head tags — a real document
instead of an empty div. Product listings still arrive on the client. This is
the honest limit of the approach; the pages that benefit most are the static
ones, where the entire page is in the HTML.

**Keep `createRoot`; do not switch to `hydrateRoot`.** The first client render
legitimately differs from the prerendered HTML — the language comes from
storage, the theme class is applied by an effect, the cart is client-only,
the session is unknown at build time. That is a guaranteed mismatch, and React
19 answers a mismatch by re-rendering the whole tree and logging an error.
Prerendered markup here is an artefact for crawlers and first paint, which
React then discards. Anyone "finishing the job" by hydrating will make the app
slower and noisier, not faster.

**Only eager routes can be prerendered.** `renderToString` emits the Suspense
fallback for a `lazy()` route, so the splitting rule in `routes.tsx` and this
list are the same decision seen twice.

**No `hreflang`.** Both languages are served from the same URL. Alternates that
point at the URL they are alternates of are worse than none; real Ukrainian
indexing needs locale-addressed paths (`/uk/...`), which is a routing change
and a separate decision.

## Consequences

- `dist/index.html` is now the prerendered home page, so the SPA fallback must
  be a separate empty shell. The script writes `dist/app.html` and nginx falls
  back to it — pointing the fallback at `index.html` would flash the home page
  on every deep link.
- `robots.txt` and `sitemap.xml` are generated, not committed: both need the
  absolute origin, which comes from `VITE_SITE_URL` and differs per
  environment.
- `manualChunks` is disabled for the SSR build. React is external there, and
  Rollup refuses to place an external module in a manual chunk.
- Adding a public route means adding it to `ROUTES` in the script. Nothing
  detects that automatically, and nothing should — prerendering a route that
  needs data would ship an empty skeleton to crawlers and look like success.
