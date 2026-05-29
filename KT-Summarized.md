# Ballerina Playground — 45min KT Session

## 1. What the Playground is (3 min)

Browser-based IDE for Ballerina code.

High-level flow:

```
React Web App → Virtual FS → Web Worker → Go WASM → ballerina-lang-go
```

That's it. Users edit/run files in the browser; everything happens client-side.

---

## 2. Monorepo structure (2 min)

Bun workspace with two key pieces:

- **`apps/web`** — React frontend (Vite, TanStack Router)
- **`packages/wasm`** — Go package that builds `ballerina.wasm`

The WASM package wraps `ballerina-lang-go` (Git submodule at `packages/wasm/ballerina-lang-go`).

---

## 3. Go WASM wrapper (5 min)

File: `packages/wasm/main_wasm.go`

Exposes two functions to JavaScript:

```go
js.Global().Set("run", js.FuncOf(run))
js.Global().Set("getDiagnostics", js.FuncOf(getDiagnostics))
```

### `run(fsProxy, path, onOutput)`

1. Build a bridge FS from the JS proxy
2. Load/compile the Ballerina file or package
3. Generate BIR
4. Interpret and stream output back via callback

### `getDiagnostics(fsProxy, path)`

1. Load/compile the file
2. Collect errors
3. Return LSP-like diagnostics

Both use `ballerina-lang-go` under the hood.

---

## 4. Browser FS architecture (7 min)

### JS-side FS interface

`apps/web/src/lib/fs/core/fs.interface.ts`:

```ts
(open, stat, readDir, writeFile, remove, move, mkdirAll);
```

### Go-side FS bridge

`packages/wasm/bridge_fs_wasm.go`: Implements Go `fs.FS` and wraps JS FS calls.

### Browser FS implementations

Three separate filesystems, layered by path:

1. **`EphemeralFS`** — In-memory (examples, shared files)
   - Lives under `/tmp`
2. **`LocalStorageFS`** — Persistent browser storage
   - Lives under `/local`
3. **`LayeredFS`** — Combines both

Special roots:

```
/tmp/examples — bundled examples
/tmp/shared   — files from share links
/local        — user-created files
```

### Snapshot FS

Before running or getting diagnostics, create a read-only snapshot: `SnapshotFS.from(fs, path)`. This ensures the worker sees a stable, consistent filesystem.

---

## 5. Web Worker runtime (5 min)

Files:

- `apps/web/src/workers/ballerina-worker.ts`
- `apps/web/src/workers/ballerina-worker-client.ts`

**Initialization:**

1. Fetch `ballerina.wasm`
2. Instantiate WASM with Go import object
3. Wait for Go to expose `self.run`
4. Expose worker API via Comlink

**Worker API:**

```ts
init(wasmUrl, onProgress);
run(snapshot, path, onOutput);
getDiagnostics(snapshot, path);
```

**Why a worker?** Keeps heavy WASM operations off the main thread.

---

## 6. Run flow (4 min)

1. User clicks Run
2. UI saves dirty file
3. Determine target: package directory (if `Ballerina.toml` exists) or single `.bal` file
4. Create `SnapshotFS`
5. Call worker → Go WASM `run`
6. Go loads, compiles, interprets
7. Output streams back via callback
8. Output pane appends text

File: `apps/web/src/hooks/use-ballerina.ts`

---

## 7. Async bridge: JS ↔ Go (3 min)

Go returns JavaScript Promises using `newPromise()` in `packages/wasm/promise_wasm.go`.

Go code sees synchronous APIs; JS side is Promise-based.

Used for:

- FS operations (from `bridge_fs_wasm.go`)
- HTTP `fetch` (from `pal_wasm.go`)

Go calls `awaitPromise(promise)` to wait for async JS operations.

---

## 8. Editor & diagnostics (4 min)

**Editor:** CodeMirror 6 with Shiki syntax highlighting

- File: `apps/web/src/components/code-editor.tsx`
- Current Ballerina syntax mode is a C-like hack (temporary)

**Diagnostics:** Custom `BallerinaLS` (fake LSP transport)

- File: `apps/web/src/lib/ballerina-ls.ts`
- On file change: snapshot FS → call `getDiagnostics` → publish diagnostics
- No completion, hover, or rename yet (full LS would require a real server)

---

## 9. Sharing, routing & GitHub Pages SPA hack (4 min)

**Sharing:**

1. Serialize file tree → JSON → gzip → Base64
2. Store in URL: `?share=...`
3. On load: decode → inflate → graft into `/tmp/shared`

**Routing:** TanStack Router tracks active file in URL

- Default: `/tmp/examples/02-http-client.bal`
- File changes sync the URL via `FileRouteSync`

**GitHub Pages SPA hack:**

GitHub Pages is a static host, so direct navigation to a dynamic app route like:

```text
/tmp/examples/02-http-client.bal
```

would normally return 404. To support SPA routing, `apps/web/vite.config.ts` has a custom `githubPagesSpa()` Vite plugin that copies:

```text
dist/index.html → dist/404.html
```

So GitHub Pages serves the React app even for unknown paths. Then TanStack Router handles the actual route in the browser.

Also, `apps/web/src/main.tsx` sets the router base path from `import.meta.env.BASE_URL`, so the app works correctly when hosted under a subpath.

Files:

- `apps/web/src/lib/share.ts`
- `apps/web/src/routes/$.tsx`
- `apps/web/src/main.tsx`
- `apps/web/vite.config.ts`

---

## 10. State management (2 min)

Zustand stores:

- **`file-tree-store.ts`** — FS tree, active file, dirty state, file dialogs
- **`editor-store.ts`** — output, editor mode (standard/vim)

Editor mode persists in localStorage.

---

## 11. Examples & metadata (2 min)

**Examples:**

- Live in `examples/`
- Generated to `apps/web/src/assets/examples.json` via `scripts/example_gen/main.go`
- Loaded into `EphemeralFS` at runtime
- Sidebar displays under "Examples"

**Version metadata:**

- `packages/wasm/scripts/gen-meta.sh` — records tag/commit hash
- Injected into UI via Vite (`__BALLERINA_VERSION__`, `__COMMIT_SHA__`)
- Shown in version card

---

## 12. Build & CI (2 min)

**Turbo tasks:**

- `copy:wasm` — copy `ballerina.wasm` and `ballerina-meta.json` to `public/`
- `web` build/dev/test all depend on `copy:wasm`

**CI/CD:**

- `.github/workflows/ci.yml` — lint, test, e2e
- `.github/workflows/deploy.yml` — build and deploy to GitHub Pages on `main`

---

## Key Takeaway

The Playground is a **thin client** around `ballerina-lang-go`:

- Browser FS ↔ Go FS bridge
- WASM interpreter runs on worker
- Diagnostics driven by compiler, not a real LS
- Everything persists in browser (localStorage or ephemeral)
- No backend dependency

**When you modify code:**

1. Think about where the change fits in the flow above
2. Check if FS operations need bridge updates
3. Check if async calls are properly awaited

---

## Recommended deep-dives (in order)

1. WASM bridge (`main_wasm.go`, `bridge_fs_wasm.go`)
2. Browser FS implementations
3. Worker setup and snapshot
4. Run/diagnostics flow
5. Editor & CodeMirror setup
6. Routing and state stores
