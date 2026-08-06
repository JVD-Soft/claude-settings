---
description: Run the backend gate — Pint, PHPStan/Larastan and the PHP test suite — inside the container, where they are the only place they mean anything.
allowed-tools: Bash(docker compose exec:*), Bash(docker-compose exec:*), Bash(make shell:*), Bash(composer analyse:*), Bash(php artisan test:*), Bash(./vendor/bin/pint:*)
---

Run the backend quality gate and report the result.

There is no `make` target for this. `make check` in these projects is
`lint typecheck test build-fr` — four yarn scripts against the frontend
container — so the backend has to be driven directly:

```bash
docker compose exec -T backend ./vendor/bin/pint --test
docker compose exec -T backend composer analyse
docker compose exec -T backend php artisan test
```

`-T` is not optional: without it the command has no TTY in a non-interactive
session and does not run at all.

**Run all three even when an earlier one is red.** They cover different things
and two of them have different bars, so stopping at the first failure hides the
one that matters. Report each as pass or fail with the actual output — the rule
name and the `file:line`, not a paraphrase.

The three do not carry the same weight, and saying so is part of the report:

- **`composer analyse` — the bar is zero.** Level 5 is green with no baseline,
  so any error it reports was introduced by the change in front of you. If it
  crashes with `Class mixed was not found`, it was run from the host rather than
  the container and has checked nothing; re-run it inside and say so.
  `jvd-phpstan-doctor` is the agent for a run that stays red.
- **`php artisan test` — the real signal.** Report which tests ran and which
  failed. Nothing else covers this project's behaviour: there is no CI workflow
  for the backend, so this command is the entire gate.
- **`pint --test` — has a pre-existing backlog.** A failure here is only this
  change's fault if it names a file the change touched. Check that before
  reporting it as a regression, and do not fix the backlog inside a feature
  change — reformatting the tree buries the diff.

If Docker is not running, say so and stop. Do not fall back to running these on
the host: PHPStan silently checks nothing there, and a green result would be a
false report rather than a partial one.
