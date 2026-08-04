import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@/config';

const CSP_FILE = path.resolve(__dirname, '../../..', 'docker/nginx/snippets/csp.conf');

/**
 * The `connect-src` list the browser will actually enforce.
 *
 * Read out of the `add_header` line, not the file: the comment above it also
 * says "connect-src", and matching that would let a policy pass because its own
 * documentation mentioned the host.
 */
const connectSrc = (): string[] | null => {
  if (!existsSync(CSP_FILE)) return null;
  const policy = /add_header Content-Security-Policy\s+"([^"]*)"/.exec(readFileSync(CSP_FILE, 'utf8'));
  if (!policy?.[1]) return null;
  const directive = policy[1].split(';').find((part) => part.trim().startsWith('connect-src'));
  return directive?.trim().split(/\s+/).slice(1) ?? [];
};

const origin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * `connect-src` and the API base are one decision written in two files, and
 * they fail apart silently: the build is green, the bundle is correct, and every
 * request dies in the browser with a CSP violation nobody sees until someone
 * opens the console.
 *
 * `'self'` is compared textually, so `http://localhost` and `http://127.0.0.1`
 * are two different origins. Under Docker on WSL2 that is the normal case —
 * `localhost` resolves to `::1` there, so the app is reached at `127.0.0.1`, and
 * an API pinned to `localhost` is cross-origin from the first request.
 */
describe('APP_CONFIG.API_URL and the CSP agree', () => {
  it('is relative, or names a host the CSP allows', () => {
    const api = APP_CONFIG.API_URL;

    if (api.startsWith('/')) {
      // Same-origin by construction: works at localhost, at 127.0.0.1, on a LAN
      // address and on the real domain, with no rebuild.
      expect(api).toMatch(/^\/[a-z]/i);
      return;
    }

    const host = origin(api);
    expect(host, `API_URL "${api}" is neither relative nor a valid absolute URL`).not.toBeNull();

    // A loopback host is never a separate API — it is this origin, written the
    // one way that breaks it.
    expect(host, 'a loopback API host is the same origin spelled wrongly — use a relative "/api"').not.toMatch(
      /localhost|127\.0\.0\.1|\[::1\]/,
    );

    const allowed = connectSrc();
    if (allowed === null) return; // no nginx in this project; nothing to agree with

    expect(
      allowed.some((source) => source === host || source === '*'),
      `API_URL points at ${host}, which connect-src does not allow (${allowed.join(' ')}). ` +
        'Add it to docker/nginx/snippets/csp.conf, or the browser blocks every API call.',
    ).toBe(true);
  });

  it('keeps SITE_URL absolute — a relative canonical or og:url is ignored', () => {
    expect(APP_CONFIG.SITE_URL).toMatch(/^https?:\/\//);
  });

  it('keeps SITE_URL free of a trailing slash, which would double up in every URL', () => {
    expect(APP_CONFIG.SITE_URL).not.toMatch(/\/$/);
  });
});
