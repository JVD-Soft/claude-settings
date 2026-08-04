import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { isStaleChunkError } from '@/lib/errors';

interface Props {
  error: Error;
  onRetry: () => void;
}

export const ErrorFallback = ({ error, onRetry }: Props) => {
  const { t } = useTranslation();
  const stale = isStaleChunkError(error);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-semibold text-foreground">
        {t(stale ? 'errors.stale_title' : 'errors.crashed_title')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t(stale ? 'errors.stale_body' : 'errors.crashed_body')}
      </p>
      {stale ? (
        <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
      ) : (
        <Button onClick={onRetry}>{t('errors.retry')}</Button>
      )}
    </div>
  );
};
