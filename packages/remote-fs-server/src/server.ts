import path from "node:path";

import { HostFsAdapter } from "./fs/host-fs-adapter";
import {
	PROTOCOL_VERSION,
	type RemoteFsRequest,
	type RemoteFsResponse,
} from "./protocol";

const DEFAULT_PORT = 6969;
const DEFAULT_HOST = "127.0.0.1";
const MAX_PAYLOAD = 8 * 1024 * 1024;

const port = Number(process.env.REMOTE_FS_PORT ?? DEFAULT_PORT);
const hostname = process.env.REMOTE_FS_HOST ?? DEFAULT_HOST;
const resolvedRoot = path.resolve(process.env.REMOTE_FS_ROOT ?? process.cwd());
const webDistDir = path.resolve(
	process.env.WEB_DIST_DIR ?? path.join(process.cwd(), "dist/web"),
);

const adapter = new HostFsAdapter(resolvedRoot);

function safeAssetPath(pathname: string): string {
	const normalized = path.posix.normalize(pathname);
	const relative = normalized.replace(/^\/+/, "");
	return path.resolve(webDistDir, relative);
}

async function serveWebAsset(pathname: string): Promise<Response> {
	const targetPath = safeAssetPath(pathname);
	if (
		!targetPath.startsWith(`${webDistDir}${path.sep}`) &&
		targetPath !== webDistDir
	) {
		return new Response("Not found", { status: 404 });
	}

	const file = Bun.file(targetPath);
	if (await file.exists()) {
		return new Response(file);
	}

	const indexFile = Bun.file(path.join(webDistDir, "index.html"));
	if (await indexFile.exists()) {
		return new Response(indexFile);
	}
	return new Response("Web build not found. Run `bun run build` first.", {
		status: 503,
	});
}

function parseRequest(
	message: string | Buffer | Uint8Array,
): RemoteFsRequest | null {
	try {
		const parsed = JSON.parse(String(message)) as RemoteFsRequest;
		if (!parsed || parsed.v !== PROTOCOL_VERSION) return null;
		if (!parsed.id || !parsed.method || !parsed.params) return null;
		return parsed;
	} catch {
		return null;
	}
}

function send(
	ws: Bun.ServerWebSocket<unknown>,
	payload: RemoteFsResponse,
): void {
	ws.send(JSON.stringify(payload));
}

const server = Bun.serve({
	hostname,
	port,
	async fetch(req, bunServer) {
		const { pathname } = new URL(req.url);
		if (pathname !== "/fs") {
			return await serveWebAsset(pathname);
		}
		const upgraded = bunServer.upgrade(req);
		return upgraded
			? undefined
			: new Response("Upgrade failed", { status: 400 });
	},
	websocket: {
		maxPayloadLength: MAX_PAYLOAD,
		idleTimeout: 60,
		async message(ws, message) {
			const startedAt = performance.now();
			const req = parseRequest(message);
			if (!req) {
				send(ws, {
					v: PROTOCOL_VERSION,
					id: "unknown",
					ok: false,
					error: { code: "BAD_REQUEST", message: "Invalid request payload" },
				});
				return;
			}

			const result = await adapter.handle(req);
			const response: RemoteFsResponse = result.ok
				? { v: PROTOCOL_VERSION, id: req.id, ok: true, result: result.value }
				: { v: PROTOCOL_VERSION, id: req.id, ok: false, error: result.error };
			send(ws, response);
			const elapsedMs = Math.round(performance.now() - startedAt);
			console.info(
				`[remote-fs] method=${req.method} id=${req.id} ok=${result.ok} elapsed_ms=${elapsedMs}`,
			);
		},
	},
});

console.info(
	`[remote-fs] listening ws://${server.hostname}:${server.port}/fs root=${resolvedRoot} web=${webDistDir}`,
);
