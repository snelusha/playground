import { basename, dirname, isRootPath, join } from "@/lib/fs/core/path-utils";

import type { ProjectSnapshot } from "@/lib/fs/project-snapshot";

type IndexEntry =
	| { kind: "file"; content: string; modTime: number }
	| { kind: "dir"; modTime: number };

function normalizeFsPath(path: string): string {
	if (!path || path === "/") return "/";
	const withSlash = path.startsWith("/") ? path : `/${path}`;
	return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function buildPathIndex(snapshot: ProjectSnapshot): Map<string, IndexEntry> {
	const index = new Map<string, IndexEntry>();
	const modTime = Date.now();

	for (const file of snapshot.files) {
		const path = normalizeFsPath(file.path);
		index.set(path, { kind: "file", content: file.content, modTime });
		let dir = dirname(path);
		while (!isRootPath(dir)) {
			const dirPath = normalizeFsPath(dir);
			if (!index.has(dirPath)) {
				index.set(dirPath, { kind: "dir", modTime });
			}
			dir = dirname(dirPath);
		}
	}

	return index;
}

/**
 * Read-only FS object matching the contract expected by Go `BridgeFS` (`bridgeCall`):
 * async `open`, `stat`, `readDir`, `writeFile`, `remove`, `move`, `mkdirAll`.
 * Mutations resolve to `false` so WASM cannot persist changes into the snapshot.
 */
export function createReadOnlySnapshotBridge(snapshot: ProjectSnapshot) {
	const index = buildPathIndex(snapshot);

	function openSync(path: string) {
		const p = normalizeFsPath(path);
		const entry = index.get(p);
		if (!entry) {
			const st = statSync(path);
			if (st?.isDir) {
				return { isDir: true as const, size: 0, modTime: st.modTime };
			}
			return null;
		}
		if (entry.kind === "dir") {
			return { isDir: true as const, size: 0, modTime: entry.modTime };
		}
		const { content } = entry;
		return {
			isDir: false as const,
			content,
			size: content.length,
			modTime: entry.modTime,
		};
	}

	function statSync(path: string) {
		const p = normalizeFsPath(path);
		if (p === "/") {
			return { name: "/", size: 0, modTime: 0, isDir: true };
		}
		const entry = index.get(p);
		if (!entry) return null;
		return {
			name: basename(p),
			size: entry.kind === "file" ? entry.content.length : 0,
			modTime: entry.modTime,
			isDir: entry.kind === "dir",
		};
	}

	function readDirSync(path: string) {
		const p = normalizeFsPath(path);
		const prefix = p === "/" ? "/" : `${p}/`;
		const childNames = new Map<string, { isDir: boolean }>();

		for (const key of index.keys()) {
			if (key === p || !key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			const segment = rest.split("/").filter(Boolean)[0];
			if (!segment) continue;
			const childPath = normalizeFsPath(join(p, segment));
			const child = index.get(childPath);
			childNames.set(segment, { isDir: child ? child.kind === "dir" : true });
		}

		return [...childNames.entries()].map(([name, { isDir }]) => ({
			name,
			isDir,
		}));
	}

	return {
		open(path: string) {
			return Promise.resolve(openSync(path));
		},
		stat(path: string) {
			return Promise.resolve(statSync(path));
		},
		readDir(path: string) {
			return Promise.resolve(readDirSync(path));
		},
		writeFile(_path: string, _content: string) {
			return Promise.resolve(false);
		},
		remove(_path: string) {
			return Promise.resolve(false);
		},
		move(_oldPath: string, _newPath: string) {
			return Promise.resolve(false);
		},
		mkdirAll(_path: string) {
			return Promise.resolve(false);
		},
	};
}

export type ReadOnlySnapshotBridge = ReturnType<
	typeof createReadOnlySnapshotBridge
>;
