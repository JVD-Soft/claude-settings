import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { getApiErrorBody } from '@/api/apiClient';

/**
 * Puts a 422's field errors back on the fields they came from.
 *
 * The API answers validation with `{ errors: { field: [msg] } }`. Showing only
 * the envelope's `message` ("The given data was invalid") leaves the user
 * hunting for which input is wrong, on a form that may have a dozen.
 *
 * Returns true if anything was attached, so the caller can decide whether it
 * still needs a general error message.
 */
export const applyServerErrors = <T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean => {
  const errors = getApiErrorBody(error)?.errors;
  if (!errors) return false;

  let attached = false;
  for (const [field, messages] of Object.entries(errors)) {
    const message = messages?.[0];
    if (!message) continue;
    // A field the form does not have (the API validating something we do not
    // render) would otherwise silently swallow the message.
    setError(field as Path<T>, { type: 'server', message });
    attached = true;
  }
  return attached;
};
