---
description: Verify the read guard still blocks build output and still lets source through.
allowed-tools: Bash(node:*)
---

Run the read guard's self-test:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-read.test.mjs"
```

It shells out to the hook the way Claude Code does — JSON on stdin, exit code
out — so it checks the real contract rather than an internal function.

Both halves matter. The BLOCK cases prove the guard still saves context; the
ALLOW cases prove it never eats a real source file, which is the failure that
would actually hurt. If a case fails, report which side it was on: a guard that
blocks source is worse than no guard.

Run this after changing the guard, and after adding a build directory or a
package manager that produces new generated paths.
