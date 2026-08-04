---
description: Start a new project on this stack by forking base_setup, then rename it so nothing ships under the template's name.
allowed-tools: Bash(git clone:*), Bash(git remote:*), Bash(git log:*), Bash(git status:*), Bash(node:*), Bash(make env), Bash(make init), Bash(make check)
argument-hint: "[project name]"
---

Set up a new project on the JVD-Soft stack. $ARGUMENTS names it, if given —
otherwise ask before doing anything.

**Fork, do not scaffold from nothing.** The scaffolder is an upgrader: the files
it installs import `@/api/apiClient`, `@/components/ui`, `@/lib/utils`,
`@/providers/ThemeProvider` and `@/routes`, none of which it ships. On a bare
`yarn create vite` project `yarn typecheck` fails immediately. `base_setup` has
all of them, plus Laravel, Sanctum auth, Filament and the shadcn primitives.

## Steps

**1. Clone with the template as a named remote.**

```bash
git clone --origin template https://github.com/JVD-Soft/base_setup.git <name>
```

`--origin template`, not `origin`: `/jvd-frontend:sync-from-template` moves later
template changes across with `git cherry-pick`, which needs the shared history
and a remote that is not the project's own.

**2. Point `origin` at the new repository.** Ask first, and show the URL you are
about to set — this is the step that decides where the project's code goes.

**3. Rename the fork.** Nothing else does this, and nothing else notices when it
is missed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/scaffold/scripts/scaffold.mjs" --brand --dry-run
```

Show the old → new list, then run it without `--dry-run`. The eight values come
from the plugin's configuration; if the report shows `[default]` next to one
that matters, fix it in `/plugin` rather than passing `--set`, so the next run
agrees.

**4. Do the slots `--brand` reports but does not own.** They are backend and
repo identity:

- `backend/.env.example` → `APP_NAME`, `APP_URL`, `DB_DATABASE`. `APP_NAME` also
  names the Docker containers (`${APP_NAME}-backend`), so two forks left at the
  default fight over the same containers on one machine.
- `README.md`, `AGENTS.md` — they describe this codebase by name.

**5. Bring it up.**

```bash
make env
```

Then the user fills `backend/.env` — at minimum `DB_*`, `APP_NAME`, `MAIL_*`,
`GOOGLE_*`. Do not invent values, and do not read the filled file back: it holds
credentials.

```bash
make init
```

Confirm before this one — it builds and starts every container.

**6. Verify.**

```bash
make check
```

Lint, typecheck, tests, build. `src/test/shells.test.ts` is the one that matters
here: it asserts `index.html` and `app.html` still have identical heads, which is
how a half-applied rename gets caught.

**7. Tell the user what is still missing.** Do not generate placeholders for any
of it:

- `frontend/public/` — `pwa-64x64`, `pwa-192x192`, `pwa-512x512`,
  `maskable-icon-512x512`, `apple-touch-icon-180x180`, `favicon.svg`,
  `favicon.ico`. The manifest is invalid without them and the install prompt
  never appears. The maskable one is a different image: Android crops it to a
  circle, so its content has to sit inside the middle 80%.
- `ROUTES` and the `Disallow` list in `frontend/scripts/prerender.mjs`, and
  `BACKEND_PATHS` in `vite.config.ts` — see
  `skills/scaffold/reference/after-scaffold.md`.

A placeholder icon that reaches production is somebody's app icon.
