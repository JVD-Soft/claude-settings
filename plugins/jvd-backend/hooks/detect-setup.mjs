#!/usr/bin/env node
/**
 * SessionStart: says what the backend baseline is missing, once, at the top of
 * the session.
 *
 * Same reasoning as the frontend hook: nobody opens a Laravel project thinking
 * "I wonder whether static analysis is wired up" — they find out when a change
 * needs a guard rail and there is none, deep into the task.
 *
 * The check that earns this hook on its own is `lang/` parity. A translation
 * key present in one locale directory and absent from another renders as the
 * literal key string at runtime, silently: no exception, no log line, no test
 * failure. Nothing else in the stack looks at it. File-level parity is the
 * cheap version of that check — comparing keys would mean evaluating PHP — and
 * it catches the common case, which is a whole file that was never translated.
 *
 * Runs on every session, so it stays cheap: readdir and one composer.json
 * parse, no PHP process. Silent when the baseline is in place — an
 * unconditional message is one everyone learns to skip.
 *
 * Fails open. A crash here would block the session start for a report.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const dirEntries = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

try {
  /**
   * Two layouts, both real. A monorepo keeps Laravel under `backend/`; a
   * backend-only project has it at the repo root. Look for both
   * rather than assuming the monorepo — this plugin is meant to be enabled on
   * its own, without jvd-frontend.
   */
  let root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  let backend = null;
  for (let up = 0; up < 4; up += 1) {
    if (existsSync(path.join(root, 'backend/artisan'))) {
      backend = path.join(root, 'backend');
      break;
    }
    if (existsSync(path.join(root, 'artisan'))) {
      backend = root;
      break;
    }
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }

  // `artisan` rather than composer.json: this must not fire on every PHP
  // project that happens to be open, only on a Laravel one.
  if (!backend) say('');

  const inBackend = (relative) => existsSync(path.join(backend, relative));
  const missing = [];
  const note = (condition, what) => {
    if (condition) missing.push(what);
  };

  let composer = {};
  try {
    composer = JSON.parse(readFileSync(path.join(backend, 'composer.json'), 'utf8'));
  } catch {
    // A malformed or absent composer.json is its own problem and not this
    // hook's to report; the dependency checks below simply stay quiet.
  }
  const dev = composer['require-dev'] ?? {};
  const scripts = composer.scripts ?? {};

  note(
    !inBackend('phpstan.neon') && !inBackend('phpstan.neon.dist'),
    'no phpstan.neon — nothing statically checks the backend',
  );
  note(
    !dev['larastan/larastan'],
    'no Larastan — PHPStan alone does not understand Eloquent, so a model call resolves to `mixed` and checks nothing',
  );
  note(!dev['laravel/pint'], 'no Pint — formatting is whatever each editor did');
  note(
    !scripts.analyse && !scripts.analyze,
    'composer.json defines no `analyse` script, so the container-only PHPStan invocation is not written down anywhere',
  );
  note(
    !inBackend('app/Services'),
    'no app/Services/ — without it the Eloquent work lands in controllers, which is the one rule this stack is built around',
  );

  /**
   * The suite exists in every fresh Laravel copy, so its presence proves
   * nothing — the stock `ExampleTest` asserts that `/` returns 200. Report an
   * empty suite by what is actually in it.
   */
  const featureTests = dirEntries(path.join(backend, 'tests/Feature'))
    .filter((entry) => entry.isFile() && entry.name.endsWith('Test.php'))
    .map((entry) => entry.name)
    .filter((name) => name !== 'ExampleTest.php');
  note(
    featureTests.length === 0,
    'tests/Feature holds nothing but Laravel\'s stock ExampleTest, so `php artisan test` being green means nothing',
  );

  /**
   * lang/ parity. The base is `en` when it exists — that is the fallback locale
   * in every project here — otherwise the directory with the most files, so a
   * project whose primary language is not English still gets a useful answer
   * instead of an arbitrary one.
   */
  const langDir = path.join(backend, 'lang');
  const locales = dirEntries(langDir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const filesOf = (locale) =>
    new Set(
      dirEntries(path.join(langDir, locale))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.php'))
        .map((entry) => entry.name),
    );

  if (locales.length > 1) {
    const counts = new Map(locales.map((locale) => [locale, filesOf(locale)]));
    const base = locales.includes('en')
      ? 'en'
      : [...counts.entries()].sort((a, b) => b[1].size - a[1].size)[0][0];

    for (const locale of locales) {
      if (locale === base) continue;
      const absent = [...counts.get(base)].filter((file) => !counts.get(locale).has(file)).sort();
      if (absent.length > 0) {
        note(
          true,
          `lang/${locale}/ is missing ${absent.join(', ')} (present in lang/${base}/) — ` +
            `those keys render as the literal key string at runtime, silently`,
        );
      }
    }
  }

  // Repo-level, so these are checked against `root`, not `backend`.
  const hasBackendCi = dirEntries(path.join(root, '.github/workflows')).some((entry) =>
    /backend|php|laravel/i.test(entry.name),
  );
  note(
    existsSync(path.join(root, '.github/workflows')) && !hasBackendCi,
    'no CI workflow for the backend — every gate the project has runs on the frontend only',
  );

  /**
   * A Makefile that drives the frontend gate and stops there is the shape this
   * stack keeps ending up in: `make check` is green while nothing has looked at
   * the PHP. Only report it when there IS a Makefile doing frontend work —
   * otherwise this is a project that never used make, which is not a gap.
   */
  const makefile = path.join(root, 'Makefile');
  if (existsSync(makefile)) {
    const text = readFileSync(makefile, 'utf8');
    note(
      /\byarn\b/.test(text) && !/\b(artisan|composer|pint|phpstan)\b/.test(text),
      '`make check` covers the frontend only — no target runs pint, PHPStan or the PHP tests',
    );
  }

  if (missing.length === 0) say('');

  say(
    `This project's backend is missing part of the JVD-Soft baseline:\n` +
      missing.map((item) => `- ${item}`).join('\n') +
      `\n\nThe conventions these protect are in the jvd-backend:laravel-api-endpoint ` +
      `skill. There is no backend scaffolder, so each of these is a deliberate ` +
      `change — offer it if the user's task touches one, and do not run anything unprompted.`,
  );
} catch {
  process.exit(0);
}
