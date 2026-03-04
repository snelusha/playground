## Ballerina Playground

Ballerina playground is a web based tool which allows trying out language features.

### Getting started

- **Prereqs**: Go (1.26 or later), Bun

Build the WASM binary (outputs to `web/public/ballerina.wasm`):

```bash
cd wasm
GOOS=js GOARCH=wasm go build -o ../web/public/ballerina.wasm .
```

Run the web app:

```bash
cd web
bun install
bun run dev
```

