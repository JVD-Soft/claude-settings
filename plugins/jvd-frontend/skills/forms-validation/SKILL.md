---
name: forms-validation
description: "Builds or validates a form. Activates when adding a form, an input field, client-side validation, error messages, or when the user mentions react-hook-form, zod, schema, or form submission."
---

# Forms & Validation (react-hook-form + zod v4)

## When to apply

Any new form, or adding/changing validation on an existing one.

## Version trap — this repo is on zod v4

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

Define the schema once, derive types from it, wire it through `zodResolver` —
don't write manual `if (!value) setError(...)` validation:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.email(),                 // v4 top-level format fn
  password: z.string().min(8),      // .min() is still a chained method
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit((values) => {
    // values is fully typed from the schema — no `any`
  });
}
```

Note: `@hookform/resolvers` isn't in `package.json` yet — add it alongside the
first form that needs schema validation, don't assume it's already installed.
No file under `src/` imports zod yet either, so there is no in-repo usage to
copy; this skill is the reference until one exists.

## Conventions

- Reference forms already in the codebase before inventing a new pattern:
  `src/pages/Auth/LoginPage.tsx`, `RegisterPage.tsx`, `ResetPasswordPage.tsx`,
  `ForgotPasswordPage.tsx` are the existing auth forms — match their structure.
  They are hand-rolled `useState` forms, not RHF; type the submit handler as
  `FormEvent<HTMLFormElement>` and pass it as `onSubmit={(e) => void handleSubmit(e)}`
  when it's async, or `no-misused-promises` rejects it.
- Error messages are user-facing text → go through `t()` (see the
  `i18n-translations` skill), not hardcoded strings in the zod schema.
- Server-side validation errors (from the Laravel backend, typically a 422 with
  a field → messages map) should map back onto the same RHF field errors via
  `form.setError(fieldName, { message })` inside the mutation's `onError`, not
  a separate ad hoc error state. (`setError` is a react-hook-form API — it keeps
  `message`; only zod renamed its param to `error`.)
