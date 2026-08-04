/**
 * Build-time prerender. Runs after `vite build`, renders a fixed list of public
 * routes to static HTML and writes them next to the SPA bundle.
 *
 * A script rather than a plugin on purpose: react-snap has been dead since 2020
 * and does not support React 19, the Vite prerender plugins impose their own
 * entry conventions, and the provider order is not something a generic tool can
 * guess.
 *
 * It does NOT fetch. There is no API at build time, so the output is the shell,
 * the static copy and the head tags — a real document for crawlers instead of
 * an empty div. Data still arrives on the client.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'vite';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(frontendDir, 'dist');
const ssrDir = path.join(frontendDir, 'dist-ssr');

/**
 * The eager, public routes. Everything else is `lazy()` and would render as a
 * Suspense fallback — see `src/routes.tsx`, where the same line is drawn.
 *
 */
const ROUTES = ['/'];

const SITE_URL = (process.env.VITE_SITE_URL ?? '{{SITE_URL}}').replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const TITLE = /<title[^>]*>[\s\S]*?<\/title>/i;
const DESCRIPTION = /<meta[^>]+name="description"[^>]*>/i;
// JSON-LD is lifted with them: it is valid anywhere in the document, but a
// crawler that only reads <head> should still find it.
const HEAD_TAGS =
  /<(?:title[^>]*>[\s\S]*?<\/title>|script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>|(?:meta|link)\b[^>]*?\/?>)/gi;

/**
 * React emits `<title>`/`<meta>`/`<link>` where they were rendered — hoisting
 * into `<head>` is a client-side behaviour. Lift them out of the body, and drop
 * the template's own title/description so the page doesn't ship two of each.
 */
const hoistHeadTags = (template, body) => {
  const tags = body.match(HEAD_TAGS) ?? [];
  if (tags.length === 0) return { template, body };

  const strippedBody = tags.reduce((acc, tag) => acc.replace(tag, ''), body);
  let head = template;
  if (tags.some((tag) => TITLE.test(tag))) head = head.replace(TITLE, '');
  if (tags.some((tag) => DESCRIPTION.test(tag))) head = head.replace(DESCRIPTION, '');

  return {
    template: head.replace('</head>', `${tags.join('\n    ')}\n  </head>`),
    body: strippedBody,
  };
};

const sitemap = (routes) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    // lastmod is the build date: these pages change when the app ships,
    // which is the only signal available without a CMS.
    ...routes.map(
      (route) =>
        `  <url><loc>${SITE_URL}${route}</loc><lastmod>${BUILD_DATE}</lastmod></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

// Generated rather than kept in public/, because the Sitemap line needs the
// absolute origin and a static file cannot know it.
const robots = () =>
  [
    'User-agent: *',
    'Allow: /',
    '',
    '# Guarded areas: nothing for a crawler, everything redirects to /login.',
  'Disallow: /me',
  'Disallow: /dashboard',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');

await build({
  root: frontendDir,
  logLevel: 'warn',
  build: {
    ssr: path.join(frontendDir, 'src/entry-prerender.tsx'),
    outDir: ssrDir,
    emptyOutDir: true,
    ssrEmitAssets: false,
    sourcemap: false,
  },
});

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-prerender.js')).href);

// app.html is built by Vite as a second entry, not written here: the service
// worker's precache manifest is generated during that build, and a fallback
// created afterwards would never be precached.
//
// It is also the template, rather than index.html: index.html is overwritten
// below, so reading it would nest a rendered page inside a rendered page the
// second time this runs without a rebuild.
const shell = await readFile(path.join(distDir, 'app.html'), 'utf8');

/**
 * React writes `<!--$!-->` where a Suspense boundary fell back during SSR —
 * a provider missing from `entry-prerender.tsx` looks exactly like this, and
 * the result is a page of spinner markup that still counts as "prerendered".
 * Fail the build instead: silently shipping a loading state to crawlers is
 * worse than not prerendering at all.
 */
const assertRendered = (route, body) => {
  if (body.includes('<!--$!-->')) {
    throw new Error(
      `prerender: ${route} fell back to Suspense. A provider the page needs is ` +
        `probably missing from src/entry-prerender.tsx.`,
    );
  }
  if (body.length < 200) {
    throw new Error(`prerender: ${route} produced ${body.length} chars — that is not a page.`);
  }
};

for (const route of ROUTES) {
  const rendered = render(route);
  assertRendered(route, rendered);
  const { template, body } = hoistHeadTags(shell, rendered);
  const html = template.replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  const target =
    route === '/' ? path.join(distDir, 'index.html') : path.join(distDir, route, 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  console.log(`prerendered ${route} → ${path.relative(distDir, target)}`);
}

await writeFile(path.join(distDir, 'sitemap.xml'), sitemap(ROUTES), 'utf8');
await writeFile(path.join(distDir, 'robots.txt'), robots(), 'utf8');
console.log(`sitemap.xml + robots.txt → ${ROUTES.length} url(s) at ${SITE_URL}`);
