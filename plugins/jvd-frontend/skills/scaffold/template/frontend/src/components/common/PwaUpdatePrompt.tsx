import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Offers the reload when a new service worker is waiting.
 *
 * The worker is registered with `registerType: 'prompt'` and never calls
 * skipWaiting on its own: with the pages behind dynamic imports, swapping the
 * worker under a live session breaks the next chunk request on whatever page
 * the user is reading. This puts the choice in front of them instead.
 */
export const PwaUpdatePrompt = () => {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;

    const id = toast(
      (instance) => (
        <span className="flex items-center gap-3">
          {t('pwa.update_available')}
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1 text-xs font-semibold text-background"
            onClick={() => {
              toast.dismiss(instance.id);
              void updateServiceWorker(true);
            }}
          >
            {t('pwa.reload')}
          </button>
        </span>
      ),
      { duration: Infinity },
    );

    return () => toast.dismiss(id);
  }, [needRefresh, t, updateServiceWorker]);

  return null;
};
