import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * index.html and app.html are two Vite entries with the same head. index.html
 * is overwritten by the prerender step; app.html stays the empty shell that
 * nginx and the service worker fall back to. If their heads drift, a deep link
 * gets a different title, favicon or theme-color than the home page — a
 * difference nobody would think to look for.
 */
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

const head = (html: string) => {
  const match = /<head>([\s\S]*?)<\/head>/.exec(html);
  if (!match?.[1]) throw new Error('no <head> found');
  // Comments differ by design — each file explains what it is.
  return match[1].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
};

describe('SPA shells', () => {
  it('index.html and app.html have identical heads', () => {
    expect(head(read('app.html'))).toBe(head(read('index.html')));
  });

  it('app.html carries no page content', () => {
    expect(read('app.html')).toContain('<div id="root"></div>');
  });
});
