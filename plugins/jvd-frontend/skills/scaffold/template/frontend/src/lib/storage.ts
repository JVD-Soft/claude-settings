/**
 * localStorage that cannot throw.
 *
 * Two callers run outside a browser: the build-time prerender executes module
 * bodies in Node, where `localStorage` is not defined, and Safari in private
 * mode throws on `setItem` once the quota is reached. Reading storage at module
 * scope — which `i18n.ts` does — turns either into a blank page.
 */
const available = (): boolean => typeof window !== 'undefined' && 'localStorage' in window;

export const safeStorage = {
  get(key: string): string | null {
    if (!available()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    if (!available()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota or a locked-down browser. Losing a preference is not worth a crash.
    }
  },

  remove(key: string): void {
    if (!available()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // As above.
    }
  },
};
