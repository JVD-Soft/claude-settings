# ADR-0004: Yarn 4 (node-modules linker) instead of Yarn Classic

## Status

Accepted — 2026-08-04.

## Context

Yarn Classic (1.22) has been end-of-life since 2022. It does not merely lag:
it **cannot install Vitest**. Reduced to a minimum, in a clean project whose
only dependency is `vite@^7`:

```
$ yarn add -D vitest
error Invariant Violation: could not find a copy of vite to link in
      /app/node_modules/vitest/node_modules
```

Reproduced inside `node:24-slim`, so it is not a Windows or a local-machine
artefact — it is the environment the project actually builds in. Nothing in
this repository's dependency set is at fault; the linker fails on `vite` as a
peer of `vitest`.

That blocked [ADR-0002](0002-no-test-runner-yet.md), which had already chosen
Vitest, and it would block every later dependency with a peer graph —
`vite-plugin-pwa` next.

Measured alternatives, same minimal project:

| Manager | Installs Vitest |
|---|---|
| Yarn 1.22.22 | no |
| Yarn 4.18 (`nodeLinker: node-modules`) | yes |
| pnpm 11.20 | yes |
| npm 11 | no — `ERESOLVE`, React 19 against react-helmet-async's peer range |

## Decision

Yarn 4 through Corepack, with `nodeLinker: node-modules`.

- Every command in the Dockerfile, `Makefile`, CI and the routers keeps
  working verbatim — `yarn lint`, `yarn build`, `yarn test`. pnpm would have
  renamed all of them for no benefit this project can measure.
- `resolutions` is a Yarn feature and survives the move.
- `node-modules` over the default PnP: PnP needs editor SDKs and per-tool
  patches, while Vite, ESLint and the image already expect a real
  `node_modules`.

`react-helmet-async` was removed in the same change. It declares peer
`react ^16 || ^17 || ^18`, never supported React 19, and was the reason
`resolutions` existed at all. React 19 hoists `<title>`/`<meta>`/`<link>` into
`<head>` natively, which is what `src/components/common/Meta.tsx` now uses.

## Consequences

- `yarn install --frozen-lockfile` is now `yarn install --immutable`.
- The image runs `corepack enable` and needs
  `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, or the build hangs waiting for input.
- `packageManager` in `package.json` pins the exact Yarn version; Corepack
  fetches it. Do not run a globally installed `yarn` against this project.
- `yarn.lock` keeps its name but changes format. It is not readable by Yarn 1,
  which is the point.
- `.yarn/cache` and `.yarn/install-state.gz` are ignored; `.yarn/releases`,
  `patches`, `plugins` and `versions` are committed if they ever appear.
