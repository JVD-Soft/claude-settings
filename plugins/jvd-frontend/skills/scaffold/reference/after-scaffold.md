# After the scaffolder runs

The script prints what it left for a person. This is how to resolve each of
those, and the order that matters.

## Ordering

Most of it can be done in any order. Three cannot:

1. **`sideEffects` before checking chunks.** Without it Rollup keeps every
   module, so `lazy()` and `manualChunks` produce one bundle and look broken.
   The scaffolder sets it; do not measure the bundle before `yarn install`.
2. **`safeStorage` before the prerender.** `i18n.ts` reads the stored language
   at module scope, and the prerender runs in Node, where `localStorage` does
   not exist. A direct `localStorage.getItem` there throws during the build.
3. **`app.html` as a Vite entry before the PWA.** The service worker's precache
   manifest is generated during the build. A fallback document written after
   the build is never precached, and offline navigation fails.

## The decisions

### `entry-prerender.tsx` — provider stack

Open `App.tsx` and mirror every provider a public route reads from, replacing
`BrowserRouter` with `StaticRouter`. Theme, query client and auth are the usual
ones; anything a public page calls a hook from must be there.

A missing provider does not throw. React renders the nearest Suspense fallback,
and the page ships as spinner markup. `scripts/prerender.mjs` catches it and
fails the build with `fell back to Suspense` — that message means this.

### `ROUTES` in `prerender.mjs`

Only routes that are **eager and public**. A `lazy()` route renders its
fallback, not the page. Detail routes with an id (`/products/:id`) cannot be
prerendered at all — the ids live in the API, which does not exist at build
time.

### `robots()` in `prerender.mjs`

`Disallow` the project's private sections: cabinets that redirect to login,
per-visitor state like a cart or checkout, and any URL carrying a token.

`Disallow` does not deindex. A disallowed URL can still be indexed from an
external link, just without its content — for that, use `<Meta noindex />` on
the page itself.

### `BACKEND_PATHS` and the nginx prefix list

`frontend/vite.config.ts` and the `^/(api|sanctum|…)` location in
`docker/nginx/conf.d/default.conf` are one list written twice. Keep them equal.

Out of step, the service worker — which claims scope `/` — answers navigations
to Filament, Horizon or the API with the SPA shell, and `/admin` stops opening
for every user who has loaded the app once. It survives a hard refresh.

### `SearchAction` in `structuredData.ts`

`urlTemplate` needs the project's real search route and its real query
parameter. If there is no search page, delete `potentialAction` entirely — a
template that does not resolve is worse than omitting it.

### `<Toaster />` in `UIProvider`

`PwaUpdatePrompt` is a toast. Without a `Toaster` mounted it renders nothing,
reports no error, and the app silently never offers its updates. If the project
uses a different toast library, rewrite `PwaUpdatePrompt` against it.

### `safeStorage` in `i18n.ts`

Replace both `localStorage` calls with `safeStorage`, and set
`document.documentElement.lang` in the `languageChanged` handler — React hoists
head tags but not attributes on `<html>`, so nothing else sets it. Without it a
screen reader reads Ukrainian with English phonetics.

### `routes.tsx` split

Public routes eager, guarded routes lazy. That single rule is what makes both
the code-splitting and the prerender work, and it is why the route table lives
in `routes.tsx` rather than inside `App`.

### Icons in `public/`

`pwa-64x64`, `pwa-192x192`, `pwa-512x512`, `maskable-icon-512x512`,
`apple-touch-icon-180x180`, `favicon.svg`, `favicon.ico`. The manifest is
invalid without them and the install prompt will not appear.

The maskable one is not the same image: Android crops it to a circle, so its
content must sit inside the middle 80%. The scaffolder ships no placeholders on
purpose — a placeholder that reaches production is someone's app icon.

### Manifest `shortcuts` and `screenshots`

Product decisions. `screenshots` is what turns a bare install prompt into a
rich one with a preview; without it Chrome shows the minimal dialog.

### `body` background in `index.css`

If the scaffolder reported a literal background, replace it with
`var(--background)` / `var(--foreground)` and delete any `.dark body` override.
A literal there means the palette above it is decorative and theme switching
does nothing to the page background.

### `Makefile` compose invocation

Compose v1 is gone from current Docker installs, so a hardcoded
`docker-compose` makes every target fail with "command not found":

```make
DOCKER_COMPOSE := $(shell docker compose version >/dev/null 2>&1 \
	&& echo "docker compose" || echo "docker-compose")
COMPOSE=$(DOCKER_COMPOSE) --env-file backend/.env
```

### `resolutions` in `package.json`

If `react`/`react-dom` are pinned there, they were almost certainly added to
force one stale package onto React 19. Once that package is gone the block is
dead weight and hides real peer conflicts. Check, then delete it.

### Locales with no template

The scaffolder ships `en` and `uk`. Any other locale the project registered
needs the same `errors.*` and `pwa.*` keys written by hand — i18next falls back
silently, so a missing key shows English inside an otherwise translated page.
