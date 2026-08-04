#!/usr/bin/env node
/**
 * Self-test for guard-read.mjs. Run from anywhere:
 *   node plugins/jvd-frontend/hooks/guard-read.test.mjs
 *
 * No test runner: it shells out to the hook exactly the way Claude Code does
 * (JSON on stdin, exit code out), so it verifies the real contract rather than
 * an internal function.
 *
 * The two halves matter equally. BLOCK cases prove the hook still saves
 * tokens; ALLOW cases prove it never eats a real source file — a guard that
 * blocks source is far worse than no guard at all.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard-read.mjs');

const BLOCK = [
  // deps / vendored — at every depth and layout
  'node_modules/react/index.js',
  'frontend/node_modules/react/index.js',
  'vendor/autoload.php',
  'backend/vendor/autoload.php',
  'services/api/vendor/composer/installed.php',
  'C:\\Users\\dev\\proj\\frontend\\node_modules\\react\\index.js',
  // lockfiles
  'frontend/yarn.lock',
  'backend/composer.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
  'uv.lock',
  // build output
  'frontend/dist/assets/index-a1b2.js',
  'frontend/dist-ssr/entry-prerender.js',
  'web/.next/server/page.js',
  'app/target/debug/main.rs',
  'coverage/lcov-report/index.html',
  'storybook-static/main.js',
  // package-manager and framework caches
  'frontend/.yarn/cache/react-npm-19.2.0.zip',
  // `tsc -b` writes its cache beside the tsconfig, inside the source tree.
  'frontend/.tsbuild/tsconfig.node.tsbuildinfo',
  'frontend/tsconfig.tsbuildinfo',
  'apps/web/tsconfig.app.tsbuildinfo',
  'backend/bootstrap/cache/config.php',
  'backend/storage/framework/views/x.php',
  'service/__pycache__/mod.cpython-312.pyc',
  '.venv/lib/site-packages/x.py',
  // binaries / media
  'logo.png',
  'frontend/public/font.woff2',
  'frontend/public/pwa-512x512.png',
  'docs/spec.pdf',
  'db.sqlite3',
];

const ALLOW = [
  // ordinary source — the regression half
  'frontend/src/App.tsx',
  'frontend/src/components/ui/button.tsx',
  'frontend/src/routes.tsx',
  'frontend/scripts/prerender.mjs',
  'backend/routes/api.php',
  'backend/app/Filament/Resources/Users/UserResource.php',
  'AGENTS.md',
  'docs/context-map.md',
  'Makefile',
  'docker-compose.yml',
  'frontend/package.json', // the manifest is useful; only the LOCK is noise
  'backend/composer.json',
  '.github/workflows/frontend.yml', // .github must not trip the .git rule
  'frontend/src/locales/uk/translation.json',
  'frontend/.yarnrc.yml', // config, not the .yarn cache directory
  'frontend/tsconfig.json', // the config, not the .tsbuildinfo cache beside it
  // names that merely CONTAIN a blocked word must not trip it
  'backend/app/Services/VendorService.php',
  'frontend/src/pages/BuildPage.tsx',
  'frontend/src/hooks/useDistance.ts',
  'backend/app/Models/Distributor.php',
];

const run = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
    .status;

const readEvent = (filePath) => ({ tool_name: 'Read', tool_input: { file_path: filePath } });

const failures = [];

for (const filePath of BLOCK) {
  if (run(readEvent(filePath)) !== 2) failures.push(`  should BLOCK but allowed: ${filePath}`);
}
for (const filePath of ALLOW) {
  if (run(readEvent(filePath)) !== 0) failures.push(`  should ALLOW but blocked: ${filePath}`);
}

// A non-Read tool must always pass through untouched.
if (run({ tool_name: 'Edit', tool_input: { file_path: 'node_modules/x.js' } }) !== 0) {
  failures.push('  should ignore non-Read tools, but blocked an Edit');
}

// Malformed input must fail open, not block.
if (
  spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' }).status !== 0
) {
  failures.push('  should fail open on malformed input, but blocked');
}

const total = BLOCK.length + ALLOW.length + 2;
if (failures.length > 0) {
  console.error(`FAIL - ${failures.length}/${total} cases wrong:`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `ok - ${total}/${total} guard-read cases pass ` +
    `(${BLOCK.length} block, ${ALLOW.length} allow, 2 contract)`,
);
