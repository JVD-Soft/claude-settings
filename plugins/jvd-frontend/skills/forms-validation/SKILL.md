---
name: forms-validation
description: "Builds or validates a form. Activates when adding a form, an input field, client-side validation, error messages, or when the user mentions react-hook-form, zod, schema, or form submission."
---

# Forms & Validation (react-hook-form + zod v4)

## When to apply

Any new form, or adding/changing validation on an existing one.

## Version trap — this stack is on zod v4

`package.json` pins `zod: ^4.x`. Most zod examples online (and most model
training data) are **v3** and will produce deprecated or broken code here:

| v3 (wrong here) | v4 (correct) |
|---|---|
| `z.string().email()` | `z.email()` |
| `z.string().url()` | `z.url()` |
| `z.string().uuid()` | `z.uuid()` |
| `z.string().datetime()` | `z.iso.datetime()` |
| `{ message: '…' }` | `{ error: '…' }` |
| `invalid_type_error` / `required_error` / `errorMap` | removed — use `error` |

String *formats* are top-level functions in v4; `.min()` / `.max()` / `.regex()`
are still chained methods. When unsure, check with the `context7` MCP server
against `/colinhacks/zod` rather than recalling from memory.

## Pattern

Copy an existing form rather than this snippet — every form in the app is built
this way. The shape:

```tsx
const buildSchema = (t: (key: string) => string) =>
  z.object({
    email: z.email({ error: t('errors.email') }),
    password: z.string().min(8, { error: t('errors.password') }),
  });

type Values = z.infer<ReturnType<typeof buildSchema>>;
const FIELDS = ['email', 'password'] as const;

const form = useForm<Values>({
  resolver: zodResolver(buildSchema(t)),
  defaultValues: { email: '', password: '' },
});

const onSubmit = form.handleSubmit(async (values) => {
  setFormError(null);
  try {
    await mutate(values);
  } catch (error) {
    if (!applyApiErrors(error, form, FIELDS)) {
      setFormError(getApiErrorMessage(error) ?? t('…'));
    }
  }
});
```

```tsx
<form onSubmit={(event) => void onSubmit(event)} noValidate>
```

## Rules

- **`noValidate` on the `<form>`, always.** Without it the browser's own
  constraint validation runs first: a `type="email"` input with bad text blocks
  the submit event entirely, so the schema never runs and the user sees an
  untranslated native bubble instead of the app's message. The form looks
  broken — the button does nothing — and no test that only checks the happy
  path will catch it.
- **The schema is built by a function taking `t`**, never defined at module
  scope. Messages are user-facing and have to change with the language; a
  module-level schema captures whatever locale was active at import time.
- The submit handler is `form.handleSubmit(...)`, passed as
  `onSubmit={(event) => void onSubmit(event)}` when it is async, or
  `no-misused-promises` rejects it.
- Error messages are user-facing text → through `t()` (see the
  `i18n-translations` skill), never hardcoded in the schema.
- Server-side validation errors (a 422 with a field → messages map) go back onto
  the same RHF fields, not into a separate ad hoc error state. Use
  **`applyApiErrors(error, form, fields)` from `@/lib/formErrors`** rather than
  writing the loop again. It returns `false` when the 422 was about something
  with no input to attach to — `items` on an order, `order` on a review,
  `category_ids` on a profile — which is the signal to render a banner instead
  of swallowing the message.

  The backend's messages arrive already translated (`lang/{en,uk}/`), so they
  are shown as-is rather than mapped to a client string that would then have to
  be kept in step with the server's rules. (`setError` under the hood is a
  react-hook-form API and keeps `message`; only zod renamed its param to
  `error`.)
- Auth screens share `AuthCard` (`src/components/auth/AuthCard.tsx`) for their
  frame. They sit outside both app shells, so without it each one drifts — and
  `AuthCard` is where `noindex` lives, which a sign-in page needs and
  `robots.txt` cannot provide.
