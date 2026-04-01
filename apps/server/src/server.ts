// ─── server.ts (server) ───────────────────────────────────────────────────

import http from "node:http";
import fs from "node:fs";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { NodeFS } from "./node-fs";
import type { WsRequest, WsResponse, WsPush, WatchEvent } from "./types";

const ROOT = process.env.FS_ROOT ?? "./workspace";
const PORT = Number(process.env.PORT ?? 3000);
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ─── helpers ──────────────────────────────────────────────────────────────

function sendRaw<T>(ws: WebSocket, msg: T): void {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function reply(ws: WebSocket, id: string, result: unknown): void {
	sendRaw<WsResponse>(ws, { id, result });
}

function replyError(ws: WebSocket, id: string, message: string): void {
	sendRaw<WsResponse>(ws, { id, error: { message } });
}

function push(ws: WebSocket, channel: string, data: unknown): void {
	sendRaw<WsPush>(ws, { channel, data });
}

function rejectUpgrade(socket: Duplex, status: number, msg: string): void {
	socket.end(
		`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Bad Request"}\r\n` +
			`Content-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`,
	);
}

// ─── per-client handler ───────────────────────────────────────────────────

function createClientHandler(ws: WebSocket, nfs: NodeFS) {
	const watchers = new Map<string, fs.FSWatcher>();

	async function routeRequest(req: WsRequest): Promise<void> {
		const p = req.params ?? {};

		if (req.method === "fs/watch") {
			const watchPath = p.path as string;
			if (watchers.has(watchPath)) return;
			const watcher = fs.watch(
				watchPath,
				{ recursive: true },
				(eventType, filename) => {
					const event: WatchEvent = {
						path: filename ?? watchPath,
						kind: eventType === "rename" ? "delete" : "change",
					};
					push(ws, `fs/watch:${watchPath}`, event);
				},
			);
			watcher.on("error", () => watchers.delete(watchPath));
			watchers.set(watchPath, watcher);
			return;
		}

		if (req.method === "fs/unwatch") {
			const watchPath = p.path as string;
			watchers.get(watchPath)?.close();
			watchers.delete(watchPath);
			return;
		}

		try {
			switch (req.method) {
				case "fs/open":
					return reply(ws, req.id, await nfs.open(p.path as string));
				case "fs/stat":
					return reply(ws, req.id, await nfs.stat(p.path as string));
				case "fs/readDir":
					return reply(ws, req.id, await nfs.readDir(p.path as string));
				case "fs/writeFile":
					return reply(
						ws,
						req.id,
						await nfs.writeFile(p.path as string, p.content as string),
					);
				case "fs/remove":
					return reply(ws, req.id, await nfs.remove(p.path as string));
				case "fs/move":
					return reply(
						ws,
						req.id,
						await nfs.move(p.from as string, p.to as string),
					);
				case "fs/mkdirAll":
					return reply(ws, req.id, await nfs.mkdirAll(p.path as string));
				default:
					replyError(ws, req.id, `Unknown method: ${req.method}`);
			}
		} catch (e) {
			replyError(ws, req.id, e instanceof Error ? e.message : "Internal error");
		}
	}

	function onMessage(raw: unknown): void {
		let req: WsRequest;
		try {
			req = JSON.parse(raw as string);
		} catch {
			replyError(ws, "unknown", "Invalid JSON");
			return;
		}
		void routeRequest(req);
	}

	function cleanup(): void {
		for (const watcher of watchers.values()) watcher.close();
		watchers.clear();
	}

	return { onMessage, cleanup };
}

// ─── bootstrap ────────────────────────────────────────────────────────────

const httpServer = http.createServer((_req, res) => {
	res.writeHead(426, { "Content-Type": "text/plain" });
	res.end("WebSocket connections only");
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
	socket.on("error", () => {});

	if (AUTH_TOKEN) {
		let token: string | null = null;
		try {
			token = new URL(
				req.url ?? "/",
				`http://localhost:${PORT}`,
			).searchParams.get("token");
		} catch {
			rejectUpgrade(socket, 400, "Invalid URL");
			return;
		}
		if (token !== AUTH_TOKEN) {
			rejectUpgrade(socket, 401, "Unauthorized");
			return;
		}
	}

	wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (ws) => {
	const nfs = new NodeFS(ROOT);
	const { onMessage, cleanup } = createClientHandler(ws, nfs);

	ws.on("message", onMessage);
	ws.on("close", cleanup);
	ws.on("error", cleanup);
});

httpServer.listen(PORT, () => {
	console.log(`WS server listening on ws://localhost:${PORT}`);
});
