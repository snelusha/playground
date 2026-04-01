import type { AsyncFS } from "@playground/remote-fs";

import type { FS } from "@/lib/fs/core/fs.interface";

/** Wraps synchronous [`FS`](fs.interface.ts) as [`AsyncFS`](@playground/remote-fs) for a unified async pipeline. */
export function liftSyncFS(fs: FS): AsyncFS {
	return {
		open: (path) => Promise.resolve(fs.open(path)),
		stat: (path) => Promise.resolve(fs.stat(path)),
		readDir: (path) => Promise.resolve(fs.readDir(path)),
		writeFile: (path, content) => Promise.resolve(fs.writeFile(path, content)),
		remove: (path) => Promise.resolve(fs.remove(path)),
		move: (from, to) => Promise.resolve(fs.move(from, to)),
		mkdirAll: (path) => Promise.resolve(fs.mkdirAll(path)),
		watch: () => () => {},
	};
}
