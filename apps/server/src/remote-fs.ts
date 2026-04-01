// ─── remote-fs.ts (client) ────────────────────────────────────────────────

import type { WsTransport } from "./transport";
import type { AsyncFS } from "./async-fs";
import type { FileEntry, StatEntry, DirEntry, WatchEvent } from "./types";

export class RemoteFS implements AsyncFS {
	constructor(private readonly transport: WsTransport) {}

	open(path: string) {
		return this.transport.request<FileEntry | null>("fs/open", { path });
	}

	stat(path: string) {
		return this.transport.request<StatEntry | null>("fs/stat", { path });
	}

	readDir(path: string) {
		return this.transport.request<DirEntry[] | null>("fs/readDir", { path });
	}

	writeFile(path: string, content: string) {
		return this.transport.request<boolean>("fs/writeFile", { path, content });
	}

	remove(path: string) {
		return this.transport.request<boolean>("fs/remove", { path });
	}

	move(from: string, to: string) {
		return this.transport.request<boolean>("fs/move", { from, to });
	}

	mkdirAll(path: string) {
		return this.transport.request<boolean>("fs/mkdirAll", { path });
	}

	watch(path: string, handler: (event: WatchEvent) => void): () => void {
		this.transport.request("fs/watch", { path }).catch(console.error);

		const unsub = this.transport.subscribe(`fs/watch:${path}`, (data) => {
			handler(data as WatchEvent);
		});

		return () => {
			unsub();
			this.transport.request("fs/unwatch", { path }).catch(console.error);
		};
	}
}
