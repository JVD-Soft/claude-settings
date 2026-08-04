import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const getSnapshot = () => navigator.onLine;

// Node has no navigator.onLine; the prerender should not claim either way.
const getServerSnapshot = () => true;

/**
 * `navigator.onLine` only reports whether the machine has *a* network — a
 * captive portal reads as online. It is enough to explain why every request
 * just started failing, which is the whole job here.
 */
export const useOnlineStatus = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
