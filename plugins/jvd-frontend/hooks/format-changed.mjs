#!/usr/bin/env node
/**
 * PostToolUse: runs `eslint --fix` on the one file that was just edited.
 *
 * This replaces an instruction in the router that asked the agent to remember
 * to run the formatter. Hooks do not forget; that is the entire point of
 * moving it here.
 *
 * Scope is one file, so it costs milliseconds and can never reformat the repo.
 * It fails open and silent: if eslint is not installed on this machine —
 * node_modules normally lives in a Docker volume, not on the host — editing
 * must still work.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const LINTABLE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

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
  if (!filePath || !LINTABLE.has(path.extname(filePath).toLowerCase())) return;
  if (!existsSync(filePath)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  // The ESLint config lives in frontend/, so eslint has to run from there —
  // running it from the repo root finds no config and lints nothing.
  const frontendDir = path.join(projectDir, 'frontend');
  const root = existsSync(path.join(frontendDir, 'eslint.config.js')) ? frontendDir : projectDir;

  const binary = path.join(
    root,
    'node_modules/.bin',
    process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
  );
  if (!existsSync(binary)) return;

  // Outside the linted root (a backend file, something in /tmp) there is
  // nothing to do.
  if (!path.resolve(filePath).startsWith(path.resolve(root))) return;

  spawnSync(binary, ['--fix', '--no-warn-ignored', filePath], {
    cwd: root,
    stdio: 'ignore',
    timeout: 20_000,
  });
};

await main();
