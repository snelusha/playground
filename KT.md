# Ballerina Playground KT Notes

This document is a knowledge-transfer guide for the Ballerina Playground codebase.

## 1. What the Playground is

Ballerina Playground is a browser-based tool for trying Ballerina code. The web frontend loads a WebAssembly build of the Ballerina interpreter and provides the editor, file tree, run button, output pane, examples, and sharing features.

High-level flow:

```text
React Web App
   |
   | user edits/runs files
   v
Virtual FS in browser
   |
   | snapshot passed to worker
   v
Web Worker
   |
   | loads ballerina.wasm
   v
Go WASM wrapper
   |
   | delegates to ballerina-lang-go
   v
Ballerina parser/compiler/interpreter/runtime
```

> **Illustration suggestion:** Add a high-level architecture diagram here showing Web UI, browser FS, worker, WASM runtime, and `ballerina-lang-go`.

## 2. Repository and package structure

The repo is a Bun workspace monorepo. Workspaces are defined in the root `package.json` as:

```text
apps/*
packages/*
```

Current important packages:

### `@playground/web` — `apps/web`

The frontend application.

Responsibilities:

- React + Vite UI
- File explorer/sidebar
- Code editor
- Output pane
- Browser virtual filesystem
- Worker client
- WASM loading
- Sharing links
- Examples display
- Diagnostics integration through a fake/minimal LSP transport

Important files:

- `apps/web/src/main.tsx`
- `apps/web/src/components/editor.tsx`
- `apps/web/src/components/code-editor.tsx`
- `apps/web/src/providers/fs-provider.tsx`
- `apps/web/src/workers/ballerina-worker.ts`
- `apps/web/src/lib/fs/**`

### `@playground/wasm` — `packages/wasm`

The Go package that builds `ballerina.wasm`.

Responsibilities:

- Thin wrapper around `ballerina-lang-go`
- Exposes functions to JavaScript
- Bridges browser FS into Go FS APIs
- Provides browser platform abstraction for stdout/stderr and HTTP/fetch
- Generates `ballerina-meta.json`

Important files:

- `packages/wasm/main_wasm.go`
- `packages/wasm/bridge_fs_wasm.go`
- `packages/wasm/promise_wasm.go`
- `packages/wasm/pal_wasm.go`
- `packages/wasm/scripts/gen-meta.sh`

> **Illustration suggestion:** Add a package-structure diagram here with `apps/web`, `packages/wasm`, and `packages/wasm/ballerina-lang-go`.

## 3. Dependency on `ballerina-lang-go`

`ballerina-lang-go` is included as a Git submodule:

```text
packages/wasm/ballerina-lang-go
```

Defined in `.gitmodules`:

```text
[submodule "packages/wasm/ballerina-lang-go"]
  path = packages/wasm/ballerina-lang-go
  url = https://github.com/ballerina-platform/ballerina-lang-go.git
```

The WASM package uses a local Go module replacement in `packages/wasm/go.mod`:

```go
replace ballerina-lang-go => ./ballerina-lang-go
require ballerina-lang-go v0.0.0-00010101000000-000000000000
```

So normal builds use the checked-out submodule instead of fetching `ballerina-lang-go` from an external Go proxy.

## 4. Go-side thin wrapper for WASM

The Go wrapper exposes a small API to JavaScript.

In `packages/wasm/main_wasm.go`:

```go
js.Global().Set("run", js.FuncOf(run))
js.Global().Set("getDiagnostics", js.FuncOf(getDiagnostics))
```

### `run(fsProxy, path, onOutput)`

Responsibilities:

1. Build a bridge FS from the JS FS proxy.
2. Load the Ballerina project/file using `projects.Load`.
3. Print project/compilation diagnostics if there are errors.
4. Generate BIR.
5. Create runtime with the WASM platform abstraction.
6. Interpret the BIR package.
7. Stream output back to JS using the callback.

### `getDiagnostics(fsProxy, path)`

Responsibilities:

1. Load project/file.
2. Collect project diagnostics.
3. Collect compilation diagnostics.
4. Convert them into LSP-like diagnostic objects for CodeMirror.

## 5. Async handling between JS and Go WASM

The Go side returns JavaScript `Promise`s using `newPromise` in `packages/wasm/promise_wasm.go`.

```go
func newPromise(fn func(resolve, reject js.Value)) js.Value
```

The wrapper runs work inside goroutines and resolves the JS promise when done.

The Go side also calls async JavaScript APIs such as browser FS methods and `fetch`. That is handled by:

```go
func awaitPromise(promise js.Value) (js.Value, error)
```

Used in:

- `packages/wasm/bridge_fs_wasm.go`
- `packages/wasm/pal_wasm.go`

Important point: Go code sees synchronous-looking APIs, while the JS side remains Promise-based.

## 6. File system bridge between JS and Go

### JS-side FS interface

Defined in `apps/web/src/lib/fs/core/fs.interface.ts`:

```ts
export interface FS {
  open(path: string): Promise<OpenResult | null>;
  stat(path: string): Promise<StatResult | null>;
  readDir(path: string): Promise<DirEntry[] | null>;
  writeFile(path: string, content: string): Promise<boolean>;
  remove(path: string): Promise<boolean>;
  move(oldPath: string, newPath: string): Promise<boolean>;
  mkdirAll(path: string): Promise<boolean>;
}
```

This is the contract that the Go bridge expects.

### Go-side FS bridge

Defined in `packages/wasm/bridge_fs_wasm.go`.

The Go type `bridgeFS` implements the interfaces expected by `ballerina-lang-go`, including Go `fs.FS`-style operations and mutable/writable FS operations.

Mapping:

| Go operation | JS FS operation |
| --- | --- |
| `Open` | `open`, `stat`, `readDir` |
| `WriteFile` | `writeFile` |
| `MkdirAll` | `mkdirAll` |
| `Move` | `move` |
| `Remove` | `remove` |
| `Create` | `writeFile` + `Open` |

> **Illustration suggestion:** Add an FS bridge diagram here: `ballerina-lang-go` FS expectations → Go `bridgeFS` → JS `FS` interface → browser FS implementations.

## 7. Browser-side filesystem design

Browser FS lives under `apps/web/src/lib/fs`.

### `AbstractFS`

File: `apps/web/src/lib/fs/core/abstract-fs.ts`

Base tree implementation. It stores nodes like:

```ts
{
  isDir: true,
  children: {
    "main.bal": {
      isDir: false,
      content: "...",
      modTime: 123
    }
  }
}
```

Provides:

- `open`
- `stat`
- `readDir`
- `writeFile`
- `remove`
- `move`
- `mkdirAll`
- `transformToTree`

### `EphemeralFS`

File: `apps/web/src/lib/fs/ephemeral-fs.ts`

Temporary in-memory FS. Used for:

- bundled examples
- shared files loaded from share links

It does not persist after refresh.

### `LocalStorageFS`

File: `apps/web/src/lib/fs/local-storage-fs.ts`

Persistent browser storage. It stores the FS tree in `localStorage` under key:

```text
bfs
```

Used for user-created local packages/files.

### `LayeredFS`

File: `apps/web/src/lib/fs/layered-fs.ts`

Combines two filesystems:

```text
/tmp   -> EphemeralFS
/local -> LocalStorageFS
```

Special roots are defined in `apps/web/src/lib/fs/fs-roots.ts`:

```ts
TEMP_ROOT = "/tmp"
LOCAL_ROOT = "/local"
EXAMPLES_ROOT = "/tmp/examples"
SHARED_ROOT = "/tmp/shared"
```

> **Illustration suggestion:** Add a layered FS diagram here showing `LayeredFS` with `/tmp/examples`, `/tmp/shared`, and `/local`.

## 8. Snapshot FS and worker boundary

File: `apps/web/src/lib/fs/snapshot.ts`

Before running code or collecting diagnostics, the app creates a read-only snapshot:

```ts
const snapshot = await SnapshotFS.from(fs, path);
```

Reasons:

- Worker should not depend on live mutable UI FS state.
- Comlink proxy calls become stable and simple.
- Runtime sees a consistent filesystem during execution.
- Snapshot implements the same `FS` interface.
- Write operations intentionally return `false`.

Used in:

- `apps/web/src/hooks/use-ballerina.ts`
- `apps/web/src/lib/ballerina-ls.ts`

## 9. Web Worker runtime model

Important files:

- `apps/web/src/workers/ballerina-worker.ts`
- `apps/web/src/workers/ballerina-worker-client.ts`
- `apps/web/src/workers/ballerina-worker-api.ts`

Main thread uses `BallerinaWorkerClient`.

Worker initialization flow:

1. Import `wasm_exec`.
2. Fetch `ballerina.wasm`.
3. Track loading progress.
4. Instantiate WASM with the Go import object.
5. Run the Go runtime.
6. Wait until Go exposes `self.run`.
7. Expose the worker API using Comlink.

Worker API:

```ts
init(wasmUrl, onProgress)
run(snapshot, path, onOutput)
getDiagnostics(snapshot, path)
```

The WASM URL is built using `import.meta.env.BASE_URL`, so it works when hosted under a subpath.

## 10. Static-host dynamic path hack

There are two related fixes for static hosting.

### GitHub Pages SPA fallback

In `apps/web/vite.config.ts`, the `githubPagesSpa()` Vite plugin copies:

```text
dist/index.html -> dist/404.html
```

This allows direct navigation to dynamic routes on GitHub Pages. If GitHub Pages cannot find a path, it serves `404.html`, which is actually the app.

### Router base path

In `apps/web/src/main.tsx`:

```ts
basepath: getRouterBasePath(import.meta.env.BASE_URL)
```

This lets TanStack Router work when the app is hosted under a non-root base path.

## 11. Running Ballerina code

Run flow:

1. User clicks Run.
2. UI saves the dirty active file.
3. App determines the target:
   - If inside a package with `Ballerina.toml`, run the package directory.
   - Otherwise run the single `.bal` file.
4. App creates a `SnapshotFS`.
5. Main thread calls worker `run`.
6. Worker calls Go WASM `run`.
7. Go loads, compiles, generates BIR, and interprets.
8. stdout/stderr are streamed back through the callback.
9. Output pane appends the text.

Important files:

- `apps/web/src/components/editor.tsx`
- `apps/web/src/hooks/use-ballerina.ts`
- `packages/wasm/main_wasm.go`

## 12. Browser platform abstraction in WASM

File: `packages/wasm/pal_wasm.go`

This implements browser-specific platform behavior for `ballerina-lang-go`.

Currently handles:

- stdout
- stderr
- HTTP client via browser `fetch`

HTTP behavior:

- Uses browser `fetch`
- Converts Go request body into `Uint8Array`
- Reads response using `arrayBuffer`
- Supports timeout using `AbortController`
- Supports redirect mode

Important limitation: browser HTTP is still subject to browser CORS rules.

## 13. Diagnostics without a proper language server

Current diagnostics are implemented using a minimal/fake LSP transport.

File: `apps/web/src/lib/ballerina-ls.ts`

`BallerinaLS` implements CodeMirror `Transport`.

It handles:

- `initialize`
- `textDocument/didOpen`
- `textDocument/didChange`

On open/change:

1. Save active file.
2. Find the Ballerina project target using `getBallerinaProjectTarget`.
3. Create `SnapshotFS`.
4. Call WASM `getDiagnostics`.
5. Publish `textDocument/publishDiagnostics`.

It does not provide full language-server features such as:

- completion
- hover
- go to definition
- rename
- formatting

So it is LSP-shaped, but not a real Ballerina language server.

## 14. Code editor

Current editor: CodeMirror 6.

File: `apps/web/src/components/code-editor.tsx`

Features:

- Explicit CodeMirror setup instead of `basicSetup`
- Shiki-based highlighting through `ShikiEditor`
- Ballerina mode using a temporary C-like stream parser hack:

```ts
StreamLanguage.define(clike({ name: "ballerina" }))
```

- Vim mode via `@replit/codemirror-vim`
- Diagnostics via `@codemirror/lsp-client`

Current `@codemirror/lsp-client` usage is mainly for diagnostics, backed by the custom `BallerinaLS` transport.

## 15. Examples generation and display

Examples live in:

```text
examples/
```

Generated into:

```text
apps/web/src/assets/examples.json
```

Generation command from `apps/web/package.json`:

```json
"gen:examples": "go run ../../scripts/example_gen/main.go ../../examples src/assets/examples.json"
```

The generator:

- Walks `examples/`
- Includes only `.bal` and `.toml`
- Skips empty directories
- Wraps generated tree under `/tmp/examples`

At runtime, `FSProvider` loads this JSON into `EphemeralFS`. The sidebar displays examples under the “Examples” section.

## 16. Sharing files and examples

Important files:

- `apps/web/src/lib/share.ts`
- `apps/web/src/hooks/use-share.ts`
- `apps/web/src/hooks/use-copy-share-link.ts`

Share flow:

1. Convert selected file/folder to a `FileNode`.
2. JSON stringify.
3. Gzip using `CompressionStream`.
4. Base64 encode.
5. Store in URL query param:

```text
?share=...
```

Open shared link flow:

1. Decode base64.
2. Gunzip using `DecompressionStream`.
3. Validate safe file node names.
4. Graft into:

```text
/tmp/shared
```

Shared files can then be forked into:

```text
/local
```

## 17. Stores: high-level idea

State management uses Zustand.

### `file-tree-store.ts`

Owns file tree and FS-related app state:

- temp tree
- local tree
- active file
- dirty state
- expanded folders
- file operation dialogs
- create/delete/rename/open/save
- load shared files

### `editor-store.ts`

Owns editor/output UI state:

- output text
- output pane open/closed
- editor mode: `standard` or `vim`

Editor mode is persisted in localStorage.

## 18. Routing

Routing uses TanStack Router.

Important files:

- `apps/web/src/main.tsx`
- `apps/web/src/routes/$.tsx`
- `apps/web/src/components/file-route-sync.tsx`

The route path tracks the active file. Example:

```text
/tmp/examples/02-http-client.bal
```

`FileRouteSync` keeps the URL and active file synchronized.

Default file:

```text
/tmp/examples/02-http-client.bal
```

## 19. Version metadata

WASM build generates:

```text
packages/wasm/dist/ballerina-meta.json
```

Script:

```text
packages/wasm/scripts/gen-meta.sh
```

It records:

- exact tag if the current submodule commit matches a tag
- otherwise short commit hash
- full commit hash

The web package copies it to:

```text
apps/web/public/ballerina-meta.json
```

Vite reads it in `apps/web/vite.config.ts` and injects:

```ts
__BALLERINA_VERSION__
```

The UI shows it in:

```text
apps/web/src/components/version-card.tsx
```

Vite also injects:

```ts
__COMMIT_SHA__
```

for the Playground version, normally passed by GitHub Actions during deploy.

## 20. Turbo tasks: high-level

Root `turbo.json` defines:

### `build`

- Depends on workspace dependency builds.
- Outputs `dist/**`.

### `dev`

- Depends on dependency builds.
- Persistent.
- Not cached.

### `test`

- Not cached.

### `clean`

- Not cached.

`apps/web/turbo.json` adds:

- `copy:wasm` depends on `@playground/wasm#build`
- `build` depends on `copy:wasm`
- `dev` depends on `copy:wasm`
- `test` depends on `copy:wasm`

So the web app gets fresh copies of:

```text
public/ballerina.wasm
public/ballerina-meta.json
```

before dev/build/test.

## 21. Build and deploy pipeline

CI workflow:

```text
.github/workflows/ci.yml
```

Runs:

1. checkout with submodules
2. setup Go 1.26
3. setup Bun 1.3.10
4. `bun install`
5. `bun run lint`
6. `bun run test`
7. `bun run build`
8. install Playwright browsers
9. `bun run test:e2e`

Deploy workflow:

```text
.github/workflows/deploy.yml
```

On `main` branch:

1. Build app.
2. Pass `COMMIT_SHA`.
3. Upload `apps/web/dist`.
4. Deploy to GitHub Pages.

## 22. Current tests

### Bun/WASM integration tests

Files:

- `apps/web/tests/ballerina.test.ts`
- `apps/web/tests/test-fs.ts`

These tests:

- Load `ballerina.wasm`
- Instantiate the Go WASM runtime
- Provide a test FS
- Call global `run`
- Assert stdout/stderr

Current cases:

- hello world single file
- hello world package

### Playwright E2E test

File:

```text
e2e/tests/playground.spec.ts
```

Tests browser flow:

1. Load app.
2. Wait for WASM loading to finish.
3. Create a new local package.
4. Run hello world.
5. Assert output.

## 23. Current limitations and future discussion points

Useful points to mention at the end of the KT:

- No real Ballerina language server yet.
- Diagnostics are compiler-driven through WASM, not full LS-driven.
- Ballerina syntax mode is currently a C-like CodeMirror hack.
- FS is browser-local; there is no backend persistence.
- `LocalStorageFS` has browser localStorage size limits.
- `SnapshotFS` is read-only, so runtime-side writes are not persisted.
- WASM startup can be heavy, so loading is done in a worker with progress UI.
- Browser HTTP depends on `fetch` and browser CORS rules.

## 24. Recommended KT session order

1. What the Playground is
2. Repo/package structure
3. Build/dependency model
4. `ballerina-lang-go` submodule
5. WASM package and Go wrapper
6. JS-exposed functions
7. Async bridge
8. Browser FS interface
9. Go FS bridge
10. Browser FS implementations
11. Snapshot FS
12. Worker runtime
13. Run flow
14. Diagnostics flow
15. Code editor
16. Examples
17. Routing/static-host hack
18. Sharing/forking files
19. Version metadata
20. Stores
21. Turbo tasks
22. CI/CD
23. Tests
24. Current limitations/future work
