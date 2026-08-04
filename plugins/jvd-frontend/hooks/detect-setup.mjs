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

  /**
   * A fork of base_setup arrives with the baseline already in place and the
   * template's own name still in it. Nothing else notices: the build is green,
   * the tests pass, and the project ships with `<title>App</title>` and
   * `"name":"App"` in its manifest. The eight project values cannot fix it on
   * their own — the files they would land in already exist, so the scaffolder
   * correctly leaves them alone. `--brand` is the mode that does.
   *
   * base_setup itself is exempt: it carries the template's name because it *is*
   * the template, and warning it every session is how a report becomes noise.
   * It opts out with `"identity": { "isTemplate": true }` in the stamp file.
   */
  const stampFile = path.join(root, 'frontend/.jvd-scaffold.json');
  const isTemplate =
    existsSync(stampFile) &&
    JSON.parse(readFileSync(stampFile, 'utf8')).identity?.isTemplate === true;

  const configFile = path.join(root, 'frontend/src/config/index.ts');
  const unbranded =
    !isTemplate &&
    existsSync(configFile) &&
    /NAME: 'App'|DESCRIPTION: 'Application starter\.'/.test(readFileSync(configFile, 'utf8'));

  if (missing.length === 0 && !unbranded) say('');

  const parts = [];
  if (missing.length > 0) {
    parts.push(
      `This project's frontend is missing part of the JVD-Soft baseline:\n` +
        missing.map((item) => `- ${item}`).join('\n') +
        `\n\nThe jvd-frontend:scaffold skill installs all of it in one run.`,
    );
  }
  if (unbranded) {
    parts.push(
      `This project still carries the template's identity — src/config/index.ts says ` +
        `the app is called "App". It reaches <title>, the PWA manifest, og:site_name ` +
        `and every schema.org block, and nothing else will flag it.\n` +
        `\`node <plugin>/skills/scaffold/scripts/scaffold.mjs --brand --dry-run\` shows what would change.`,
    );
  }

  say(`${parts.join('\n\n')}\n\nOffer this if the user's task touches any of it; do not run anything unprompted.`);
} catch {
  process.exit(0);
}
