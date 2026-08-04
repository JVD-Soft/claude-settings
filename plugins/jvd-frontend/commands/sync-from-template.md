---
description: Port a change from the base_setup template into a project that forked it, or check what has drifted.
allowed-tools: Bash(git:*)
argument-hint: "[path or commit to port]"
---

The projects share a git history: a fork is not a copy on disk, so a change can
be moved with `git cherry-pick` rather than by hand. $ARGUMENTS names what to
port, if anything was given.

**Before porting anything**, establish what actually differs. Add the template
as a remote if it is not there, fetch, and compare the specific paths — not the
whole tree, which is mostly domain code that is supposed to differ.

**Only the shared layer travels.** Configs, the Docker and nginx setup, the
Makefile, `src/lib`, `src/test`, the route-guard components, the shadcn
primitives, the auth pages. These are the files that were byte-identical before
someone edited one of them.

**These never travel**, because each describes one codebase and copying them
makes it describe the wrong one: `AGENTS.md` and the nested routers,
`docs/context-map.md`, ADRs, `src/api/types.ts`, the locales, `routes.tsx`,
`src/config`.

Report the drift as three lists — identical, diverged, one-sided — and for each
diverged file say whether the difference is intentional (the fork moved ahead)
or accidental (a fix landed in one repo only). Only then propose the port.

Prefer `git cherry-pick` over copying a file: it keeps the reason for the
change attached to it. If the file has diverged too far to cherry-pick, say so
and port by hand rather than clobbering the fork's version.
