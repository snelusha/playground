import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
	DirEntry,
	OpenResult,
	RemoteFsMethod,
	RemoteFsRequest,
	RemoteFsResult,
	StatResult,
} from "../protocol";

type ErrorInfo = {
	code: string;
	message: string;
};

type MethodResult =
	| { ok: true; value: RemoteFsResult }
	| { ok: false; error: ErrorInfo };

export class HostFsAdapter {
	private readonly root: string;

	constructor(rootDir: string) {
		this.root = path.resolve(rootDir);
	}

	async handle(req: RemoteFsRequest): Promise<MethodResult> {
		switch (req.method) {
			case "open":
				return this._open(req.params.path);
			case "stat":
				return this._stat(req.params.path);
			case "readDir":
				return this._readDir(req.params.path);
			case "writeFile":
				return this._writeFile(req.params.path, req.params.content);
			case "remove":
				return this._remove(req.params.path);
			case "move":
				return this._move(req.params.oldPath, req.params.newPath);
			case "mkdirAll":
				return this._mkdirAll(req.params.path);
			default:
				return this._unsupportedMethod(req.method);
		}
	}

	private async _open(remotePath: string): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			const info = await stat(resolved.path);
			if (info.isDirectory()) return { ok: true, value: null };
			const content = await readFile(resolved.path, "utf8");
			const result: OpenResult = {
				content,
				size: info.size,
				modTime: info.mtimeMs,
				isDir: false,
			};
			return { ok: true, value: result };
		} catch (err) {
			if (this._isNotFound(err)) return { ok: true, value: null };
			return this._fromError(err, "OPEN_FAILED");
		}
	}

	private async _stat(remotePath: string): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			const info = await stat(resolved.path);
			const result: StatResult = {
				name: path.posix.basename(remotePath || "/"),
				size: info.isDirectory() ? 0 : info.size,
				modTime: info.mtimeMs,
				isDir: info.isDirectory(),
			};
			return { ok: true, value: result };
		} catch (err) {
			if (this._isNotFound(err)) return { ok: true, value: null };
			return this._fromError(err, "STAT_FAILED");
		}
	}

	private async _readDir(remotePath: string): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			const entries = await readdir(resolved.path, { withFileTypes: true });
			const result: DirEntry[] = entries.map((entry) => ({
				name: entry.name,
				isDir: entry.isDirectory(),
			}));
			return { ok: true, value: result };
		} catch (err) {
			if (this._isNotFound(err)) return { ok: true, value: null };
			return this._fromError(err, "READ_DIR_FAILED");
		}
	}

	private async _writeFile(
		remotePath: string,
		content: string,
	): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			await mkdir(path.dirname(resolved.path), { recursive: true });
			await writeFile(resolved.path, content, "utf8");
			return { ok: true, value: true };
		} catch (err) {
			return this._fromError(err, "WRITE_FAILED");
		}
	}

	private async _remove(remotePath: string): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			await rm(resolved.path, { force: true, recursive: true });
			return { ok: true, value: true };
		} catch (err) {
			return this._fromError(err, "REMOVE_FAILED");
		}
	}

	private async _move(oldPath: string, newPath: string): Promise<MethodResult> {
		const resolvedOld = this._resolveSafePath(oldPath);
		if (!resolvedOld.ok) return resolvedOld;
		const resolvedNew = this._resolveSafePath(newPath);
		if (!resolvedNew.ok) return resolvedNew;
		try {
			await mkdir(path.dirname(resolvedNew.path), { recursive: true });
			await rename(resolvedOld.path, resolvedNew.path);
			return { ok: true, value: true };
		} catch (err) {
			if (this._isNotFound(err)) return { ok: true, value: false };
			return this._fromError(err, "MOVE_FAILED");
		}
	}

	private async _mkdirAll(remotePath: string): Promise<MethodResult> {
		const resolved = this._resolveSafePath(remotePath);
		if (!resolved.ok) return resolved;
		try {
			await mkdir(resolved.path, { recursive: true });
			return { ok: true, value: true };
		} catch (err) {
			return this._fromError(err, "MKDIR_FAILED");
		}
	}

	private _resolveSafePath(
		remotePath: string,
	): { ok: true; path: string } | { ok: false; error: ErrorInfo } {
		const normalized = path.posix.normalize(remotePath);
		const relativePath = normalized.replace(/^\/+/, "");
		const resolved = path.resolve(this.root, relativePath);
		if (
			resolved === this.root ||
			resolved.startsWith(`${this.root}${path.sep}`)
		) {
			return { ok: true, path: resolved };
		}
		return {
			ok: false,
			error: { code: "PATH_OUTSIDE_ROOT", message: "Path is outside root" },
		};
	}

	private _unsupportedMethod(method: RemoteFsMethod): MethodResult {
		return {
			ok: false,
			error: {
				code: "UNSUPPORTED_METHOD",
				message: `Method ${method} is not supported`,
			},
		};
	}

	private _isNotFound(err: unknown): boolean {
		return err instanceof Error && "code" in err && err.code === "ENOENT";
	}

	private _fromError(err: unknown, code: string): MethodResult {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { ok: false, error: { code, message } };
	}
}
