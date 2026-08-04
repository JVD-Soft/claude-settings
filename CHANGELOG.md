# Changelog

Versions live in each plugin's `.claude-plugin/plugin.json`. Claude Code only
offers an update when that field changes, so **bump it deliberately** — a
commit without a bump reaches nobody. Without a `version` at all, every commit
counts as a new version, which is worse.

Bump the **minor** for a new agent, skill, command or hook; the **patch** for
wording; the **major** when existing behaviour changes in a way someone has to
know about — a hook that starts blocking something it allowed, a renamed skill.

## jvd-frontend

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
