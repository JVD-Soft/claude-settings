#!/usr/bin/env node
/**
 * Brings a project's frontend up to the JVD-Soft stack baseline: the test
 * harness, error boundaries, safe storage, SEO/prerender, PWA, nginx snippets
 * and CI that every project on this stack needs and none of them should be
 * writing by hand.
 *
 * A script rather than instructions to the model, for one reason: instructions
 * cost tokens every time they are read, and this is ~3 000 lines of file
 * content. Here it costs the report below and nothing else.
 *
 * Three policies, because "copy the files" is wrong for most of them:
 *
 *   own    — the plugin owns it. Written when absent; when it exists and
 *            differs, reported as drift and left alone unless --force.
 *   seed   — a starting point the project then owns. Written only when absent.
 *   merge  — the project owns the file; specific keys or lines are added
 *            without touching anything else.
 *
 * Nothing is deleted, ever, and every run is idempotent.
 *
 * `--brand` is a separate mode: it renames an existing project instead of
 * scaffolding one, because the eight project values reach a fork through files
 * that already exist and are therefore never written.
 *
 * Usage:
 *   node scaffold.mjs [--dry-run] [--force] [--accept] [--root DIR] [--set KEY=VALUE]...
 *   node scaffold.mjs --brand [--dry-run] [--root DIR] [--set KEY=VALUE]...
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = path.join(skillDir, 'template');
const startersDir = path.join(skillDir, 'starters');
const partsDir = path.join(skillDir, 'parts');

// --- arguments --------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

const dryRun = flag('dry-run');
const force = flag('force');
/**
 * Records the current template version for seeded files without touching them:
 * "I have looked at this difference and the project's version is right."
 *
 * Without it a project that legitimately diverges — its own routes, its own
 * manifest — is told about the same five files on every run, and the report
 * becomes something to skip past. After --accept, only a *later* template
 * change speaks up.
 */
const accept = flag('accept');

// --- project variables ------------------------------------------------------

/**
 * Read from CLAUDE_PLUGIN_OPTION_* rather than ${user_config.*}: substitution
 * into a shell-form command is rejected by Claude Code, because the value would
 * reach the shell unquoted.
 */
const DEFAULTS = {
  APP_NAME: 'App',
  APP_SHORT_NAME: 'App',
  APP_DESCRIPTION: 'Application starter.',
  SITE_URL: 'http://localhost',
  LANG: 'en',
  THEME_COLOR_LIGHT: '#ffffff',
  THEME_COLOR_DARK: '#09090b',
  PWA_CATEGORIES: '["productivity"]',
};

const vars = { ...DEFAULTS };
const source = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, 'default']));
for (const key of Object.keys(DEFAULTS)) {
  const env = process.env[`CLAUDE_PLUGIN_OPTION_${key}`];
  if (env) {
    vars[key] = env;
    source[key] = 'plugin option';
  }
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--set') continue;
  const [key, ...rest] = (argv[i + 1] ?? '').split('=');
  if (key && key in vars) {
    vars[key] = rest.join('=');
    source[key] = '--set';
  }
}

// SITE_URL ends up in canonical URLs and the sitemap, where a trailing slash
// produces `https://example.com//about`.
vars.SITE_URL = vars.SITE_URL.replace(/\/+$/, '');

const substitute = (text) =>
  text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));

// --- project root -----------------------------------------------------------

const looksLikeRoot = (dir) =>
  existsSync(path.join(dir, 'frontend', 'package.json')) ||
  (existsSync(path.join(dir, 'docker-compose.yml')) && existsSync(path.join(dir, 'frontend')));

const findRoot = () => {
  const explicit = value('root');
  if (explicit) return path.resolve(explicit);
  let dir = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  for (let up = 0; up < 6; up++) {
    if (looksLikeRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const root = findRoot();
if (!root) {
  console.error(
    'scaffold: no project root found. Expected a directory containing frontend/package.json.\n' +
      'Pass --root DIR to say where it is.',
  );
  process.exit(2);
}

// --- report -----------------------------------------------------------------

const created = [];
const updated = [];
const merged = [];
const unchanged = [];
const reconcile = [];
const accepted = [];
const manual = [];

const digest = (text) => createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex');

const write = (relative, content) => {
  const target = path.join(root, relative);
  const existed = existsSync(target);
  if (existed && digest(readFileSync(target, 'utf8')) === digest(content)) {
    unchanged.push(relative);
    return;
  }
  if (!dryRun) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  (existed ? updated : created).push(relative);
};

/**
 * Records which template version each seed file was adopted from.
 *
 * Without it there is no way to tell "the project edited this" from "the
 * project predates this version of the template" — the two look identical on
 * disk and want opposite handling. The stamp holds template digests, not the
 * project's, so a local edit never makes the entry go stale.
 */
const STAMP = 'frontend/.jvd-scaffold.json';
const stampFile = path.join(root, STAMP);
const stamp = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : { files: {} };
stamp.files ??= {};

const writeStamp = () => {
  if (dryRun) return;
  stamp.updatedBy = 'jvd-frontend:scaffold';
  mkdirSync(path.dirname(stampFile), { recursive: true });
  writeFileSync(stampFile, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
};

const section = (title, items) => {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length})`);
  for (const item of items) console.log(`  ${item}`);
};

// --- brand ------------------------------------------------------------------

if (flag('brand')) {
  /**
   * Renames a fork.
   *
   * The eight values reach a *new* project through the template. On a fork they
   * reach nothing: index.html, app.html and vite.config.ts are seeded and
   * config/index.ts is a starter, so all four already exist and the scaffolder
   * correctly leaves them alone. Without this mode a fork ships with
   * `<title>App</title>` and `"name":"App"` in its manifest, and no test looks
   * at either.
   *
   * So this rewrites the same slots in place. It creates nothing and merges
   * nothing — mixing that into a normal run would make a rename look like a
   * scaffold.
   */
  const SHELLS = ['frontend/index.html', 'frontend/app.html'];

  // Each slot: the value it carries, the file, and a pattern of exactly three
  // groups — prefix, current value, suffix — so the value is replaced without
  // the pattern having to reproduce it.
  const SLOTS = [
    ...SHELLS.flatMap((file) => [
      { key: 'APP_NAME', file, quote: 'html-text', find: /(<title>)([^<]*)(<\/title>)/g },
      { key: 'APP_DESCRIPTION', file, quote: 'html-attr', find: /(<meta name="description" content=")([^"]*)(")/g },
      { key: 'LANG', file, quote: 'html-attr', find: /(<html lang=")([^"]*)(")/g },
      { key: 'THEME_COLOR_LIGHT', file, quote: 'html-attr', find: /(<meta name="theme-color" media="\(prefers-color-scheme: light\)" content=")([^"]*)(")/g },
      { key: 'THEME_COLOR_DARK', file, quote: 'html-attr', find: /(<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content=")([^"]*)(")/g },
    ]),

    { key: 'APP_NAME', file: 'frontend/src/config/index.ts', quote: 'js-single', find: /(\n\s+NAME: ')([^']*)(')/g },
    { key: 'APP_DESCRIPTION', file: 'frontend/src/config/index.ts', quote: 'js-single', find: /(\n\s+DESCRIPTION: ')([^']*)(')/g },
    { key: 'SITE_URL', file: 'frontend/src/config/index.ts', quote: 'js-single', find: /(VITE_SITE_URL \?\? ')([^']*)(')/g },

    // `\n\s+name: "` cannot match the short_name line: after the whitespace the
    // next character is `s`, not `n`.
    { key: 'APP_NAME', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+name: ")([^"]*)(")/g },
    { key: 'APP_SHORT_NAME', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+short_name: ")([^"]*)(")/g },
    { key: 'APP_DESCRIPTION', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+description: ")([^"]*)(")/g },
    { key: 'LANG', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+lang: ")([^"]*)(")/g },
    // Same value, two manifest fields — labelled so the report does not print
    // the same line twice and look like a duplicate.
    { key: 'THEME_COLOR_LIGHT', as: 'theme_color', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+theme_color: ")([^"]*)(")/g },
    { key: 'THEME_COLOR_LIGHT', as: 'background_color', file: 'frontend/vite.config.ts', quote: 'js-double', find: /(\n\s+background_color: ")([^"]*)(")/g },
    { key: 'PWA_CATEGORIES', file: 'frontend/vite.config.ts', quote: 'raw', find: /(\n\s+categories: )(\[[^\]]*\])(,)/g },

    // Anchored on `VITE_SITE_URL ?? '`, not on how it is read: the script moved
    // from `process.env` to `loadEnv()` and the old anchor stopped matching,
    // which --brand reports as a skip rather than an error.
    { key: 'SITE_URL', file: 'frontend/scripts/prerender.mjs', quote: 'js-single', find: /(VITE_SITE_URL \?\? ')([^']*)(')/g },
    { key: 'SITE_URL', file: 'frontend/.env.example', quote: 'raw', find: /(^VITE_SITE_URL=)([^\n]*)()$/gm },
  ];

  /**
   * The value lands inside a quoted literal, so it has to be escaped for the
   * kind of literal it lands in. Refusing apostrophes instead would rule out
   * half the plausible product names.
   */
  const escapeFor = (quote, raw) => {
    switch (quote) {
      case 'html-text':
        return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      case 'html-attr':
        return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      case 'js-single':
        return raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      case 'js-double':
        return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      default:
        return raw;
    }
  };

  // Branding to the template's own defaults is a no-op that reads as success.
  if (vars.APP_NAME === DEFAULTS.APP_NAME) {
    console.error(
      'scaffold --brand: APP_NAME is still "App". Set the project\'s real name — in the\n' +
        'plugin configuration, or with --set APP_NAME=… for a trial run. Renaming a fork to\n' +
        'the template\'s default would report success and change nothing.',
    );
    process.exit(2);
  }
  try {
    const categories = JSON.parse(vars.PWA_CATEGORIES);
    if (!Array.isArray(categories)) throw new Error('not an array');
  } catch {
    console.error(`scaffold --brand: PWA_CATEGORIES must be a JSON array literal, got ${vars.PWA_CATEGORIES}`);
    process.exit(2);
  }

  const changes = [];
  const already = [];
  const skipped = [];
  const edits = new Map();

  for (const slot of SLOTS) {
    const target = path.join(root, slot.file);
    if (!existsSync(target)) {
      skipped.push(`${slot.file} — missing, so ${slot.as ?? slot.key} has nowhere to go here.`);
      continue;
    }

    const label = `${slot.file} — ${slot.as ?? slot.key}`;
    const before = edits.get(slot.file) ?? readFileSync(target, 'utf8');
    const matches = [...before.matchAll(slot.find)];
    if (matches.length !== 1) {
      // Zero means the file was rewritten past recognition; two means the
      // pattern is ambiguous. Guessing which one to take is worse than saying so.
      skipped.push(
        `${label}: ${matches.length === 0 ? 'no anchor found' : `${matches.length} anchors match`}. Set it by hand.`,
      );
      continue;
    }

    const current = matches[0][2];
    const wanted = escapeFor(slot.quote, vars[slot.key]);
    if (current === wanted) {
      already.push(label);
      continue;
    }

    edits.set(slot.file, before.replace(slot.find, (_m, prefix, _old, suffix) => `${prefix}${wanted}${suffix}`));
    changes.push(`${label}: ${JSON.stringify(current)} → ${JSON.stringify(wanted)}`);
  }

  if (!dryRun) {
    for (const [relative, content] of edits) {
      writeFileSync(path.join(root, relative), content, 'utf8');
    }
    stamp.identity = { ...vars };
    writeStamp();
  }

  console.log(`scaffold --brand${dryRun ? ' --dry-run' : ''} → ${root}`);
  section(dryRun ? 'would rewrite' : 'rewritten', changes);
  section('already correct', already);
  section('could not place', skipped);

  // Outside the frontend, so outside this plugin — but a fork that skips them
  // collides with its own template: docker-compose derives container names from
  // ${APP_NAME}, so two unrenamed forks fight over the same containers.
  section('not touched — backend and repo identity, do these by hand', [
    'backend/.env.example — APP_NAME (also names the Docker containers via ${APP_NAME}-backend), APP_URL, DB_DATABASE',
    'README.md, AGENTS.md — they describe this codebase by name',
    'git remote — a fresh fork still points at the template',
  ]);

  console.log(
    dryRun
      ? '\nnothing was written.'
      : '\nnext: cd frontend && yarn test && yarn build — shells.test.ts is the guard that index.html and app.html stayed in step.',
  );
  process.exit(0);
}

// --- own + seed -------------------------------------------------------------

const walk = (dir, base = dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full, base)
      : [path.relative(base, full).split(path.sep).join('/')];
  });

/**
 * Files the project edits after they land — the route list, the PWA manifest,
 * the nginx prefixes. Overwriting one destroys a decision the script has no way
 * to reconstruct, so they are seeded once and then belong to the project.
 */
const SEEDED = new Set([
  'frontend/vite.config.ts',
  'frontend/scripts/prerender.mjs',
  'frontend/index.html',
  'frontend/app.html',
  'frontend/eslint.config.js',
  'frontend/src/lib/structuredData.ts',
  'docker/nginx/conf.d/default.conf',
  'docker/frontend/Dockerfile',
]);

/**
 * Seeded, and the project already has a file there. Three different situations
 * that look the same on disk, told apart by the stamp.
 */
const seed = (relative, content, templateDigest, { once = false } = {}) => {
  const target = path.join(root, relative);

  if (!existsSync(target)) {
    write(relative, content);
    stamp.files[relative] = templateDigest;
    return;
  }
  if (digest(readFileSync(target, 'utf8')) === digest(content)) {
    unchanged.push(relative);
    stamp.files[relative] = templateDigest;
    return;
  }
  // A starter is a first draft, not something to keep in step. entry-prerender's
  // provider stack differs in every project by design — reporting that as drift
  // on every run is noise that trains people to skim the report.
  if (once && !force) {
    unchanged.push(relative);
    return;
  }
  if (force) {
    write(relative, content);
    stamp.files[relative] = templateDigest;
    return;
  }
  const adopted = stamp.files[relative];
  if (accept) {
    stamp.files[relative] = templateDigest;
    accepted.push(relative);
  } else if (!adopted) {
    reconcile.push(`${relative} — the project has its own; the template's differs. Diff them, then --force to take the template's or --accept to keep the project's.`);
  } else if (adopted !== templateDigest) {
    reconcile.push(`${relative} — the template changed since this project adopted it. Diff, then --force or --accept.`);
  } else {
    unchanged.push(relative);
  }
};

for (const relative of walk(templateDir)) {
  const raw = readFileSync(path.join(templateDir, relative), 'utf8');
  const content = substitute(raw);
  // Digest the raw template, before substitution: otherwise renaming the app
  // would read as a template change in every project.
  if (SEEDED.has(relative)) seed(relative, content, digest(raw));
  else write(relative, content);
}

for (const relative of walk(startersDir)) {
  const raw = readFileSync(path.join(startersDir, relative), 'utf8');
  seed(relative, substitute(raw), digest(raw), { once: true });
}

// --- merge: package.json ----------------------------------------------------

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const mergePackageJson = () => {
  const relative = 'frontend/package.json';
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    manual.push(`${relative} is missing — run \`yarn create vite\` first, then re-run this.`);
    return;
  }

  const spec = readJson(path.join(partsDir, 'package.json'));
  const pkg = readJson(target);
  const before = JSON.stringify(pkg);
  const notes = [];

  for (const [key, wanted] of Object.entries(spec.set)) {
    if (JSON.stringify(pkg[key]) !== JSON.stringify(wanted)) {
      pkg[key] = wanted;
      notes.push(key);
    }
  }

  // Scripts win: they encode the pipeline. `build` that skips the prerender or
  // `lint` without --max-warnings 0 is the difference between CI catching a
  // regression and not.
  pkg.scripts ??= {};
  for (const [name, command] of Object.entries(spec.scripts)) {
    if (pkg.scripts[name] === command) continue;
    if (pkg.scripts[name]) notes.push(`scripts.${name} (was: ${pkg.scripts[name]})`);
    else notes.push(`scripts.${name}`);
    pkg.scripts[name] = command;
  }

  // Dependencies never win: a project may legitimately be ahead, and moving a
  // pin under it would be a silent downgrade.
  for (const field of ['dependencies', 'devDependencies']) {
    pkg[field] ??= {};
    for (const [name, range] of Object.entries(spec[field] ?? {})) {
      if (!pkg[field][name]) {
        pkg[field][name] = range;
        notes.push(`${field}.${name}`);
      } else if (pkg[field][name] !== range) {
        manual.push(`${relative}: ${name} is ${pkg[field][name]}, template expects ${range} — verified against the template's version, check before assuming it is fine.`);
      }
    }
    pkg[field] = Object.fromEntries(Object.entries(pkg[field]).sort(([a], [b]) => a.localeCompare(b)));
  }

  for (const name of spec.remove.dependencies) {
    if (pkg.dependencies?.[name]) {
      delete pkg.dependencies[name];
      notes.push(`-dependencies.${name}`);
    }
  }
  for (const name of spec.remove.resolutions) {
    if (pkg.resolutions?.[name]) {
      delete pkg.resolutions[name];
      notes.push(`-resolutions.${name}`);
    }
    if (pkg.resolutions && Object.keys(pkg.resolutions).length === 0) delete pkg.resolutions;
  }
  // The react/react-dom pins usually exist only to drag a stale dependency onto
  // React 19, and outlive it. Removing them blindly is not the script's call.
  if (pkg.resolutions?.react || pkg.resolutions?.['react-dom']) {
    manual.push(`${relative}: resolutions still pin react/react-dom. They were usually added to force one stale package onto React 19 — check whether anything still needs them, and drop the block if not.`);
  }

  if (JSON.stringify(pkg) === before) {
    unchanged.push(relative);
    return;
  }
  if (!dryRun) writeFileSync(target, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  merged.push(`${relative} — ${notes.join(', ')}`);
  manual.push(`${relative} changed: run \`yarn install\` in frontend/ to update the lockfile.`);
};

// --- merge: line-append files ----------------------------------------------

/** Appends only the lines that are not already there, comments included. */
const appendMissingLines = (relative, partFile, { createIfMissing = false } = {}) => {
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    if (!createIfMissing) {
      manual.push(`${relative} is missing — nothing to merge into.`);
      return;
    }
    write(relative, substitute(readFileSync(path.join(partsDir, partFile), 'utf8')).trimStart());
    return;
  }

  const current = readFileSync(target, 'utf8');
  const wanted = substitute(readFileSync(path.join(partsDir, partFile), 'utf8'));
  const existing = new Set(current.split('\n').map((line) => line.trim()));

  // A comment alone is not a reason to append; only add the block when at least
  // one real line from it is missing.
  const lines = wanted.split('\n');
  const meaningful = lines.filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (meaningful.every((line) => existing.has(line.trim()))) {
    unchanged.push(relative);
    return;
  }

  const next = `${current.replace(/\s*$/, '')}\n\n${wanted.trim()}\n`;
  if (!dryRun) writeFileSync(target, next, 'utf8');
  merged.push(`${relative} — ${meaningful.filter((l) => !existing.has(l.trim())).length} line(s)`);
};

// --- merge: locales ---------------------------------------------------------

const deepMerge = (into, from) => {
  let changed = false;
  for (const [key, incoming] of Object.entries(from)) {
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
      if (!into[key] || typeof into[key] !== 'object') {
        into[key] = {};
        changed = true;
      }
      if (deepMerge(into[key], incoming)) changed = true;
    } else if (!(key in into)) {
      // A key that exists is a translation someone wrote. Never overwrite it.
      into[key] = incoming;
      changed = true;
    }
  }
  return changed;
};

const mergeLocales = () => {
  const localesDir = path.join(root, 'frontend/src/locales');
  if (!existsSync(localesDir)) {
    manual.push('frontend/src/locales is missing — i18next is not set up in this project.');
    return;
  }
  for (const file of readdirSync(partsDir + '/locales')) {
    const lang = path.basename(file, '.json');
    const relative = `frontend/src/locales/${lang}/translation.json`;
    const target = path.join(root, relative);
    if (!existsSync(target)) {
      manual.push(`${relative} is missing — the "${lang}" locale is not registered in src/i18n.ts.`);
      continue;
    }
    const translation = readJson(target);
    if (!deepMerge(translation, readJson(path.join(partsDir, 'locales', file)))) {
      unchanged.push(relative);
      continue;
    }
    if (!dryRun) writeFileSync(target, `${JSON.stringify(translation, null, 2)}\n`, 'utf8');
    merged.push(`${relative} — errors.*, pwa.*`);
  }

  // Every other locale the project registered needs the same keys, and only a
  // human can write them. Directories only: `src/locales` also holds
  // `locales.test.ts`, and a file read as a language name asks for
  // `locales.test.ts/translation.json`.
  const known = new Set(readdirSync(partsDir + '/locales').map((f) => path.basename(f, '.json')));
  for (const entry of readdirSync(localesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || known.has(entry.name)) continue;
    manual.push(`frontend/src/locales/${entry.name}/translation.json — add errors.* and pwa.* by hand; there is no template for "${entry.name}".`);
  }
};

// --- merge: CSS tokens ------------------------------------------------------

const mergeCssTokens = () => {
  const relative = 'frontend/src/index.css';
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    manual.push(`${relative} is missing — add the --warning and --destructive-foreground tokens wherever the palette lives.`);
    return;
  }

  const spec = readJson(path.join(partsDir, 'css-tokens.json'));
  let css = readFileSync(target, 'utf8');

  // A body painted with literals ignores every theme change made in :root —
  // the tokens above it become decorative. Rewriting a stylesheet is not the
  // script's job, but not saying so would leave a bug nobody looks for.
  const body = /(^|\n)body\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  if (/background(-color)?:\s*(#|white|black|rgb)/i.test(body)) {
    manual.push(`${relative}: \`body\` sets a literal background. Use \`var(--background)\` and \`var(--foreground)\`, and delete any \`.dark body\` override — otherwise the page ignores the palette.`);
  }

  if (css.includes(spec.probe)) {
    unchanged.push(relative);
    return;
  }

  const added = [];
  for (const [selector, declarations] of Object.entries(spec.blocks)) {
    const open = css.indexOf(`${selector} {`);
    if (open === -1) {
      manual.push(`${relative}: no \`${selector}\` block — add ${declarations.filter((d) => !d.startsWith('/*')).join(' ')} by hand.`);
      continue;
    }
    const close = css.indexOf('}', open);
    if (close === -1) continue;
    const body = `${declarations.map((d) => `  ${d}`).join('\n')}\n`;
    css = `${css.slice(0, close)}${body}${css.slice(close)}`;
    added.push(selector);
  }

  if (added.length === 0) return;
  if (!dryRun) writeFileSync(target, css, 'utf8');
  merged.push(`${relative} — tokens in ${added.join(', ')}`);
};

// --- merge: Makefile --------------------------------------------------------

const mergeMakefile = () => {
  const relative = 'Makefile';
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    write(relative, `COMPOSE=docker compose --env-file backend/.env\n${readFileSync(path.join(partsDir, 'makefile.txt'), 'utf8').trimStart()}`);
    return;
  }

  const current = readFileSync(target, 'utf8');

  // Compose v1 is gone from current Docker installs, so a hardcoded
  // `docker-compose` makes every target fail with "command not found".
  if (/^COMPOSE\s*=\s*docker-compose\b/m.test(current)) {
    manual.push(`${relative}: COMPOSE is pinned to \`docker-compose\` (v1, removed from current Docker). Detect it: \`DOCKER_COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")\`.`);
  }

  if (/^check:/m.test(current)) {
    unchanged.push(relative);
    return;
  }
  if (!/^COMPOSE\s*=/m.test(current)) {
    manual.push(`${relative}: no COMPOSE variable — the appended targets call $(COMPOSE), point it at your compose invocation.`);
  }
  const next = `${current.replace(/\s*$/, '')}\n${readFileSync(path.join(partsDir, 'makefile.txt'), 'utf8')}`;
  if (!dryRun) writeFileSync(target, next, 'utf8');
  merged.push(`${relative} — lint, typecheck, test, build-fr, check`);
};

// --- merge: docker-compose --------------------------------------------------

const mergeCompose = () => {
  const relative = 'docker-compose.yml';
  const target = path.join(root, relative);
  if (!existsSync(target)) {
    manual.push(`${relative} is missing — mount docker/nginx/snippets into the nginx container yourself.`);
    return;
  }

  const compose = readFileSync(target, 'utf8');
  const mount = './docker/nginx/snippets:/etc/nginx/snippets:ro';
  if (compose.includes(mount)) {
    unchanged.push(relative);
    return;
  }

  const lines = compose.split('\n');
  // Anchored on the conf.d mount rather than on the service name: nothing
  // guarantees the nginx service is called "nginx", but a project that has
  // default.conf mounted has exactly one place this line belongs.
  const anchor = lines.findIndex((line) =>
    line.includes('docker/nginx/conf.d/default.conf:/etc/nginx/conf.d/default.conf'),
  );
  if (anchor === -1) {
    manual.push(`${relative}: no default.conf mount found — add \`- ${mount}\` to the nginx service by hand.`);
    return;
  }

  const indent = /^(\s*-\s)/.exec(lines[anchor])?.[1] ?? '            - ';
  lines.splice(anchor + 1, 0, `${indent}${mount}`);
  if (!dryRun) writeFileSync(target, lines.join('\n'), 'utf8');
  merged.push(`${relative} — snippets mount`);
};

// --- run --------------------------------------------------------------------

mergePackageJson();
appendMissingLines('frontend/.gitignore', 'gitignore.txt', { createIfMissing: true });
appendMissingLines('frontend/.env.example', 'env.example.txt', { createIfMissing: true });
mergeLocales();
mergeCssTokens();
mergeMakefile();
mergeCompose();

// Decisions the script cannot make. Kept here rather than in the skill body so
// the model reads them only when a run actually happens.
const DECISIONS = [
  'frontend/src/entry-prerender.tsx — the provider stack must mirror App.tsx. A missing provider does not throw; the page renders its Suspense fallback and the build fails with "fell back to Suspense".',
  'frontend/scripts/prerender.mjs — ROUTES must list only eager, public routes. A lazy() route prerenders as a spinner.',
  'frontend/scripts/prerender.mjs — the Disallow list in robots() is this project\'s private sections.',
  'frontend/vite.config.ts BACKEND_PATHS and the `^/(api|sanctum|…)` location in docker/nginx/conf.d/default.conf are one list in two files. Out of step, the service worker answers /admin with the SPA shell and it stops opening for anyone who loaded the app once.',
  'frontend/src/lib/structuredData.ts — SearchAction.urlTemplate needs the real search route and query parameter, or drop potentialAction entirely.',
  'frontend/src/providers/UIProvider.tsx — needs a <Toaster />; PwaUpdatePrompt is a toast and silently never appears without one.',
  'frontend/src/i18n.ts — read the stored language through safeStorage, not localStorage: i18n initialises at module scope, where the prerender has no localStorage at all.',
  'frontend/src/routes.tsx — public routes eager, guarded routes lazy. This is what makes both code-splitting and the prerender work.',
  'frontend/public/ — pwa-64/192/512, maskable-512, apple-touch-icon-180, favicon.svg/.ico. The manifest is invalid without them and no placeholder should ship as someone\'s app icon.',
  'PWA manifest shortcuts and screenshots are product decisions; screenshots are what turn the install prompt into a rich one.',
];

writeStamp();

console.log(`scaffold${dryRun ? ' --dry-run' : ''}${force ? ' --force' : ''} → ${root}`);
console.log(
  `variables: ${Object.entries(vars)
    .map(([k, v]) => `${k}=${v} [${source[k]}]`)
    .join(', ')}`,
);

section(dryRun ? 'would create' : 'created', created);
section(dryRun ? 'would overwrite' : 'overwritten (plugin-owned, previous content differed)', updated);
section(dryRun ? 'would merge' : 'merged', merged);
section('reconcile — seeded files the project already owns', reconcile);
section('accepted — the project keeps its version; only a later template change will report again', accepted);
section('needs a person', manual);
section('review these — the script cannot decide them', DECISIONS);
console.log(`\nalready current: ${unchanged.length} file(s)`);

if (dryRun) console.log('\nnothing was written.');
else console.log('\nnext: cd frontend && yarn install && yarn lint && yarn test && yarn build');
