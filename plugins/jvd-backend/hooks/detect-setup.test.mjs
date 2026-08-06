#!/usr/bin/env node
/**
 * Self-test for detect-setup.mjs. Run from anywhere:
 *   node plugins/jvd-backend/hooks/detect-setup.test.mjs
 *
 * Builds throwaway project trees and runs the hook the way Claude Code does —
 * CLAUDE_PROJECT_DIR in the environment, JSON on stdout — so it checks the real
 * contract rather than an internal function.
 *
 * Two properties are worth more than the individual cases.
 *
 * SILENCE on a complete baseline. A SessionStart hook that speaks every session
 * is one everybody learns to skip, and then it is worth nothing on the session
 * where it has something to say. Every case below starts from a complete
 * project and breaks exactly one thing.
 *
 * FAILING OPEN. This runs before the session exists. A throw here — malformed
 * composer.json, an unreadable directory — must end as exit 0 and no output,
 * never as a blocked session start.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'detect-setup.mjs');

const write = (root, relative, content = '') => {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const COMPOSER = JSON.stringify({
  'require-dev': { 'larastan/larastan': '^3.10', 'laravel/pint': '^1.30' },
  scripts: { analyse: ['@php vendor/bin/phpstan analyse'] },
});

const LANG_FILES = ['auth.php', 'crud.php', 'entity.php'];

/**
 * A project with the whole baseline in place, laid out as a monorepo. `mutate`
 * receives the repo root and the backend directory so a case can break one
 * thing; `layout: 'root'` puts Laravel at the top instead, which is what a
 * backend-only project looks like.
 */
const project = (mutate = () => {}, layout = 'monorepo') => {
  const root = mkdtempSync(path.join(tmpdir(), 'jvd-backend-'));
  const backend = layout === 'monorepo' ? path.join(root, 'backend') : root;
  const at = (relative, content) => write(backend, relative, content);

  at('artisan', '#!/usr/bin/env php');
  at('composer.json', COMPOSER);
  at('phpstan.neon', 'parameters:\n    level: 5\n');
  mkdirSync(path.join(backend, 'app/Services'), { recursive: true });
  at('tests/Feature/OrderTest.php', '<?php');
  at('tests/Feature/ExampleTest.php', '<?php');
  for (const locale of ['en', 'uk']) {
    for (const file of LANG_FILES) at(`lang/${locale}/${file}`, '<?php return [];');
  }
  write(root, '.github/workflows/backend.yml', 'name: backend');
  write(root, 'Makefile', 'test:\n\t$(COMPOSE) exec -T backend php artisan test\n');

  mutate(root, backend);
  return root;
};

/** Returns the additionalContext string, or '' when the hook stayed silent. */
const run = (root) => {
  const result = spawnSync(process.execPath, [HOOK], {
    input: '{}',
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  if (result.status !== 0) return `__EXIT_${result.status}__`;
  if (!result.stdout.trim()) return '';
  try {
    return JSON.parse(result.stdout).hookSpecificOutput.additionalContext ?? '';
  } catch {
    return '__UNPARSEABLE__';
  }
};

const failures = [];
const roots = [];

/**
 * `expected` is a substring the report must contain, or null to require
 * silence. Each case is checked and its tree removed straight away — these
 * fixtures are small but there are a lot of them.
 */
const check = (label, root, expected) => {
  roots.push(root);
  const output = run(root);
  if (expected === null) {
    if (output !== '') failures.push(`  ${label}: expected silence, got: ${output.slice(0, 120)}`);
  } else if (!output.includes(expected)) {
    failures.push(`  ${label}: expected to mention "${expected}", got: ${output.slice(0, 200) || '(silence)'}`);
  }
};

// --- silence ----------------------------------------------------------------

check('complete monorepo baseline', project(), null);
check('complete backend-only baseline', project(() => {}, 'root'), null);

// Not a Laravel project at all: an empty directory, and a PHP project that has
// a composer.json but no artisan. Neither may produce a word.
check('empty directory', mkdtempSync(path.join(tmpdir(), 'jvd-backend-')), null);
check(
  'composer project without artisan',
  project((root, backend) => rmSync(path.join(backend, 'artisan'))),
  null,
);

// --- lang parity ------------------------------------------------------------

check(
  'lang file missing from a non-base locale',
  project((root, backend) => rmSync(path.join(backend, 'lang/uk/crud.php'))),
  'lang/uk/ is missing crud.php',
);
check(
  'several lang files missing',
  project((root, backend) => {
    rmSync(path.join(backend, 'lang/uk/crud.php'));
    rmSync(path.join(backend, 'lang/uk/entity.php'));
  }),
  'missing crud.php, entity.php',
);
// A file the base locale does not have is not a parity gap — en falls back to
// nothing, so an extra uk file breaks no key.
check(
  'extra file in a non-base locale is not a gap',
  project((root, backend) => write(backend, 'lang/uk/extra.php', '<?php return [];')),
  null,
);
// One locale cannot be out of parity with itself.
check(
  'single locale',
  project((root, backend) => rmSync(path.join(backend, 'lang/uk'), { recursive: true })),
  null,
);

// --- baseline gaps ----------------------------------------------------------

check(
  'no phpstan.neon',
  project((root, backend) => rmSync(path.join(backend, 'phpstan.neon'))),
  'no phpstan.neon',
);
check(
  'no app/Services',
  project((root, backend) => rmSync(path.join(backend, 'app/Services'), { recursive: true })),
  'no app/Services/',
);
check(
  'no Larastan',
  project((root, backend) =>
    write(backend, 'composer.json', JSON.stringify({ 'require-dev': { 'laravel/pint': '^1.30' }, scripts: { analyse: [] } })),
  ),
  'no Larastan',
);
check(
  'suite is only the stock ExampleTest',
  project((root, backend) => rmSync(path.join(backend, 'tests/Feature/OrderTest.php'))),
  'stock ExampleTest',
);
check(
  'no backend CI workflow',
  project((root) => rmSync(path.join(root, '.github/workflows/backend.yml'))),
  'no CI workflow for the backend',
);
// No .github at all is a project that does not use GitHub Actions, not a gap.
check(
  'no .github directory',
  project((root) => rmSync(path.join(root, '.github'), { recursive: true })),
  null,
);
check(
  'Makefile drives the frontend only',
  project((root) => write(root, 'Makefile', 'test:\n\t$(COMPOSE) exec -T frontend yarn test\n')),
  'covers the frontend only',
);
// A Makefile that never mentions yarn is not a frontend-only gate.
check(
  'Makefile with no frontend targets',
  project((root) => write(root, 'Makefile', 'up:\n\tdocker compose up -d\n')),
  null,
);

// --- failing open -----------------------------------------------------------

check(
  'malformed composer.json does not crash',
  project((root, backend) => write(backend, 'composer.json', '{ not json')),
  // Everything composer.json would have answered goes quiet; the checks that
  // read the filesystem still work, so the report is about Larastan and Pint.
  'no Larastan',
);

for (const root of roots) rmSync(root, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAIL - ${failures.length}/${roots.length} cases wrong:`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`ok - ${roots.length}/${roots.length} detect-setup cases pass`);
