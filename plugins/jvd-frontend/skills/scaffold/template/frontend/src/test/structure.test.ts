import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Layout rules that lint cannot express, because they are about which files
 * exist rather than what any one file contains.
 *
 * Both were conventions in frontend/AGENTS.md — read most of the time, which is
 * not the same as always. A stray `.js` under src/ compiles, ships and silently
 * opts that file out of every type-aware lint rule; a new top-level directory
 * looks like a tidy-up in a diff and is a restructure by the time anyone
 * notices.
 */
const SRC = path.resolve(__dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const relative = (file: string) => path.relative(SRC, file).replace(/\\/g, '/');

describe('src/ layout', () => {
  it('contains no .js or .jsx files', () => {
    const offenders = walk(SRC)
      .filter((file) => /\.(js|jsx)$/.test(file))
      .map(relative);

    // The flat configs at the repo root are legitimately .js and live outside
    // src/, so they are not in scope here.
    expect(offenders).toEqual([]);
  });

  /**
   * The tree is by-type, not feature-first. Adding one of these as a side
   * effect of another change is how the two layouts end up half-applied, with
   * no discussion and no migration.
   */
  it.each(['features', 'types'])('has no top-level %s/ directory', (name) => {
    expect(existsSync(path.join(SRC, name))).toBe(false);
  });
});
