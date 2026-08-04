import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** `warning` is for a notice the user did not cause, like an expired session. */
  tone?: 'error' | 'warning';
  className?: string;
}

export const FormAlert = ({ children, tone = 'error', className }: Props) => (
  <div
    role="alert"
    className={cn(
      'rounded-lg border p-3 text-sm font-semibold',
      tone === 'error'
        ? 'border-destructive bg-destructive/10 text-destructive'
        : 'border-warning bg-warning/10 text-warning-foreground',
      className,
    )}
  >
    {children}
  </div>
);
