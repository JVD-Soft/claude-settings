---
description: Verify this plugin's hooks — that the read guard still blocks vendor and build output while letting PHP source through, and that the baseline detector still stays silent on a complete project.
allowed-tools: Bash(node:*), Bash(diff:*)
---

Run both self-tests:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-read.test.mjs"
node "${CLAUDE_PLUGIN_ROOT}/hooks/detect-setup.test.mjs"
```

Each shells out to its hook the way Claude Code does — JSON on stdin, exit code
or stdout back — so they check the real contract rather than an internal
function.

**guard-read.** Both halves matter. The BLOCK cases prove the guard still saves
context on `vendor/`, `composer.lock`, `bootstrap/cache/` and
`storage/framework/`; the ALLOW cases prove it never eats a controller, a
migration or a `lang/` file, which is the failure that would actually hurt. If a
case fails, report which side it was on: a guard that blocks source is worse
than no guard.

This plugin's `guard-read.mjs` is a byte-identical copy of the one in
`jvd-frontend` — a plugin can only ship files inside its own directory, and a
backend-only project enables `jvd-backend` alone. If you change one, change
both, or the two stacks start disagreeing about what an agent may read:

```
diff plugins/jvd-frontend/hooks/guard-read.mjs plugins/jvd-backend/hooks/guard-read.mjs
```

**detect-setup.** The property under test is silence. A SessionStart hook that
speaks every session is one everybody learns to skip, and then it is worth
nothing on the session where it has something to say. A failure in a
"expected silence" case is more serious than a missed finding.

Run this after changing either hook, after adding a generated directory or a
package manager, and after adding a new check to the baseline detector.
