import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { getApiErrorBody } from '@/api/apiClient';

/**
 * Puts a 422's field errors back on the form that produced them.
 *
 * The backend answers validation failures with `{ errors: { field: [msg] } }`
 * and those messages are already translated (`lang/{en,uk}/`), so they are
 * shown as-is rather than being mapped to a client-side string that would then
 * have to be kept in step with the server's rules.
 *
 * Returns whether anything was placed. `false` means the 422 was about
 * something with no input to attach it to — `items` on an order, `order` on a
 * review, `category_ids` on a profile — and the caller should render it as a
 * banner instead of silently swallowing it.
 */
export const applyApiErrors = <TValues extends FieldValues>(
  error: unknown,
  form: UseFormReturn<TValues>,
  fields: readonly string[],
): boolean => {
  const fieldErrors = getApiErrorBody(error)?.errors ?? {};
  let applied = false;

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (!message || !fields.includes(field)) continue;

    form.setError(field as Path<TValues>, { message });
    applied = true;
  }

  return applied;
};
