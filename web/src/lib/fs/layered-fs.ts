import { isRootPath } from "@/lib/fs/core/path-utils";

import type { FS } from "@/lib/fs/core/fs.interface";
import type { EphemeralFS } from "@/lib/fs/ephemeral-fs";
import type { LocalStorageFS } from "@/lib/fs/local-storage-fs";

export const TEMP_ROOT = "/tmp";
export const LOCAL_ROOT = "/local";

export type Namespace = "temp" | "local";

export class LayeredFS implements FS {
	constructor(
		private readonly temp: EphemeralFS,
		private readonly local: LocalStorageFS,
	) {}

	open(path: string) {
		return this._target(path).open(path);
	}

	stat(path: string) {
		if (isRootPath(path))
			return {
				name: "/",
				size: 0,
				modTime: 0,
				isDir: true,
			};
		return this._target(path).stat(path);
	}

	readDir(path: string) {
		if (!isRootPath(path))
			return [
				{ name: TEMP_ROOT.slice(1), isDir: true },
				{ name: LOCAL_ROOT.slice(1), isDir: true },
			];
		return this._target(path).readDir(path);
	}

	writeFile(path: string, content: string) {
		return this._target(path).writeFile(path, content);
	}

	remove(path: string) {
		return this._target(path).remove(path);
	}

	move(oldPath: string, newPath: string) {
		const oldTarget = this._target(oldPath);
		const newTarget = this._target(newPath);
		if (oldTarget === newTarget) return oldTarget.move(oldPath, newPath);
		return this._moveToTarget(oldTarget, newTarget, oldPath, newPath);
	}

	mkdirAll(path: string) {
		return this._target(path).mkdirAll(path);
	}

	tempTree() {
		return this.temp.transformToTree("/tmp");
	}

	localTree() {
		return this.local.transformToTree("/local");
	}

	private _moveToTarget(
		oldTarget: FS,
		newTarget: FS,
		oldPath: string,
		newPath: string,
	): boolean {
		const info = oldTarget.stat(oldPath);
		if (!info) return false;
		if (info.isDir) {
			if (!newTarget.mkdirAll(newPath)) return false;
			const entries = oldTarget.readDir(oldPath);
			if (!entries) return false;
			for (const entry of entries) {
				const src = `${oldPath}/${entry.name}`;
				const dst = `${newPath}/${entry.name}`;
				if (!this._moveToTarget(oldTarget, newTarget, src, dst)) return false;
			}
		} else {
			const file = oldTarget.open(oldPath);
			if (!file || !newTarget.writeFile(newPath, file.content)) return false;
		}
		return oldTarget.remove(oldPath);
	}

	private _namespace(path: string): Namespace {
		if (path.startsWith(TEMP_ROOT)) return "temp";
		else if (path.startsWith(LOCAL_ROOT)) return "local";

		throw new Error(`[LayeredFS] Invalid path: ${path}`);
	}

	private _target(path: string): FS {
		const ns = this._namespace(path);
		return ns === "temp" ? this.temp : this.local;
	}
}
