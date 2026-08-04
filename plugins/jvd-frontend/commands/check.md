---
description: Run the full frontend gate — lint, typecheck, tests, build — the same four steps CI runs.
allowed-tools: Bash(make check), Bash(make test), Bash(yarn --cwd frontend lint:*), Bash(yarn --cwd frontend typecheck:*), Bash(yarn --cwd frontend test:*), Bash(yarn --cwd frontend build:*)
---

Run the project's quality gate and report the result.

Prefer `make check` — it runs lint, typecheck, test and build inside the
container, which is where `node_modules` lives. If Docker is not running, fall
back to `yarn --cwd frontend <script>` for each step in that order.

Report each step as pass or fail. On a failure, stop at the first one, show the
actual output, and say what it means — do not run the rest and do not
paraphrase the error. "Lint is red" is not a report; the rule name and the
`file:line` are.

The bar is zero. Lint runs at `--max-warnings 0`, so a warning fails exactly
like an error, and a red result is this change's fault: the pre-existing
backlog was cleared, not tolerated.
