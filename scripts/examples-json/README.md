# examples-json

Generate a `FileNode[]` JSON array from a directory.

## Usage

From repo root:

```bash
go run ./scripts/examples-json -- ./examples ./web/public/examples.json
```

- The output JSON contains **only the direct children of** `<input_dir>` (it does not wrap them in a root `"examples"` directory node).
- Entries are written deterministically: **directories first**, then files, both sorted by name.
- Skips `.git/`, `node_modules/`, and `.DS_Store`.

