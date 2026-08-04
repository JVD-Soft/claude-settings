---
name: shadcn-ui-components
description: "Builds or styles UI using shadcn/ui and Radix primitives. Activates when adding a component, a dialog, a form field, a dropdown, styling work, or when the user mentions shadcn, Radix, button, card, modal, or any visual/UI element."
allowed-tools: Bash(npx shadcn@latest add *)
---

# shadcn/ui Components

## When to apply

Any time a new UI primitive or composed component is needed.

## Check before building

**List the directory first** — `src/components/ui/` already carries a large set
of primitives, and any hardcoded list here goes stale the moment someone runs
`shadcn add`:

```bash
ls frontend/src/components/ui/
```

If what you need is close to something already there, compose it — don't
hand-roll a new Radix wrapper. Note the directory also holds two app-specific
composites (`AppSidebar.tsx`, `DashboardHeader.tsx`) alongside the generated
primitives; those are ours to edit, the generated ones are not.

## Adding a genuinely new primitive

Use the `shadcn` MCP tool (`search_items_in_registries`,
`get_item_examples_from_registries`, `get_add_command_for_items`), or the CLI
directly:

```bash
npx shadcn@latest add <component-name>
```

If the `shadcn` MCP tools aren't listed in a session, it's almost always a cold
`npx` cache — the server is fetched on first launch and can miss the connect
timeout. The config is correct (it matches what `shadcn mcp init` generates);
running any `npx shadcn@latest …` command once warms the cache and it connects
on the next session. Fall back to the CLI meanwhile — `search`, `view`, `docs`
and `add` all exist as subcommands.

This respects `components.json` (style: `new-york`, base color: `slate`, icons:
`lucide-react`, CSS variables mode) automatically — don't manually copy a
component's source from the shadcn docs site, versions/tokens can drift from
what `components.json` expects.

## Conventions

- Import via the `@/components/ui/...` alias (see `components.json` → `aliases`).
- Utility class merging goes through `cn()` in `src/lib/utils.ts`
  (`clsx` + `tailwind-merge`) — don't concatenate className strings by hand.
- Icons: `lucide-react` only, matching `components.json.iconLibrary` — don't mix
  in another icon set for a one-off.
- Dark mode: theming goes through `ThemeProvider` (`src/providers/ThemeProvider.tsx`)
  and CSS variables, not per-component `dark:` overrides scattered ad hoc — check
  the existing token setup in `src/index.css` first.
