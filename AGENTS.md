# AGENTS.md

## Task Completion Requirements
- `bun run lint` must pass (Biome: `biome check .`).
- If you change formatting, run `bun run format` (Biome: `biome format . --write`) and re-run `bun run lint`.
- If you touch the WASM runtime or WASM loading behavior, ensure `bun --cwd packages/wasm run build` succeeds and the web app still runs after copying the wasm via `bun --cwd apps/web run copy:wasm`.

## Project Snapshot
Ballerina Playground is a browser-based editor/runner for the Ballerina language. The web UI (`apps/web`) runs the interpreter client-side by loading `packages/wasm/dist/ballerina.wasm` (built from Go 1.26+) and executing it via the Go WASM glue in `apps/web/src/wasm_exec.js`.

This is a Bun + Turborepo monorepo (`turbo.json`) with Biome as the formatter/linter (`biome.json`).

## Development Commands
From repo root:
- **Install**: `bun install`
- **Dev (all workspaces)**: `bun run dev` (Turbo: `turbo run dev`)
- **Build (all workspaces)**: `bun run build` (Turbo: `turbo run build`)
- **Format**: `bun run format`
- **Lint**: `bun run lint`
- **Lint (fix)**: `bun run lint:fix`

Workspace commands:
- **Web dev**: `bun --cwd apps/web run dev` (Vite)
- **Web build**: `bun --cwd apps/web run build` (`tsc -b && vite build`)
- **WASM build**: `bun --cwd packages/wasm run build` (Go `GOOS=js GOARCH=wasm`)
- **Copy wasm into web**: `bun --cwd apps/web run copy:wasm` (to `apps/web/public/ballerina.wasm`)

## Package / Directory Roles
- **`apps/web/`**: Vite + React UI (TanStack Router) and the in-browser runner UI.
	- **Routes**: `apps/web/src/routes/` (generated tree: `apps/web/src/routeTree.gen.ts`).
	- **App components**: `apps/web/src/components/` (e.g. `editor.tsx`).
	- **UI components (shadcn)**: `apps/web/src/components/ui/`.
	- **State**: `apps/web/src/stores/` (Zustand; e.g. `editor-store.ts`, `file-tree-store.ts`).
	- **Virtual FS**: `apps/web/src/lib/fs/` + provider `apps/web/src/providers/fs-provider.tsx`.
- **`packages/wasm/`**: Go module that builds `dist/ballerina.wasm`.
	- **`packages/wasm/ballerina-lang-go/`**: git submodule used by the WASM runtime.
- **`scripts/`**: supporting scripts.

## Conventions (what to follow)
- **Formatting/lint**: Biome (`biome.json`)
	- Tabs for indentation
	- Double quotes in JS/TS
- **Imports in web app**: use `@/…` alias (configured in `apps/web/tsconfig.json` and `apps/web/vite.config.ts`).
- **Generated files**: treat `apps/web/src/routeTree.gen.ts` as generated output (edit `apps/web/src/routes/` instead).

## shadcn Components (important)
This repo uses shadcn with config in `apps/web/components.json`:
- shadcn CSS is imported from `apps/web/src/styles.css` via `@import "shadcn/tailwind.css";`
- shadcn components live in `apps/web/src/components/ui/` (e.g. `button.tsx`, `dialog.tsx`, `sidebar.tsx`).

Guidelines:
- Prefer reusing existing `apps/web/src/components/ui/*` components rather than creating one-off UI primitives in feature files.
- Keep the `cn()` utility (`apps/web/src/lib/utils.ts`) as the standard for className composition.
- When adding a new shadcn component, keep it under `apps/web/src/components/ui/` and use the aliases from `apps/web/components.json` (`ui`, `components`, `utils`).

## Testing
No test runner is currently configured (no `*.test.*`/`*.spec.*` files or test scripts/deps found).

## Do’s and Don’ts
- **Do** use the existing Bun/Turbo scripts; don’t invent new command flows.
- **Do** keep changes aligned with Biome formatting (tabs, double quotes).
- **Do** preserve the browser-only architecture: execution happens via WASM + virtual filesystem (`LayeredFS`), not a backend service.
- **Don’t** hand-edit generated router output (`apps/web/src/routeTree.gen.ts`).
- **Don’t** add ESLint/Prettier unless the repo explicitly moves away from Biome.

