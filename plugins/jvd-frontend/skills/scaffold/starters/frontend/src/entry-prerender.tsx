import '@/i18n';

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';

import { AppRoutes } from '@/routes';

/**
 * Build-time entry. Must mirror `App.tsx`'s provider stack exactly, with
 * StaticRouter in place of BrowserRouter — which is the whole reason the route
 * table lives in `routes.tsx` rather than inside `App`.
 *
 * PROJECT DECISION — the providers below are a starting point, not the answer.
 * Open `App.tsx` and add every provider a public route reads from. A missing
 * one does not throw: the page renders its Suspense fallback, and the build
 * fails in `scripts/prerender.mjs` with "fell back to Suspense".
 *
 * Nothing here fetches. TanStack Query has no data in Node, so the output is
 * the shell, the copy and the head tags — what crawlers need, and what an empty
 * `<div id="root">` was failing to give them. Data still arrives on the client.
 */
export const render = (url: string): string =>
  renderToString(
    <StaticRouter location={url}>
      <AppRoutes />
    </StaticRouter>,
  );
