import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeStorage } from '@/lib/storage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('safeStorage', () => {
  it('round-trips a value', () => {
    safeStorage.set('k', 'v');
    expect(safeStorage.get('k')).toBe('v');

    safeStorage.remove('k');
    expect(safeStorage.get('k')).toBeNull();
  });

  it('returns null for a key that was never set', () => {
    expect(safeStorage.get('missing')).toBeNull();
  });

  it('swallows a quota error instead of crashing the caller', () => {
    // Safari in private mode throws here once the quota is reached. Losing a
    // preference is acceptable; taking the page down with it is not.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => {
      safeStorage.set('k', 'v');
    }).not.toThrow();
  });

  it('returns null when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(safeStorage.get('k')).toBeNull();
  });

  it('swallows a removal error', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(() => {
      safeStorage.remove('k');
    }).not.toThrow();
  });
});
