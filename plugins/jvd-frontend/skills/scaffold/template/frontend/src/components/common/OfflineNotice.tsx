import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * A bar rather than a toast: being offline is a state, not an event, and it
 * has to stay on screen for as long as it is true.
 *
 * Without it the app offline looks broken — the shell loads from the service
 * worker's precache and then every request fails with a generic error, which
 * reads as "the site is down" rather than "you are not connected".
 */
export const OfflineNotice = () => {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground"
    >
      <WifiOff size={16} aria-hidden="true" />
      {t('pwa.offline')}
    </div>
  );
};
