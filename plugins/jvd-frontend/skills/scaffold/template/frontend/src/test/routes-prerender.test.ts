import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `src/routes.tsx` and `scripts/prerender.mjs` have to agree, and nothing makes
 * them. Both files say so in a comment — "see src/routes.tsx, where the same
 * line is drawn" — which is the shape of a rule with no enforcement behind it.
 *
 * `assertRendered` in prerender.mjs already fails the build when a prerendered
 * route falls back to Suspense, so the lazy-page case is covered at build time.
 * What nothing covers is the other two directions, and both fail silently:
 *
 * - a guarded route added to routes.tsx and not to the robots.txt Disallow list
 *   is a page crawlers will follow, index as a redirect to /login, and rank;
 * - a route listed in ROUTES that no longer exists prerenders the 404 page
 *   under a real URL, which looks like a working page in the output.
 *
 * Text parsing rather than importing the modules: prerender.mjs runs a Vite
 * build at import time, and routes.tsx pulls the whole component tree. This
 * test has to stay cheap enough to run in the unit suite.
 */
const FRONTEND = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(FRONTEND, file), 'utf8');

const routesSource = read('src/routes.tsx');
const prerenderSource = read('scripts/prerender.mjs');

/** All capture-group-1 matches, without a non-null assertion. */
const captured = (re: RegExp, source: string): string[] =>
  [...source.matchAll(re)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

const lazyComponents = new Set(captured(/const\s+(\w+)\s*=\s*lazy\(/g, routesSource));

type RouteEntry = { path: string; component: string | undefined; guarded: boolean };

/**
 * Split on `<Route`, then read each fragment. A regex for the whole element
 * cannot work: `<Route path="/" element={<HomePage />} />` closes with `/>`
 * twice, and the non-greedy match stops at the inner one.
 */
const routeEntries: RouteEntry[] = routesSource
  .split(/<Route\b/)
  .slice(1)
  .flatMap((block) => {
    const routePath = /path="([^"]+)"/.exec(block)?.[1];
    if (routePath === undefined) return [];
    // The leaf is the last self-closing capitalised tag in the fragment:
    // <GuestRoute><LoginPage /></GuestRoute> yields LoginPage, because the
    // wrapper is not self-closing.
    const components = captured(/<([A-Z]\w*)\s*\/>/g, block);
    return [{ path: routePath, component: components.at(-1), guarded: /<ProtectedRoute\b/.test(block) }];
  });

const prerenderedRoutes = captured(
  /'([^']+)'/g,
  /const\s+ROUTES\s*=\s*\[([^\]]*)\]/.exec(prerenderSource)?.[1] ?? '',
);

const disallowedPaths = captured(/'Disallow:\s*([^']+)'/g, prerenderSource).map((value) =>
  value.trim(),
);

const guardedPaths = routeEntries.filter((entry) => entry.guarded).map((entry) => entry.path);

/**
 * robots.txt matches by PREFIX, not by equality: `Disallow: /me` covers
 * /me/orders/42 without listing it, and `Disallow: /supplier` also covers
 * /suppliers — a public page nobody meant to block. A trailing `$` anchors the
 * rule to the whole path, which is the way out of that collision. Both
 * directions below depend on modelling all of it correctly.
 */
const disallowedBy = (route: string): string | undefined =>
  disallowedPaths.find((rule) =>
    rule.endsWith('$') ? route === rule.slice(0, -1) : route.startsWith(rule),
  );

describe('routes.tsx ↔ prerender.mjs', () => {
  it('parses both files', () => {
    // A silent parse failure would make every assertion below vacuously true.
    expect(routeEntries.length).toBeGreaterThan(0);
    expect(prerenderedRoutes.length).toBeGreaterThan(0);
    expect(lazyComponents.size).toBeGreaterThan(0);
  });

  it('prerenders only routes that exist', () => {
    const known = new Set(routeEntries.map((entry) => entry.path));
    expect(prerenderedRoutes.filter((route) => !known.has(route))).toEqual([]);
  });

  it('prerenders only eagerly imported pages', () => {
    const lazyPrerendered = prerenderedRoutes.filter((route) => {
      const entry = routeEntries.find((candidate) => candidate.path === route);
      return entry?.component !== undefined && lazyComponents.has(entry.component);
    });
    expect(lazyPrerendered).toEqual([]);
  });

  it('prerenders no guarded route', () => {
    expect(prerenderedRoutes.filter((route) => guardedPaths.includes(route))).toEqual([]);
  });

  it('disallows every guarded route in robots.txt', () => {
    expect(guardedPaths.filter((route) => disallowedBy(route) === undefined)).toEqual([]);
  });

  /**
   * The expensive direction. A prerendered route exists so crawlers get real
   * HTML; a Disallow prefix that happens to cover it throws that away, and
   * nothing else in the build notices — the page is still generated, still
   * deployed, still correct, and still never indexed.
   */
  it('disallows no prerendered route', () => {
    const shadowed = prerenderedRoutes
      .filter((route) => disallowedBy(route) !== undefined)
      .map((route) => `${route} blocked by 'Disallow: ${disallowedBy(route)}'`);
    expect(shadowed).toEqual([]);
  });
});
