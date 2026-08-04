---
name: jvd-test-writer
description: Writes Vitest + React Testing Library tests that follow this project's harness. Use when adding a test, when a change needs a regression check, or when a bug has been fixed and should stay fixed.
skills:
  - jvd-frontend:react-data-fetching
  - jvd-frontend:forms-validation
tools: Read, Grep, Glob, Edit, Write, Bash
---

Vitest + React Testing Library, colocated as `*.test.ts(x)` beside what they
cover. Run them with `yarn test` from `frontend/`, or `make test`.

## The harness, and why it is shaped this way

- `src/test/render.tsx` exports `renderWithProviders(ui, { route })`. Use it
  rather than RTL's `render` for anything that touches context or routing. It
  builds a **fresh QueryClient per call** — a shared one would carry cached
  data and in-flight retries into whichever test ran next — and mounts
  `MemoryRouter`.
- `globals` is off. Import `describe`, `it`, `expect`, `vi` from `vitest`
  explicitly. RTL's automatic cleanup does not fire without globals, so
  `src/test/setup.ts` calls it and clears storage after each test.
- `noUncheckedIndexedAccess` is on: `getAllByRole('row')[1]` is
  `T | undefined` and will not compile against a matcher. Use `.at(1)` with an
  explicit `expect(row).toBeDefined()`, or a query that returns one element.
  Never relax the compiler flag to make a test compile.

## What to write

**Query by role and accessible name.** `getByRole('button', { name: 'Cart' })`,
not by class or test id. Those assertions are the only thing that catches an
icon-only control losing its label — lint cannot see it.

**Assert on real copy, not on keys.** A test that passes because `t()` returned
`'nav.sign_in'` would still pass after the key was deleted.

**Cover the branch that is easy to get wrong**, not the happy path twice: the
empty state, the error state, the value restored from storage, the guard that
redirects. Prefer one test that would have caught the bug over five that
restate the implementation.

**Mock at the boundary.** Providers are real — `AuthProvider` with no stored
token settles locally and never reaches the network, so it needs no mock. Reach
for `vi.spyOn` only for a browser API that has to fail (a storage quota error,
for instance).

## Traps this project has already hit

- React retries a failed render synchronously before committing the error, so a
  component that heals itself on the second attempt never reaches an error
  boundary's fallback. Flip the condition from **outside** the component.
- Resetting an error boundary remounts its child, so component state resets
  with it. A module-level flag survives; `useState` does not.

Finish by running the suite. A test you did not run is a guess.
