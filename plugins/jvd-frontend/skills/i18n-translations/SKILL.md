---
name: i18n-translations
description: "Adds or changes user-facing text. Activates when writing any text a user will see, adding a label/button/error message, or when the user mentions i18n, i18next, translation, locale, or a new language."
---

# i18n (i18next / react-i18next)

**Scope: `frontend/` only.** The backend has its own, unrelated translation
system — PHP files in `backend/lang/<locale>/`, resolved with `__()`, locale
chosen from the `Accept-Language` header. Keys are **not** shared between the
two — same locale codes, separate key sets. For a backend string see the
`laravel-api-endpoint` skill and [backend/AGENTS.md](../../../backend/AGENTS.md).

Locale codes are ISO 639-1 **language** codes on both sides: Ukrainian is `uk`,
not `ua` (`ua` is the ISO 3166-1 code for the *country*, and i18next matches on
language). The frontend directory was renamed `ua` → `uk` to line up with the
backend's `lang/uk/` — if you find a stray `ua` anywhere, it's a leftover.

## Setup

`src/i18n.ts` calls `i18n.use(initReactI18next).init(...)` with both locale
JSON files as `resources`, and `src/main.tsx` imports it once as a side effect
before mounting `<App />`. Nothing else needs a provider — `initReactI18next`
registers the default instance that every `useTranslation()` picks up.

- Both locale files are bundled at build time, so a new key is live after a
  rebuild; there is no HTTP backend and no lazy namespace loading.
- The active language persists to `localStorage` under `language`, written by an
  `i18n.on('languageChanged')` listener in `src/i18n.ts`. The switcher only
  calls `i18n.changeLanguage(code)` — don't write that key from anywhere else.
- `SUPPORTED_LANGUAGES` in `src/i18n.ts` is the list to extend for a new locale,
  alongside the `resources` entry.

## Pattern

```jsx
import { useTranslation } from 'react-i18next';

function SubmitButton() {
  const { t } = useTranslation();
  return <button>{t('orders.submit')}</button>;
}
```

`useTranslation()` is unchanged in react-i18next v16 (this repo's major).

## Rules

- Every key added to `src/locales/en/translation.json` must be added to
  `src/locales/uk/translation.json` in the **same change** — a missing key in
  one locale is a silent runtime fallback, not a build error, so it won't get
  caught otherwise. Parity is currently perfect; keep it that way.
- Namespace keys by feature/page (`orders.submit`, `auth.login.title`), not by
  component name — component names get refactored, feature names don't. Note the
  existing keys are mostly flat and single-word (`email`, `dashboard`,
  `categories`), inherited from the upstream template; prefer namespacing for
  new keys rather than retrofitting the old ones as a drive-by.
- Don't interpolate raw HTML into translation strings; use i18next's
  interpolation/`Trans` component for anything with embedded markup or variables.
- Currently only `en`/`uk` exist — don't add a third locale file speculatively
  without being asked. A new locale also needs its code in `SUPPORTED_LANGUAGES`
  and `resources` in `src/i18n.ts`, an option in the language switcher in
  `src/components/ui/DashboardHeader.tsx`, and — if it should work server-side
  too — an entry in `SetLocaleMiddleware::LOCALES` plus a `backend/lang/<code>/`
  directory.
