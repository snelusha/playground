import type { AsyncFS } from "@playground/remote-fs";
import type { RemoteFS } from "@playground/remote-fs";

import {
	isRemotePath,
	isRootPath,
	isUnder,
	join,
} from "@/lib/fs/core/path-utils";
import { asyncFsToFileTree } from "@/lib/fs/async-fs-tree";
import { liftSyncFS } from "@/lib/fs/lift-sync-fs";
import { toRemoteServerPath } from "@/lib/fs/remote-path";
import { LOCAL_ROOT, REMOTE_ROOT, TEMP_ROOT } from "@/lib/fs/fs-roots";

import type { LayeredFS } from "@/lib/fs/layered-fs";
import type { FileNode } from "@/lib/fs/core/file-node.types";

type Namespace = "layered" | "remote";

export class PlaygroundAsyncFS implements AsyncFS {
	private readonly lifted: AsyncFS;

	constructor(
		readonly layered: LayeredFS,
		private readonly remote: RemoteFS | null,
	) {
		this.lifted = liftSyncFS(layered);
	}

	remoteEnabled(): boolean {
		return this.remote !== null;
	}

	tempTree(): FileNode[] {
		return this.layered.tempTree();
	}

	localTree(): FileNode[] {
		return this.layered.localTree();
	}

	async remoteTree(): Promise<FileNode[]> {
		if (!this.remote) return [];
		return asyncFsToFileTree(this, REMOTE_ROOT);
	}

	graftSharedTree(
		root: FileNode,
		openRelativePath?: string | null,
	): string | null {
		return this.layered.graftSharedTree(root, openRelativePath);
	}

	async open(path: string) {
		if (isRemotePath(path)) {
			if (!this.remote) return null;
			return this.remote.open(toRemoteServerPath(path));
		}
		return this.lifted.open(path);
	}

	async stat(path: string) {
		if (path === REMOTE_ROOT) {
			if (!this.remote) return null;
			return this.remote.stat("");
		}
		if (isRemotePath(path)) {
			if (!this.remote) return null;
			return this.remote.stat(toRemoteServerPath(path));
		}
		return this.lifted.stat(path);
	}

	async readDir(path: string) {
		if (isRootPath(path)) {
			const base = await this.lifted.readDir("/");
			if (!base) return null;
			if (!this.remote) return base;
			return [...base, { name: REMOTE_ROOT.slice(1), isDir: true }];
		}
		if (path === REMOTE_ROOT) {
			if (!this.remote) return null;
			return this.remote.readDir("");
		}
		if (isRemotePath(path)) {
			if (!this.remote) return null;
			return this.remote.readDir(toRemoteServerPath(path));
		}
		return this.lifted.readDir(path);
	}

	async writeFile(path: string, content: string) {
		if (isRemotePath(path)) {
			if (!this.remote) return false;
			return this.remote.writeFile(toRemoteServerPath(path), content);
		}
		return this.lifted.writeFile(path, content);
	}

	async remove(path: string) {
		if (isRemotePath(path)) {
			if (!this.remote) return false;
			return this.remote.remove(toRemoteServerPath(path));
		}
		return this.lifted.remove(path);
	}

	async move(oldPath: string, newPath: string) {
		const oldNs = this._namespace(oldPath);
		const newNs = this._namespace(newPath);
		if (oldNs === null || newNs === null) return false;
		if (oldPath === newPath) return true;
		if (newPath.startsWith(`${oldPath}/`)) return false;

		if (oldNs === "remote" && newNs === "remote" && this.remote) {
			return this.remote.move(
				toRemoteServerPath(oldPath),
				toRemoteServerPath(newPath),
			);
		}
		if (oldNs === "layered" && newNs === "layered") {
			return this.lifted.move(oldPath, newPath);
		}
		if (!this.remote) return false;
		if (oldNs === "layered" && newNs === "remote") {
			const ok = await this._copyLayeredToRemote(oldPath, newPath);
			if (!ok) return false;
			return this.layered.remove(oldPath);
		}
		if (oldNs === "remote" && newNs === "layered") {
			const ok = await this._copyRemoteToLayered(oldPath, newPath);
			if (!ok) return false;
			return this.remote.remove(toRemoteServerPath(oldPath));
		}
		return false;
	}

	async mkdirAll(path: string) {
		if (isRemotePath(path)) {
			if (!this.remote) return false;
			return this.remote.mkdirAll(toRemoteServerPath(path));
		}
		return this.lifted.mkdirAll(path);
	}

	watch(path: string, handler: (event: import("@playground/remote-fs").WatchEvent) => void): () => void {
		if (isRemotePath(path) && this.remote) {
			return this.remote.watch(toRemoteServerPath(path), handler);
		}
		return () => {};
	}

	private _namespace(path: string): Namespace | null {
		if (isRemotePath(path)) return "remote";
		if (
			isUnder(path, TEMP_ROOT) ||
			isUnder(path, LOCAL_ROOT) ||
			isRootPath(path)
		) {
			return "layered";
		}
		return null;
	}

	private async _copyLayeredToRemote(
		fromPath: string,
		toVirtualRemote: string,
	): Promise<boolean> {
		if (!this.remote) return false;
		const serverPath = toRemoteServerPath(toVirtualRemote);
		const info = this.layered.stat(fromPath);
		if (!info) return false;
		if (info.isDir) {
			if (!(await this.remote.mkdirAll(serverPath))) return false;
			const entries = this.layered.readDir(fromPath);
			if (!entries) return false;
			for (const e of entries) {
				const src = join(fromPath, e.name);
				const dst = join(toVirtualRemote, e.name);
				if (!(await this._copyLayeredToRemote(src, dst))) return false;
			}
			return true;
		}
		const file = this.layered.open(fromPath);
		if (!file) return false;
		return this.remote.writeFile(serverPath, file.content);
	}

	private async _copyRemoteToLayered(
		fromVirtual: string,
		toPath: string,
	): Promise<boolean> {
		if (!this.remote) return false;
		const serverPath = toRemoteServerPath(fromVirtual);
		const info = await this.remote.stat(serverPath);
		if (!info) return false;
		if (info.isDir) {
			if (!this.layered.mkdirAll(toPath)) return false;
			const entries = await this.remote.readDir(serverPath);
			if (!entries) return false;
			for (const e of entries) {
				const src = join(fromVirtual, e.name);
				const dst = join(toPath, e.name);
				if (!(await this._copyRemoteToLayered(src, dst))) return false;
			}
			return true;
		}
		const file = await this.remote.open(serverPath);
		if (!file) return false;
		return this.layered.writeFile(toPath, file.content);
	}
}
