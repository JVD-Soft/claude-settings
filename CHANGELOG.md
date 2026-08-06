# Changelog

Versions live in each plugin's `.claude-plugin/plugin.json`. Claude Code only
offers an update when that field changes, so **bump it deliberately** — a
commit without a bump reaches nobody. Without a `version` at all, every commit
counts as a new version, which is worse.

Bump the **minor** for a new agent, skill, command or hook; the **patch** for
wording; the **major** when existing behaviour changes in a way someone has to
know about — a hook that starts blocking something it allowed, a renamed skill.

## jvd-backend

### 1.1.0

The plugin was one skill. It now carries the same shape as `jvd-frontend` —
hooks, agents, a gate command and an MCP server — because a backend-only project
enabling `jvd-backend` alone was getting none of the machinery that makes the
frontend half work.

- **`hooks/detect-setup.mjs` (`SessionStart`).** Reports what the backend
  baseline is missing: no `phpstan.neon`, no Larastan, no Pint, no
  `app/Services/`, a suite holding nothing but the stock `ExampleTest`, no CI
  workflow for the backend, and a `Makefile` whose gate covers the frontend
  only. Silent when the baseline is in place.

  The check that earns the hook on its own is **`lang/` parity**. A key present
  in one locale directory and absent from another renders as the literal key
  string at runtime — no exception, no log line, no failing test, and nothing
  else in the stack looks at it. Pointed at a real project it immediately found
  three files present in `lang/en/` and absent from `lang/uk/`, none of which
  anything had reported. File-level parity is the cheap version of the check;
  comparing keys would mean evaluating PHP, and `jvd-backend-test-writer` now
  carries the in-project test that does it properly.

- **`hooks/guard-read.mjs` (`PreToolUse`) — a byte-identical copy of the
  frontend's.** A plugin can only ship files inside its own directory, so a
  backend-only project had no read guard at all and could burn a context window
  on `vendor/autoload.php`. The duplication is the deliberate cost; the two
  files must be edited together. Its self-test is *not* a copy — the cases cover
  the layout the frontend suite never sees, Laravel at the repo root, where
  `storage/`, `bootstrap/cache/` and `vendor/` sit one segment from the top.

- **`hooks/format-changed.mjs` (`PostToolUse`).** Pint on the single edited file.
  Unlike PHPStan, Pint is safe to run from the host — it rewrites syntax in the
  file it was handed rather than reflecting into `vendor/`. Scope stays at one
  file deliberately: `pint --test` has a pre-existing backlog, and a hook that
  fixed everything it touched would bury the change in a thousand-line diff.

- **`agents/jvd-backend-reviewer`**, **`jvd-backend-test-writer`** and
  **`jvd-phpstan-doctor`**. The test writer leads with *PHPUnit, not Pest* —
  `pestphp/pest-plugin` sits in `composer.json`'s `allow-plugins` with no Pest
  installed, and a Pest-style test is silently not collected. The PHPStan doctor
  is the counterpart of `jvd-prerender-doctor`: one documented failure mode
  accounts for most red runs, and here it is running the analyser from the host,
  where every framework call collapses to `mixed` and a green result has checked
  almost nothing.

- **`commands/check`.** Its own command rather than a `make` target because
  `make check` in these projects is `lint typecheck test build-fr` — four yarn
  scripts against the frontend container. Nothing ran the PHP. It reports the
  three checks with their different bars: PHPStan's is zero, the test suite is
  the real signal, and a `pint --test` failure is only yours if it names a file
  you touched.

- **`.mcp.json` with `context7`.** Also declared by `jvd-frontend`; enabling both
  plugins brings it twice. See the README if `/mcp` shows a conflict.

- **Two stale claims fixed in `laravel-api-endpoint`.** It asserted that `lang/en`
  and `lang/uk` were "at full parity" and that the test suite was "effectively
  empty" — both were true when the skill was written and neither is now. A skill
  that ships from a marketplace cannot see a project tree, so both were replaced
  with the rule plus a pointer to the hook and to `backend/AGENTS.md`.

### 1.0.0

New plugin. `laravel-api-endpoint` moved here from `base_setup/.claude/skills/`,
where it was maintained per project.

- **Why it moved:** the skill turned out to describe the *stack's* conventions —
  the response envelope, thin controllers over services, FormRequest validation,
  numeric role levels, `lang/` parity — none of which vary between projects.
  Keeping a copy in each repo was the same silent-divergence problem this
  marketplace exists to solve. Project-specific state stayed behind: the skill
  now sends you to the project's own `backend/AGENTS.md` for what is currently
  broken, instead of linking into a tree it can no longer see.
- **Its own plugin, not a `jvd-frontend` skill.** That plugin's name, keywords
  and `shadcn` MCP server are React-specific; a backend-only project would have
  had to enable all of it to get one Laravel skill.
- No hooks, agents or MCP servers here — those stay in `jvd-frontend`.

## jvd-frontend

### 2.0.0

Findings from a full audit of `base_setup/frontend` — SEO, wiring, QA, a11y,
performance, library currency, security and context budget — each one verified
against the files before it was acted on. The fixes below are the ones that
reached the shared layer; the rest are project-local.

- **Breaking (hook):** the read guard now blocks `*.tsbuildinfo` and the
  `.tsbuild/` directory. `tsc -b` writes its incremental cache *beside* the
  tsconfig, inside the source tree, so no existing rule caught it — a 61 KB file
  of hashes and version stamps that read clean.
- **Breaking (nginx template):** the SPA fallback is now `/app.html`, not
  `/index.html`. `scripts/prerender.mjs` writes the rendered home page into
  `dist/index.html`, so falling back to it answered **every** unknown URL with
  the home page's markup and its `<link rel="canonical">` — a soft 404 carrying
  another page's metadata, at HTTP 200. `/` is unaffected: `$uri/` reaches the
  server-level `index` directive, which still finds `dist/index.html`.
  Prerendered subroutes are unaffected for the same reason.
- **nginx template:** `robots.txt` and `sitemap.xml` get exact-match locations
  pointing at the frontend build. The existing regex location searched Laravel's
  `public/` first, where a `robots.txt` also lives, so the generated one — with
  the `Disallow` rules and the `Sitemap:` line — was never served in any
  deployment. Exact-match beats regex in nginx, so nothing else needed changing
  and `backend/` stays untouched.
- **prerender template:** `SITE_URL` now comes from `loadEnv()` rather than
  `process.env`. The script runs as a plain `node`, so it never saw
  `frontend/.env` — while the app half reads the same variable through
  `import.meta.env`, which Vite does fill from it. A correctly configured project
  therefore built pages whose canonical and og:url carried the real domain and a
  `sitemap.xml` that said `localhost`, with every checker green. Proven against
  the installed Vite, not recalled. A tripwire now throws when `APP_ENV` is
  `production` and the URL is still a loopback host.
- **prerender template:** JSON-LD is no longer hoisted into `<head>`. It was, so
  that a crawler reading only the head would find it; the cost is that
  `hydrateRoot` sees markup moved out of `#root`, calls it a mismatch and
  re-renders the document — re-emitting every head tag as a duplicate. Two
  canonicals is not a canonical. JSON-LD is valid in the body and Google reads
  it there.
- **prerender template:** the localhost tripwire fires on **every** deployed
  environment, not only `production`. This stack runs local, Docker, staging and
  production; staging publishes canonical URLs and a sitemap like anything else
  and gets indexed for them, so checking one environment name left the other one
  silent. Local values (`local`, `development`, `test`, unset) stay quiet.
- `--brand`'s anchor for `prerender.mjs` was pinned to `process.env.VITE_SITE_URL`
  and stopped matching when that line changed. It is now anchored on
  `VITE_SITE_URL ?? '` — the part that is about the value, not about how it is
  read. A missed anchor is reported as a skip, not an error, so this would have
  been silent.

### 1.7.0
- `src/locales/locales.test.ts` — new owned test. A missing translation key does
  not throw: i18next renders the key itself, so the user reads
  `auth.login.title` where a sentence belongs, in the language nobody on the
  team clicks through. Lint, typecheck, build and every other test stay green.
  The rule ("add the key to every locale in the same change") existed only as
  prose in each project's `frontend/AGENTS.md` and in the `i18n-translations`
  skill — which is to say it held exactly as long as someone remembered it.
  Checks key parity across every locale directory found on disk, interpolation
  placeholder parity per key, empty and non-string values.
- The same test also pins **plural completeness per language**, which is the
  part a naive key-set comparison gets wrong. i18next picks its suffix through
  `Intl.PluralRules`, and the categories differ: English needs `_one`/`_other`,
  Ukrainian also needs `_few` and `_many`. A first version of this test read
  those eight extra Ukrainian keys as drift and failed on correct translations. Parity is now compared over *logical* keys, and each
  locale is separately required to carry every form its own language selects —
  a missing `_many` renders the raw key for counts of five and up.
  https://www.i18next.com/translation-function/plurals
- The scaffolder read **every entry** in `src/locales/` as a language, files
  included, so the new test file made it ask the user to hand-write
  `frontend/src/locales/locales.test.ts/translation.json`. Latent since the
  locale merge was written — any non-directory there would have done it.
  Directories only now, with a self-test that fails when the filter is removed.
- `i18n-translations` gained the section it was missing: plural categories are
  per language, `en` needs two forms and `uk` needs four, and writing only
  `_one`/`_other` in Ukrainian renders the raw key for counts of two and five —
  the range most lists land in. The skill also claimed a missing key "won't get
  caught otherwise", which the new test makes untrue, and asserted that parity
  "is currently perfect", which is project state in a shared file.

### 1.6.0
- Two lint rules in the template's `eslint.config.js`, for two bugs that had
  already shipped and that both look like working code:
  `no-restricted-syntax` requires **`noValidate` on every `<form>`** — without
  it the browser's own constraint validation suppresses the submit event, so
  react-hook-form never runs, the translated zod message can never appear, and
  the button silently does nothing; `no-restricted-globals` bans raw
  `localStorage`/`sessionStorage` in favour of `safeStorage`, which throws in
  private mode and does not exist at all under the build-time prerender, where
  `i18n.ts` reads it at module scope. `src/lib/storage.ts` and the storage test
  are exempt, being the wrapper and its verification.
  *(Shipped in the 1.6.0 bump; this entry was written afterwards.)*

### 1.5.2
- README documented installation and rationale but never **how to invoke any of
  it**, and the command list gave the wrong names: `/check` instead of
  `/jvd-frontend:check`. As written, none of them would have run. New "Как
  пользоваться" section with the real namespaced names, the scaffolder's flags,
  and which skills activate on their own.

### 1.5.1
- The starter's `API_URL` defaulted to the absolute `http://localhost:80/api`,
  which made every request cross-origin the moment the app was opened at
  `127.0.0.1` — `connect-src 'self'` then blocked the lot. Under Docker on WSL2
  that is the normal case, because `localhost` resolves to `::1` there. The
  default is now the relative `/api`, which is same-origin however the app is
  reached.
- New owned test `src/config/config.test.ts`: `API_URL` and `connect-src` are
  one decision written in two files, and they used to fail apart silently — a
  green build and a dead app. It parses the `add_header` line (not the comment
  above it, which also says `connect-src`) and names the host to add.

### 1.5.0
- `--brand` — renames a fork. New projects on this stack start as forks of
  `base_setup`, and on a fork the eight project values reach **nothing**:
  `index.html`, `app.html` and `vite.config.ts` are seeded, `config/index.ts` is
  a starter, so all four already exist and a normal run correctly leaves them
  alone. Forks were shipping with `<title>App</title>` and `"name":"App"` in
  their manifest, and no test looked at either.
  Rewrites the same slots in place; refuses to run while `APP_NAME` is still
  `App`; skips any anchor that does not match exactly once instead of guessing;
  escapes per literal kind, so `Bob's Shop` works.
- `SessionStart` reports an unbranded fork. `base_setup` opts out with
  `"identity": { "isTemplate": true }` — it carries the template's name because
  it is the template.
- `/jvd-frontend:new-project` — the fork procedure, including the backend slots
  `--brand` does not own (`backend/.env.example` `APP_NAME` also names the Docker
  containers, so two forks left at the default collide).

### 1.4.0
- `lib/formErrors.ts` (`applyApiErrors`) replaces `lib/applyServerErrors.ts` in
  the template. The old one set every key a 422 returned, including fields the
  form does not render — react-hook-form then held an error against a name
  nothing was bound to, so the message vanished and the user saw a rejection
  with no explanation. The new one takes the form's field list and returns
  `false` when the 422 belongs in a banner. Adopted from a project that had
  arrived at it independently.
- `forms-validation` skill rewritten against what the two projects actually do.
  It had gone stale to the point of being wrong — it still said
  `@hookform/resolvers` was not installed and that the auth forms were
  hand-rolled `useState`.
  It now leads with **`noValidate` on every `<form>`**: without it the
  browser's constraint validation blocks the submit event, so the schema never
  runs and the translated messages can never appear. Nine forms in one project
  were shipping with the submit button doing nothing on invalid input.
- `--accept` records the template version a seeded file was compared against,
  for projects that diverge on purpose. Without it, five files reported for
  reconciliation on every run and the report became something to skim.
- Starters (`entry-prerender.tsx`, `config/index.ts`) are written once and then
  left alone silently — their whole point is to be rewritten per project.
- nginx template: the server-level `include` was indented as if it sat inside a
  location.

### 1.3.0
- `skills/scaffold` — new, and the reason this plugin exists rather than a
  README. Brings a project's frontend to the stack baseline: Vitest harness,
  error boundaries, safeStorage, SEO and build-time prerender, PWA, nginx
  security headers and CSP, CI, Makefile gates. ~35 files written, 8 merged,
  idempotent, `--dry-run` first. The work used to be a manual port of ~3 000
  lines per project.
- `userConfig` — eight per-project values (`APP_NAME`, `SITE_URL`, theme
  colours, …). Claude Code asks for them on enable; the scaffolder reads them
  from `CLAUDE_PLUGIN_OPTION_*`. Same stack, different projects, no template
  editing.
- `hooks/detect-setup.mjs` — `SessionStart` reports what the baseline is
  missing. Silent when nothing is.
- `scripts/validate-plugins.mjs` in CI, because plugin structure fails
  silently: a malformed frontmatter loads with empty metadata and the skill
  simply stops activating.
- **Breaking:** agents renamed to `jvd-frontend-reviewer`, `jvd-a11y-auditor`,
  `jvd-test-writer`, `jvd-prerender-doctor`. Plugin agents are the lowest of
  five precedence levels, so the old unprefixed names were silently overridable
  by any same-named file in a project. Update any `AGENTS.md` that names them.
- Agents preload their conventions via `skills:`, saving a lookup round.
- `dependencies` on the official `typescript-lsp` instead of a private
  `.lsp.json`: two servers claiming the same extension means the second never
  starts.

### 1.1.0
- MCP servers (`context7`, `shadcn`) moved in from each project's `.mcp.json`.
  They were identical copies with no way to stay that way — the same reason the
  skills moved.
- Manifest metadata: `homepage`, `repository`, `license`, `keywords`.

### 1.0.0
- Read guard, rewritten from Python to Node so the plugin does not assume a
  `python` binary. 49 self-tests, run by this repository's CI.
- Format-on-edit hook — new. The router used to ask the agent to remember.
- Agents: `frontend-reviewer`, `a11y-auditor`, `test-writer`, `prerender-doctor`.
- Commands: `/check`, `/verify-hooks`, `/sync-from-template`.
- Skills: `react-data-fetching`, `shadcn-ui-components`, `forms-validation`,
  `i18n-translations`.
