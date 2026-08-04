# Changelog

Versions live in each plugin's `.claude-plugin/plugin.json`. Claude Code only
offers an update when that field changes, so **bump it deliberately** — a
commit without a bump reaches nobody. Without a `version` at all, every commit
counts as a new version, which is worse.

Bump the **minor** for a new agent, skill, command or hook; the **patch** for
wording; the **major** when existing behaviour changes in a way someone has to
know about — a hook that starts blocking something it allowed, a renamed skill.

## jvd-frontend

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
  `false` when the 422 belongs in a banner. Adopted from supplier_manager,
  which had arrived at it independently.
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
