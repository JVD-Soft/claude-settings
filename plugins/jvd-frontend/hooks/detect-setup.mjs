#!/usr/bin/env node
/**
 * SessionStart: says what the frontend baseline is missing, once, at the top of
 * the session.
 *
 * Without it the gap is invisible. Nobody opens a project thinking "I wonder if
 * this one has a test runner" — they find out when a change needs a test and
 * there is nowhere to put it, three quarters of the way into the task.
 *
 * Runs on every session, so it does the cheapest thing that answers the
 * question: existsSync on a handful of files, no parsing beyond one package.json.
 * Silent when the baseline is in place — an unconditional message is one
 * everyone learns to skip.
 *
 * Fails open. A crash here would block the session start for a report.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const say = (context) => {
  if (context) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
      }),
    );
  }
  process.exit(0);
};

try {
  let root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  for (let up = 0; up < 4 && !existsSync(path.join(root, 'frontend/package.json')); up++) {
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }

  const pkgFile = path.join(root, 'frontend/package.json');
  if (!existsSync(pkgFile)) say('');

  const has = (relative) => existsSync(path.join(root, relative));
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const scripts = pkg.scripts ?? {};

  const missing = [];
  const note = (condition, what) => {
    if (condition) missing.push(what);
  };

  note(!scripts.test, 'no test runner — `yarn test` is not defined');
  note(!has('frontend/src/test/setup.ts'), 'no Vitest harness (src/test/)');
  note(!has('frontend/src/lib/storage.ts'), 'no safeStorage — localStorage is read directly, which throws under the prerender');
  note(
    !has('frontend/src/components/common/ErrorBoundary.tsx'),
    'no ErrorBoundary — a render error blanks the page',
  );
  note(!has('frontend/scripts/prerender.mjs'), 'no build-time prerender: crawlers get an empty <div id="root">');
  note(!has('frontend/app.html'), 'no app.html — the SPA fallback shell the service worker needs');
  note(!/vite-plugin-pwa/.test(JSON.stringify(pkg.devDependencies ?? {})), 'no PWA');
  note(!has('docker/nginx/snippets/security-headers.conf'), 'no nginx security headers or CSP');
  note(!has('.github/workflows/frontend.yml'), 'no CI for the frontend');
  note(
    scripts.lint !== undefined && !scripts.lint.includes('--max-warnings 0'),
    'lint tolerates warnings (`--max-warnings 0` is missing), so CI cannot fail on them',
  );
  note(
    (pkg.packageManager ?? '').startsWith('yarn@1') || !pkg.packageManager,
    'no Yarn 4 via packageManager — Yarn 1 cannot install Vitest at all',
  );

  if (missing.length === 0) say('');

  say(
    `This project's frontend is missing part of the JVD-Soft baseline:\n` +
      missing.map((item) => `- ${item}`).join('\n') +
      `\n\nThe jvd-frontend:scaffold skill installs all of it in one run. ` +
      `Offer it if the user's task touches any of the above; do not run it unprompted.`,
  );
} catch {
  process.exit(0);
}
