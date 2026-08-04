---
name: scaffold
description: Brings a project's frontend up to the JVD-Soft stack baseline — Vitest harness, error boundaries, safe storage, SEO and build-time prerender, PWA, nginx security headers, CI, Makefile gates. Use when setting up a new React/Vite project on this stack, when a project is missing tests or a build pipeline, when asked to "set up the frontend", "add PWA/SEO/prerender", or to bring an older project up to the current standard.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/scaffold.mjs *)
---

# Scaffold the frontend baseline

Run the script. It writes ~35 files and merges into 8 more; it prints what it
did and what only a person can decide. Do not copy files by hand — the file
contents are ~3 000 lines and reading them costs more than the whole task.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/scaffold.mjs --dry-run
```

Read the report, then run it for real without `--dry-run`.

## What it decides for itself

| | |
|---|---|
| `--dry-run` | Prints the plan, writes nothing. |
| `--force` | Takes the template's version of seeded files. Only when the project's copy is a stock Vite default or a stale baseline — never to silence a `reconcile` line you have not read. |
| `--accept` | Keeps the project's version and records the template version it was compared against. For a file the project owns on purpose — its own routes, its own manifest. The line stops repeating; a *later* template change reports again. |
| `--root DIR` | Where the project is. Found automatically from `frontend/package.json`. |
| `--set KEY=VALUE` | Overrides one variable, for a trial run. |

The eight variables (`APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`,
`SITE_URL`, `LANG`, `THEME_COLOR_LIGHT`, `THEME_COLOR_DARK`,
`PWA_CATEGORIES`) come from the plugin's own configuration. The report prints
each value and where it came from — if one says `[default]` and the default is
wrong for this project, fix it in `/plugin` rather than passing `--set`, so the
next run agrees.

## Three policies, because "copy the files" is wrong for most of them

- **owned** — the plugin's files: `lib/storage.ts`, the error boundary, the
  test harness, nginx snippets, CI. Overwritten to match the template. Local
  edits to these belong upstream in the plugin, not in one project.
- **seeded** — written once, then the project's: `vite.config.ts`,
  `prerender.mjs`, `index.html`, `eslint.config.js`, nginx `default.conf`,
  the frontend `Dockerfile`. They carry decisions the script cannot rebuild.
- **merged** — `package.json`, `.gitignore`, `.env.example`, the locale files,
  `index.css`, `Makefile`, `docker-compose.yml`. Specific keys and lines are
  added; nothing else is touched and nothing is ever deleted.

`frontend/.jvd-scaffold.json` records which template version each seeded file
came from. It is how a later run tells "the project edited this" from "the
project predates this template" — commit it.

## After the run

The report ends with decisions the script deliberately did not make. They are
not optional polish: a missing provider in `entry-prerender.tsx` fails the
build, and a `BACKEND_PATHS` list out of step with nginx makes `/admin` stop
opening for anyone who has loaded the app once.

Read [reference/after-scaffold.md](reference/after-scaffold.md) before working
through them — it covers how to resolve each one, and the three ordering
constraints that are not obvious.

Then, from the project root:

```bash
make check
```

That is `lint`, `typecheck`, `test`, `build` — the same four CI runs. The build
includes the prerender, which fails loudly if a page rendered as a spinner.

## What this does not do

Application code. Routes, pages, providers, the API layer and the auth model
are the project. This skill delivers the floor every project on the stack
stands on, and stops there.
