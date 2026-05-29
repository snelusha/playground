# Ballerina Playground KT Session — Illustration Pack

These diagrams are designed for your KT session slides and documentation.
You can directly copy the Mermaid diagrams into Markdown editors, GitHub, Obsidian, Notion (Mermaid enabled), or Mermaid Live Editor.

---

# 1. High-Level Playground Architecture

```mermaid
flowchart TD
    A[React Web Application] --> B[Browser Virtual File System]
    B --> C[SnapshotFS]
    C --> D[Web Worker]
    D --> E[Go WASM Wrapper]
    E --> F[ballerina-lang-go]
    F --> G[Ballerina Parser]
    F --> H[Compiler]
    F --> I[Interpreter Runtime]

    I --> J[Program Output]
    J --> A

    D --> K[Diagnostics]
    K --> A
```

---

# 2. Repository and Package Structure

```mermaid
flowchart TB
    ROOT[Monorepo Root]

    ROOT --> WEB[@playground/web\napps/web]
    ROOT --> WASM[@playground/wasm\npackages/wasm]
    ROOT --> LANG[ballerina-lang-go\nGit Submodule]

    WEB --> WEB1[React + Vite UI]
    WEB --> WEB2[Editor]
    WEB --> WEB3[Worker Client]
    WEB --> WEB4[Browser FS]

    WASM --> WASM1[Go WASM Wrapper]
    WASM --> WASM2[FS Bridge]
    WASM --> WASM3[Platform Abstraction]

    LANG --> LANG1[Parser]
    LANG --> LANG2[Compiler]
    LANG --> LANG3[Interpreter]

    WASM --> LANG
```

---

# 3. Go WASM Thin Wrapper Architecture

```mermaid
flowchart LR
    JS[JavaScript Runtime] --> RUN[run()]
    JS --> DIAG[getDiagnostics()]

    RUN --> FS[Bridge FS]
    FS --> LOAD[projects.Load]
    LOAD --> BIR[Generate BIR]
    BIR --> RUNTIME[Create Runtime]
    RUNTIME --> EXEC[Interpret Package]

    EXEC --> OUT[stdout/stderr callback]
    OUT --> JS
```

---

# 4. Async Handling Between JavaScript and Go

```mermaid
sequenceDiagram
    participant JS as JavaScript
    participant GO as Go WASM
    participant BROWSER as Browser APIs

    JS->>GO: run()
    GO->>GO: newPromise(...)

    GO->>BROWSER: fetch/open/readFile
    BROWSER-->>GO: Promise

    GO->>GO: awaitPromise(...)

    GO-->>JS: Resolve Promise
```

---

# 5. File System Bridge Architecture

```mermaid
flowchart LR
    A[ballerina-lang-go]
    --> B[Go bridgeFS]

    B --> C[JS FS Interface]

    C --> D[EphemeralFS]
    C --> E[LocalStorageFS]
    C --> F[LayeredFS]

    D --> G[/tmp/examples]
    D --> H[/tmp/shared]

    E --> I[/local]
```

---

# 6. Layered Filesystem Design

```mermaid
flowchart TD
    LAYER[LayeredFS]

    LAYER --> TEMP[/tmp]
    LAYER --> LOCAL[/local]

    TEMP --> EXAMPLES[/tmp/examples]
    TEMP --> SHARED[/tmp/shared]

    LOCAL --> STORAGE[Browser localStorage]

    EXAMPLES --> E1[Bundled Examples]
    SHARED --> S1[Shared Playground Files]
```

---

# 7. SnapshotFS and Worker Boundary

```mermaid
flowchart LR
    UI[Live Browser FS]
    --> SNAP[SnapshotFS\nRead Only]

    SNAP --> WORKER[Web Worker]

    WORKER --> WASM[Go WASM Runtime]

    SNAP --> NOTE[Consistent Runtime View]
```

---

# 8. Web Worker Runtime Initialization

```mermaid
sequenceDiagram
    participant UI as Main Thread
    participant WORKER as Worker
    participant WASM as ballerina.wasm
    participant GO as Go Runtime

    UI->>WORKER: init()
    WORKER->>WASM: Fetch WASM
    WORKER->>GO: Instantiate Runtime
    GO-->>WORKER: expose self.run
    WORKER-->>UI: Ready
```

---

# 9. Ballerina Code Execution Flow

```mermaid
flowchart TD
    A[User Clicks Run]
    --> B[Save Active File]

    B --> C[Detect Project or Single File]
    C --> D[Create SnapshotFS]

    D --> E[Worker run()]
    E --> F[Go WASM run()]

    F --> G[Load Project]
    G --> H[Compile + Generate BIR]
    H --> I[Interpret Runtime]

    I --> J[Stream stdout/stderr]
    J --> K[Output Panel]
```

---

# 10. Diagnostics Flow

```mermaid
flowchart TD
    A[Editor Change]
    --> B[Save Active File]

    B --> C[Find Project Target]
    C --> D[Create SnapshotFS]

    D --> E[getDiagnostics()]
    E --> F[Compiler Diagnostics]

    F --> G[LSP-like Diagnostics]
    G --> H[CodeMirror Display]
```

---

# 11. Browser Platform Abstraction Layer

```mermaid
flowchart LR
    A[ballerina-lang-go Runtime]
    --> B[pal_wasm.go]

    B --> C[stdout]
    B --> D[stderr]
    B --> E[Browser fetch API]

    E --> F[CORS Restricted Browser HTTP]
```

---

# 12. Sharing Flow

```mermaid
flowchart TD
    A[Selected File or Folder]
    --> B[Convert to FileNode]

    B --> C[JSON Serialize]
    C --> D[Gzip Compression]
    D --> E[Base64 Encode]

    E --> F[Store in URL Query Param]

    F --> G[Shared Link]

    G --> H[Decode + Gunzip]
    H --> I[Validate File Tree]
    I --> J[Mount into /tmp/shared]
```

---

# 13. Example Generation Pipeline

```mermaid
flowchart LR
    A[examples/ Directory]
    --> B[example_gen/main.go]

    B --> C[examples.json]

    C --> D[FSProvider]
    D --> E[EphemeralFS]
    E --> F[Examples Sidebar]
```

---

# 14. Routing and File Synchronization

```mermaid
flowchart LR
    A[TanStack Router]
    --> B[URL Path]

    B --> C[Active File]
    C --> D[FileRouteSync]

    D --> E[Editor]
```

---

# 15. Version Metadata Flow

```mermaid
flowchart TD
    A[ballerina-lang-go Commit]
    --> B[gen-meta.sh]

    B --> C[ballerina-meta.json]
    C --> D[apps/web/public]

    D --> E[Vite Injection]
    E --> F[__BALLERINA_VERSION__]

    F --> G[Version Card UI]
```

---

# 16. Turbo Build Pipeline

```mermaid
flowchart TD
    A[@playground/wasm build]
    --> B[copy:wasm]

    B --> C[apps/web/public]

    C --> D[Web Build]
    D --> E[dist/]
```

---

# 17. CI/CD Pipeline

```mermaid
flowchart TD
    A[GitHub Actions]

    A --> B[Checkout with Submodules]
    B --> C[Setup Go]
    C --> D[Setup Bun]

    D --> E[bun install]
    E --> F[Lint]
    F --> G[Test]
    G --> H[Build]

    H --> I[Playwright E2E]

    I --> J[Deploy to GitHub Pages]
```

---

# 18. Current Limitations Overview

```mermaid
mindmap
  root((Current Limitations))
    No Real Language Server
    Compiler Driven Diagnostics
    C-like Syntax Hack
    Browser-only Persistence
    localStorage Size Limits
    Read-only SnapshotFS
    Heavy WASM Startup
    Browser CORS Restrictions
```

---

# 19. Recommended KT Session Flow

```mermaid
flowchart TD
    A[What is Playground]
    --> B[Repo Structure]
    --> C[Build Model]
    --> D[ballerina-lang-go]
    --> E[WASM Wrapper]
    --> F[Async Bridge]
    --> G[Filesystem]
    --> H[Worker Runtime]
    --> I[Run Flow]
    --> J[Diagnostics]
    --> K[Editor]
    --> L[Examples]
    --> M[Sharing]
    --> N[CI/CD]
    --> O[Limitations & Future Work]
```
