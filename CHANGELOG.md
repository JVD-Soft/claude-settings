# Changelog

Versions live in each plugin's `.claude-plugin/plugin.json`. Claude Code only
offers an update when that field changes, so **bump it deliberately** — a
commit without a bump reaches nobody. Without a `version` at all, every commit
counts as a new version, which is worse.

Bump the **minor** for a new agent, skill, command or hook; the **patch** for
wording; the **major** when existing behaviour changes in a way someone has to
know about — a hook that starts blocking something it allowed, a renamed skill.

## jvd-frontend

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
