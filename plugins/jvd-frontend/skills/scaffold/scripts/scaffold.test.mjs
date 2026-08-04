#!/usr/bin/env node
/**
 * Self-tests for scaffold.mjs.
 *
 * Every case here is a way the scaffolder could quietly damage a project rather
 * than fail: overwriting a translation someone wrote, downgrading a dependency,
 * appending the same block on every run. A scaffolder that errors is annoying;
 * one that silently edits is the reason people stop running it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scaffold = path.join(here, 'scaffold.mjs');

let passed = 0;
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const put = (root, relative, content) => {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
};

const read = (root, relative) => readFileSync(path.join(root, relative), 'utf8');

/** A project as it actually arrives: Vite's output plus this stack's shape. */
const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'jvd-scaffold-'));
  put(root, 'frontend/package.json', `${JSON.stringify({
    name: 'frontend',
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'tsc -b && vite build', lint: 'eslint .' },
    dependencies: { react: '^19.2.0', 'react-helmet-async': '^2.0.5', zod: '^4.9.9' },
    devDependencies: { vite: '^7.2.4' },
    resolutions: { react: '^19.2.0', 'react-helmet-async/react': '^19.2.0' },
  }, null, 2)}\n`);
  put(root, 'frontend/.gitignore', 'node_modules\ndist\n');
  put(root, 'frontend/.env.example', 'VITE_API_BASE_URL=http://localhost:80/api\n');
  put(root, 'frontend/src/locales/en/translation.json', `${JSON.stringify({
    login: 'Sign in',
    errors: { required: 'Please fill this in.' },
  }, null, 2)}\n`);
  put(root, 'frontend/src/locales/uk/translation.json', `${JSON.stringify({ login: 'Увійти' }, null, 2)}\n`);
  put(root, 'frontend/src/locales/pl/translation.json', `${JSON.stringify({ login: 'Zaloguj' }, null, 2)}\n`);
  put(root, 'frontend/src/index.css', ':root {\n  --background: oklch(1 0 0);\n}\n\nbody {\n  background-color: white;\n}\n\n@theme inline {\n  --color-background: var(--background);\n}\n\n.dark {\n  --background: oklch(0.1 0 0);\n}\n');
  put(root, 'docker-compose.yml', 'services:\n    nginx:\n        volumes:\n            - ./docker/nginx/conf.d/default.conf:/etc/nginx/conf.d/default.conf\n');
  put(root, 'Makefile', '# Переменные\nCOMPOSE=docker-compose --env-file backend/.env\n\nup:\n\t$(COMPOSE) up -d\n');
  return root;
};

const run = (root, ...args) =>
  execFileSync(process.execPath, [scaffold, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
  });

// --- substitution -----------------------------------------------------------

{
  const root = fixture();
  run(root, '--set', 'APP_NAME=Acme', '--set', 'SITE_URL=https://acme.test/', '--set', 'LANG=uk');

  const html = read(root, 'frontend/app.html');
  check('substitutes APP_NAME', html.includes('<title>Acme</title>'));
  check('substitutes LANG', html.includes('<html lang="uk">'));
  check('leaves no placeholder', !/\{\{[A-Z_]+\}\}/.test(html), html.match(/\{\{[A-Z_]+\}\}/)?.[0]);

  const config = read(root, 'frontend/src/config/index.ts');
  check(
    'strips the trailing slash from SITE_URL',
    config.includes("'https://acme.test'"),
    config.split('\n').find((l) => l.includes('SITE_URL:')),
  );

  const vite = read(root, 'frontend/vite.config.ts');
  check('PWA_CATEGORIES lands as an array literal', vite.includes('categories: ["productivity"]'));

  rmSync(root, { recursive: true, force: true });
}

// --- plugin options ---------------------------------------------------------

{
  const root = fixture();
  execFileSync(process.execPath, [scaffold, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_OPTION_APP_NAME: 'FromOption' },
  });
  check('reads CLAUDE_PLUGIN_OPTION_*', read(root, 'frontend/index.html').includes('<title>FromOption</title>'));
  rmSync(root, { recursive: true, force: true });
}

// --- idempotency ------------------------------------------------------------

{
  const root = fixture();
  run(root);
  const first = {
    pkg: read(root, 'frontend/package.json'),
    gitignore: read(root, 'frontend/.gitignore'),
    css: read(root, 'frontend/src/index.css'),
    compose: read(root, 'docker-compose.yml'),
    makefile: read(root, 'Makefile'),
    en: read(root, 'frontend/src/locales/en/translation.json'),
  };
  const second = run(root);
  for (const [name, before] of Object.entries(first)) {
    const relative = {
      pkg: 'frontend/package.json',
      gitignore: 'frontend/.gitignore',
      css: 'frontend/src/index.css',
      compose: 'docker-compose.yml',
      makefile: 'Makefile',
      en: 'frontend/src/locales/en/translation.json',
    }[name];
    check(`second run leaves ${relative} alone`, read(root, relative) === before);
  }
  check('second run writes nothing new', !/\ncreated \(/.test(second), second.split('\n').find((l) => l.startsWith('created')));
  check('second run merges nothing', !/\nmerged \(/.test(second), second.split('\n').find((l) => l.startsWith('merged')));
  rmSync(root, { recursive: true, force: true });
}

// --- package.json -----------------------------------------------------------

{
  const root = fixture();
  const out = run(root);
  const pkg = JSON.parse(read(root, 'frontend/package.json'));

  check('adds the missing devDependency', pkg.devDependencies.vitest !== undefined);
  check('build runs the prerender', pkg.scripts.build.includes('scripts/prerender.mjs'));
  check('lint fails on warnings', pkg.scripts.lint.includes('--max-warnings 0'));
  check('drops react-helmet-async', pkg.dependencies['react-helmet-async'] === undefined);
  check('drops its resolution', pkg.resolutions?.['react-helmet-async/react'] === undefined);
  check('keeps the unrelated react resolution', pkg.resolutions?.react === '^19.2.0');
  check('reports the leftover react resolution', out.includes('resolutions still pin react/react-dom'));
  check('does not move a pin the project chose', pkg.dependencies.zod === '^4.9.9');
  check('sets packageManager', pkg.packageManager?.startsWith('yarn@4'));
  check('sets sideEffects', Array.isArray(pkg.sideEffects) && pkg.sideEffects.includes('./src/i18n.ts'));

  rmSync(root, { recursive: true, force: true });
}

// --- locales ----------------------------------------------------------------

{
  const root = fixture();
  const out = run(root);
  const en = JSON.parse(read(root, 'frontend/src/locales/en/translation.json'));

  check('keeps the existing translation', en.errors.required === 'Please fill this in.');
  check('adds the missing sibling key', en.errors.crashed_title === 'Something went wrong');
  check('adds the pwa block', en.pwa.offline !== undefined);
  check('leaves unrelated keys alone', en.login === 'Sign in');
  check('reports a locale with no template', out.includes('locales/pl/translation.json'));

  rmSync(root, { recursive: true, force: true });
}

// --- css --------------------------------------------------------------------

{
  const root = fixture();
  const out = run(root);
  const css = read(root, 'frontend/src/index.css');

  check('adds --warning to :root', /:root \{[^}]*--warning:/s.test(css));
  check('adds --warning to .dark', /\.dark \{[^}]*--warning:/s.test(css));
  check('maps the token in @theme inline', css.includes('--color-warning: var(--warning);'));
  check('adds each token exactly once', (css.match(/--warning:/g) ?? []).length === 2);
  check('reports the literal body background', out.includes('`body` sets a literal background'));

  rmSync(root, { recursive: true, force: true });
}

// --- compose and Makefile ---------------------------------------------------

{
  const root = fixture();
  const out = run(root);

  const compose = read(root, 'docker-compose.yml');
  check('mounts the snippets', compose.includes('./docker/nginx/snippets:/etc/nginx/snippets:ro'));
  check(
    'keeps the mount indented with its neighbour',
    /\n {12}- \.\/docker\/nginx\/snippets/.test(compose),
    JSON.stringify(compose.split('\n').at(-2)),
  );

  const makefile = read(root, 'Makefile');
  check('appends the check target', /^check: lint typecheck test build-fr$/m.test(makefile));
  check('keeps the existing targets', makefile.includes('up:'));
  check('reports compose v1', out.includes('COMPOSE is pinned to `docker-compose`'));

  rmSync(root, { recursive: true, force: true });
}

// --- seeded files -----------------------------------------------------------

{
  const root = fixture();
  put(root, 'frontend/vite.config.ts', '// the project already had one\nexport default {};\n');
  const out = run(root);

  check(
    'does not overwrite a seeded file the project owns',
    read(root, 'frontend/vite.config.ts').includes('the project already had one'),
  );
  check('reports it for reconciliation', out.includes('reconcile'));

  const forced = run(root, '--force');
  check('--force takes the template', read(root, 'frontend/vite.config.ts').includes('VitePWA'));
  check('and stops reporting it', !forced.includes('the project has its own'));

  rmSync(root, { recursive: true, force: true });
}

{
  const root = fixture();
  put(root, 'frontend/vite.config.ts', '// the project already had one\nexport default {};\n');
  run(root);

  const acceptedRun = run(root, '--accept');
  check('--accept keeps the project version', read(root, 'frontend/vite.config.ts').includes('already had one'));
  check('--accept says so', acceptedRun.includes('accepted'));

  const after = run(root);
  check('and a later run stays quiet about it', !after.includes('vite.config.ts — the project has its own'));

  // A template change after acceptance must speak up again — otherwise
  // accepting once would silence the file forever.
  const stamp = JSON.parse(read(root, 'frontend/.jvd-scaffold.json'));
  stamp.files['frontend/vite.config.ts'] = 'stale';
  writeFileSync(path.join(root, 'frontend/.jvd-scaffold.json'), JSON.stringify(stamp), 'utf8');
  const changed = run(root);
  check('a later template change reports again', changed.includes('the template changed since'));
  check('and keeps reporting until resolved', run(root).includes('the template changed since'));

  rmSync(root, { recursive: true, force: true });
}

// --- starters are written once ----------------------------------------------

{
  const root = fixture();
  put(root, 'frontend/src/entry-prerender.tsx', '// the project wrote its own provider stack\n');
  const out = run(root);

  check(
    'leaves an existing starter alone',
    read(root, 'frontend/src/entry-prerender.tsx').includes('its own provider stack'),
  );
  check(
    'and says nothing about it — a starter diverging is the expected end state',
    !out.includes('entry-prerender.tsx — the project has its own'),
  );

  rmSync(root, { recursive: true, force: true });
}

// --- dry run ----------------------------------------------------------------

{
  const root = fixture();
  const out = run(root, '--dry-run');
  check('--dry-run writes nothing', !existsSync(path.join(root, 'frontend/src/lib/storage.ts')));
  check('--dry-run leaves package.json alone', !read(root, 'frontend/package.json').includes('vitest'));
  check('--dry-run writes no stamp', !existsSync(path.join(root, 'frontend/.jvd-scaffold.json')));
  check('--dry-run still reports', out.includes('would create'));
  rmSync(root, { recursive: true, force: true });
}

// --- no project -------------------------------------------------------------

{
  const root = mkdtempSync(path.join(tmpdir(), 'jvd-empty-'));
  let code = 0;
  try {
    execFileSync(process.execPath, [scaffold, '--root', root], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    code = error.status;
  }
  // --root is explicit here, so it is taken at face value; the guard that
  // matters is the search from cwd, exercised below.
  check('runs against an explicit empty root without crashing', code === 0 || code === 2);

  let searchCode = 0;
  try {
    execFileSync(process.execPath, [scaffold], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
  } catch (error) {
    searchCode = error.status;
  }
  check('exits 2 when no project root is found', searchCode === 2, `got ${searchCode}`);
  rmSync(root, { recursive: true, force: true });
}

// --- report -----------------------------------------------------------------

for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`${passed}/${passed + failures.length} scaffold self-tests passed`);
if (failures.length > 0) process.exit(1);
