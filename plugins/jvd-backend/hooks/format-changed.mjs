#!/usr/bin/env node
/**
 * PostToolUse: runs Pint on the one PHP file that was just edited.
 *
 * The frontend counterpart replaced an instruction asking the agent to remember
 * the formatter; this replaces the same instruction on the PHP side. Hooks do
 * not forget, which is the whole reason it lives here rather than in a skill.
 *
 * Running Pint from the host is safe, unlike PHPStan. `phpstan.neon` warns at
 * length that a host run resolves vendor members to `mixed` and reports a green
 * result having checked nothing — that failure comes from reflecting into
 * vendor classes. Pint only rewrites syntax in the file it was handed, so it
 * behaves identically inside and outside the container.
 *
 * Scope is one file, so it costs milliseconds and can never reformat the tree —
 * which matters here more than on the frontend: `pint --test` has a
 * pre-existing backlog, and a hook that fixed everything it touched would bury
 * the actual change in a thousand-line diff.
 *
 * Fails open and silent. vendor/ often lives in a Docker volume rather than on
 * the host; editing must still work when Pint is not reachable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  let event;
  try {
    event = JSON.parse(await readStdin());
  } catch {
    return;
  }

  const filePath = event?.tool_input?.file_path;
  if (!filePath || path.extname(filePath).toLowerCase() !== '.php') return;
  if (!existsSync(filePath)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  // Pint resolves its config and preset relative to the directory holding
  // composer.json, so it has to run from there. Both layouts: Laravel under
  // backend/ in a monorepo, or at the repo root in a backend-only project.
  const backendDir = path.join(projectDir, 'backend');
  const root = existsSync(path.join(backendDir, 'composer.json')) ? backendDir : projectDir;

  const binary = path.join(
    root,
    'vendor/bin',
    process.platform === 'win32' ? 'pint.bat' : 'pint',
  );
  if (!existsSync(binary)) return;

  // Outside the formatted root (a stray file, something in /tmp) there is
  // nothing to do.
  if (!path.resolve(filePath).startsWith(path.resolve(root))) return;

  spawnSync(binary, ['--quiet', filePath], {
    cwd: root,
    stdio: 'ignore',
    timeout: 20_000,
  });
};

await main();
