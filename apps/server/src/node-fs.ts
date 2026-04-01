// ─── node-fs.ts (server) ──────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import type { FileEntry, StatEntry, DirEntry } from "@playground/remote-fs";

export class NodeFS {
	private readonly root: string;

	constructor(root: string) {
		// Always absolute, always with a trailing sep so startsWith is unambiguous
		this.root = path.resolve(root).replace(/\/?$/, path.sep);
	}

	private resolve(userPath: string): string {
		const resolved = path.resolve(
			this.root,
			path.normalize(userPath).replace(/^(\.\.[/\\])+/, ""),
		);
		// resolved must be the root itself or inside it
		if (
			resolved !== this.root.slice(0, -1) &&
			!resolved.startsWith(this.root)
		) {
			throw new Error("Path escape attempt");
		}
		return resolved;
	}

	async open(userPath: string): Promise<FileEntry | null> {
		try {
			const abs = this.resolve(userPath);
			const stat = await fs.stat(abs);
			const content = stat.isDirectory() ? "" : await fs.readFile(abs, "utf-8");
			return {
				content,
				size: stat.size,
				modTime: stat.mtimeMs,
				isDir: stat.isDirectory(),
			};
		} catch {
			return null;
		}
	}

	async stat(userPath: string): Promise<StatEntry | null> {
		try {
			const abs = this.resolve(userPath);
			const stat = await fs.stat(abs);
			return {
				name: path.basename(abs),
				size: stat.size,
				modTime: stat.mtimeMs,
				isDir: stat.isDirectory(),
			};
		} catch {
			return null;
		}
	}

	async readDir(userPath: string): Promise<DirEntry[] | null> {
		try {
			const abs = this.resolve(userPath);
			const entries = await fs.readdir(abs, { withFileTypes: true });
			return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
		} catch {
			return null;
		}
	}

	async writeFile(userPath: string, content: string): Promise<boolean> {
		try {
			const abs = this.resolve(userPath);
			await fs.mkdir(path.dirname(abs), { recursive: true });
			await fs.writeFile(abs, content, "utf-8");
			return true;
		} catch {
			return false;
		}
	}

	async remove(userPath: string): Promise<boolean> {
		try {
			await fs.rm(this.resolve(userPath), { recursive: true, force: true });
			return true;
		} catch {
			return false;
		}
	}

	async move(from: string, to: string): Promise<boolean> {
		try {
			const absTo = this.resolve(to);
			await fs.mkdir(path.dirname(absTo), { recursive: true });
			await fs.rename(this.resolve(from), absTo);
			return true;
		} catch {
			return false;
		}
	}

	async mkdirAll(userPath: string): Promise<boolean> {
		try {
			await fs.mkdir(this.resolve(userPath), { recursive: true });
			return true;
		} catch {
			return false;
		}
	}
}
