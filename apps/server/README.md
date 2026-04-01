# Playground FS WebSocket server

Serves the host filesystem over WebSockets for the web app’s **Remote** mount (`/remote/...`).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port; WebSocket URL is `ws://localhost:<PORT>` (any path on upgrade). |
| `FS_ROOT` | `./workspace` | Directory on disk exposed to clients (paths are resolved under this root). |
| `AUTH_TOKEN` | _(unset)_ | If set, clients must connect with `?token=<AUTH_TOKEN>` on the WebSocket URL. |

## Web app pairing

In `apps/web`, set:

- `VITE_REMOTE_FS_WS_URL` — WebSocket URL, e.g. `ws://localhost:3000`
- `VITE_REMOTE_FS_AUTH_TOKEN` — optional; appended as `token` query param when `AUTH_TOKEN` is set on the server

Restart the Vite dev server after changing env files.
