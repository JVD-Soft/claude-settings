#!/usr/bin/env node
/**
 * PreToolUse guard: blocks wasteful Read calls (build output, dependencies,
 * binaries, lockfiles).
 *
 * Token economics, not a security control. Reading a whole lockfile or a
 * vendored dependency costs thousands of tokens for no source signal; this
 * pushes the agent to narrow instead (Grep, Read with offset+limit, or the
 * project's context map).
 *
 * Node rather than Python — this ships in a plugin, and `python` is not a
 * guaranteed binary on Linux images or on a teammate's machine, while Node is
 * present for anyone running Claude Code.
 *
 * Rules:
 *   - Stack-agnostic. Matching is per path SEGMENT, so `vendor/x`,
 *     `backend/vendor/x` and `a/b/vendor/x` all match the single rule "vendor".
 *   - Extensible without editing this file: drop
 *     `.claude/hooks/guard-read.config.json` in the project with
 *     {"blockDirs": [], "blockFiles": [], "allowFiles": []}.
 *   - Fails OPEN on any error. An extra read is cheap; a blocked source file
 *     is not.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Extensions with no useful text signal (binaries, media, archives, db, fonts). */
const BINARY_EXT = new Set([
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z', '.rar',
  '.db', '.sqlite', '.sqlite3', '.mdb',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.flac',
  '.pdf', '.exe', '.dll', '.so', '.dylib', '.bin', '.class', '.pyc',
  '.jar', '.war', '.wasm', '.pack', '.idx',
]);

/** Text, but reading one whole is pure noise. The manifest is useful; the lock is not. */
const NOISY_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'composer.lock',
  'poetry.lock', 'pdm.lock', 'uv.lock', 'pipfile.lock',
  'gemfile.lock', 'cargo.lock', 'go.sum', 'packages.lock.json', 'gradle.lockfile',
]);

/**
 * Generated / vendored / cache directory SEGMENTS — never a source of truth.
 * An entry may span several segments ("storage/framework"), which then has to
 * match consecutively.
 */
const BLOCK_DIRS = new Set([
  'node_modules', 'vendor', 'bower_components', 'jspm_packages',
  'dist', 'dist-ssr', 'build', 'out', 'coverage',
  '.git', '.svn', '.hg', '.idea', '.gradle', '.mvn',
  '.next', '.nuxt', '.svelte-kit', '.astro', '.turbo', '.parcel-cache',
  '.vite', '.angular', 'storybook-static', '.docusaurus', '.yarn',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.ruff_cache', 'site-packages', '.eggs',
  'target', 'obj', 'pkg/mod',
  'bootstrap/cache', 'storage/framework', 'storage/logs', 'storage/debugbar',
  '.cache', '.terraform', '.serverless',
]);

const lower = (value) => String(value).toLowerCase();

/**
 * Per-project extras. The project's own config wins; the plugin directory is a
 * fallback so a marketplace install can still carry defaults. Inside a plugin
 * the install directory is read-only, which is why the project path is tried
 * first rather than only.
 */
const loadOverrides = () => {
  const candidates = [
    process.env.CLAUDE_PROJECT_DIR &&
      path.join(process.env.CLAUDE_PROJECT_DIR, '.claude/hooks/guard-read.config.json'),
    process.env.CLAUDE_PLUGIN_ROOT &&
      path.join(process.env.CLAUDE_PLUGIN_ROOT, 'hooks/guard-read.config.json'),
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(file, 'utf8'));
      return {
        dirs: new Set((cfg.blockDirs ?? []).map((x) => lower(x).replace(/^\/+|\/+$/g, ''))),
        files: new Set((cfg.blockFiles ?? []).map(lower)),
        allow: new Set((cfg.allowFiles ?? []).map(lower)),
      };
    } catch {
      // Missing or malformed: try the next candidate, then fall through.
    }
  }
  return { dirs: new Set(), files: new Set(), allow: new Set() };
};

/** True if `pattern` occurs as consecutive path segments — depth-independent. */
const segmentsMatch = (segments, pattern) => {
  const parts = pattern.split('/');
  for (let i = 0; i + parts.length <= segments.length; i += 1) {
    if (parts.every((part, offset) => segments[i + offset] === part)) return true;
  }
  return false;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const decide = (filePath, overrides) => {
  let norm = filePath.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
  // Strip a Windows drive prefix so "c:/x/node_modules/y" segments cleanly.
  if (norm.length > 1 && norm[1] === ':') norm = norm.slice(2).replace(/^\/+/, '');

  const base = path.posix.basename(norm);
  const ext = path.posix.extname(norm);
  const segments = norm.split('/').filter((s) => s && s !== '.');
  const dirs = segments.slice(0, -1); // never match the file itself as a directory

  if (overrides.allow.has(base)) return null;

  if (BINARY_EXT.has(ext)) {
    return `'${ext}' is a binary/media file, not readable as text`;
  }
  if (NOISY_FILES.has(base) || overrides.files.has(base)) {
    return `'${base}' is a lockfile — thousands of lines, zero source signal`;
  }
  for (const pattern of [...BLOCK_DIRS, ...overrides.dirs]) {
    if (segmentsMatch(dirs, pattern)) {
      return `path sits inside '${pattern}/' (generated/vendored/cache)`;
    }
  }
  return null;
};

const main = async () => {
  let event;
  try {
    event = JSON.parse(await readStdin());
  } catch {
    return 0;
  }
  if (event?.tool_name !== 'Read') return 0;

  const filePath = event?.tool_input?.file_path;
  if (!filePath) return 0;

  const reason = decide(filePath, loadOverrides());
  if (!reason) return 0;

  process.stderr.write(
    `Blocked wasteful Read (${reason}): reading it whole burns context for no ` +
      `benefit. Narrow with Grep, Read + offset/limit, or find the actual source ` +
      `file via docs/context-map.md.\n`,
  );
  // exit 2 -> PreToolUse blocks the call and stderr reaches the model.
  return 2;
};

process.exit(await main());
