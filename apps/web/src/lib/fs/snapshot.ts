import {
	basename,
	dirname,
	join,
	pathSegments,
} from "@/lib/fs/core/path-utils";

import type {
	DirEntry,
	FS,
	OpenResult,
	StatResult,
} from "@/lib/fs/core/fs.interface";

type SnapshotFileNode = {
	readonly isDir: false;
	readonly content: string;
	readonly modTime: number;
	readonly size: number;
};

type SnapshotDirNode = {
	readonly isDir: true;
	readonly modTime: number;
	readonly entries: readonly DirEntry[];
};

type SnapshotNode = SnapshotFileNode | SnapshotDirNode;

export type SnapshotFSMutation =
	| { type: "writeFile"; path: string; content: string }
	| { type: "remove"; path: string }
	| { type: "move"; oldPath: string; newPath: string }
	| { type: "mkdirAll"; path: string };

export class SnapshotFS implements FS {
	private readonly mutations: SnapshotFSMutation[] = [];

	private constructor(private readonly nodes: Map<string, SnapshotNode>) {}

	static async from(source: FS, rootPath: string): Promise<SnapshotFS> {
		const nodes = new Map<string, SnapshotNode>();
		await collectNodes(source, nodes, rootPath);
		ensureAncestorDirs(nodes, rootPath);
		return new SnapshotFS(nodes);
	}

	async open(path: string): Promise<OpenResult | null> {
		const node = this.nodes.get(path);
		if (!node || node.isDir) return null;
		return {
			content: node.content,
			size: node.size,
			modTime: node.modTime,
			isDir: false,
		};
	}

	async stat(path: string): Promise<StatResult | null> {
		const node = this.nodes.get(path);
		if (!node) return null;
		return {
			name: basename(path),
			size: node.isDir ? 0 : node.size,
			modTime: node.modTime,
			isDir: node.isDir,
		};
	}

	async readDir(path: string): Promise<DirEntry[] | null> {
		const node = this.nodes.get(path);
		if (!node?.isDir) return null;
		return [...node.entries];
	}

	getMutations(): SnapshotFSMutation[] {
		return [...this.mutations];
	}

	async writeFile(path: string, content: string): Promise<boolean> {
		const parentPath = dirname(path);
		const parent = this.nodes.get(parentPath);
		if (!parent?.isDir) return false;

		const existing = this.nodes.get(path);
		if (existing?.isDir) return false;

		this.nodes.set(path, {
			isDir: false,
			content,
			modTime: Date.now(),
			size: content.length,
		});
		this.refreshDirEntries(parentPath);
		this.mutations.push({ type: "writeFile", path, content });
		return true;
	}

	async remove(path: string): Promise<boolean> {
		if (!this.nodes.has(path)) return false;
		for (const key of [...this.nodes.keys()]) {
			if (key === path || key.startsWith(`${path}/`)) {
				this.nodes.delete(key);
			}
		}
		this.refreshDirEntries(dirname(path));
		this.mutations.push({ type: "remove", path });
		return true;
	}

	async move(oldPath: string, newPath: string): Promise<boolean> {
		const node = this.nodes.get(oldPath);
		if (!node || newPath.startsWith(`${oldPath}/`)) return false;

		const newParentPath = dirname(newPath);
		const newParent = this.nodes.get(newParentPath);
		if (!newParent?.isDir) return false;
		if (this.nodes.get(newPath)?.isDir) return false;

		const moved = new Map<string, SnapshotNode>();
		for (const [key, value] of this.nodes) {
			if (key === oldPath || key.startsWith(`${oldPath}/`)) {
				moved.set(`${newPath}${key.slice(oldPath.length)}`, value);
			}
		}
		for (const key of [...this.nodes.keys()]) {
			if (key === oldPath || key.startsWith(`${oldPath}/`)) {
				this.nodes.delete(key);
			}
		}
		this.refreshDirEntries(dirname(oldPath));
		for (const [key, value] of moved) this.nodes.set(key, value);
		this.refreshDirEntries(newParentPath);
		this.mutations.push({ type: "move", oldPath, newPath });
		return true;
	}

	async mkdirAll(path: string): Promise<boolean> {
		if (!path || path === "." || path === "/") return true;

		const leading = path.startsWith("/") ? "/" : "";
		let current = leading || ".";
		for (const segment of pathSegments(path)) {
			current =
				current === "/" || current === "."
					? `${leading}${segment}`
					: join(current, segment);
			const existing = this.nodes.get(current);
			if (existing && !existing.isDir) return false;
			if (!existing) {
				this.nodes.set(current, {
					isDir: true,
					modTime: Date.now(),
					entries: [],
				});
				this.refreshDirEntries(dirname(current));
			}
		}
		this.mutations.push({ type: "mkdirAll", path });
		return true;
	}

	private refreshDirEntries(path: string): void {
		const dir = this.nodes.get(path);
		if (!dir?.isDir) return;

		const entries: DirEntry[] = [];
		for (const [candidate, node] of this.nodes) {
			if (candidate === path || dirname(candidate) !== path) continue;
			entries.push({ name: basename(candidate), isDir: node.isDir });
		}
		this.nodes.set(path, {
			isDir: true,
			modTime: Date.now(),
			entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
		});
	}
}

function ensureAncestorDirs(
	nodes: Map<string, SnapshotNode>,
	path: string,
): void {
	let current = dirname(path);
	while (current && current !== ".") {
		if (!nodes.has(current)) {
			nodes.set(current, {
				isDir: true,
				modTime: Date.now(),
				entries: [],
			});
		}
		refreshDirEntries(nodes, current);
		if (current === "/") break;
		current = dirname(current);
	}
}

function refreshDirEntries(
	nodes: Map<string, SnapshotNode>,
	path: string,
): void {
	const dir = nodes.get(path);
	if (!dir?.isDir) return;

	const entries: DirEntry[] = [];
	for (const [candidate, node] of nodes) {
		if (candidate === path || dirname(candidate) !== path) continue;
		entries.push({ name: basename(candidate), isDir: node.isDir });
	}
	nodes.set(path, {
		isDir: true,
		modTime: Date.now(),
		entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
	});
}

async function collectNodes(
	source: FS,
	nodes: Map<string, SnapshotNode>,
	path: string,
): Promise<void> {
	const info = await source.stat(path);
	if (!info) return;

	if (!info.isDir) {
		await collectFileNode(source, nodes, path);
	} else {
		await collectDirNode(source, nodes, path, info.modTime);
	}
}

async function collectFileNode(
	source: FS,
	nodes: Map<string, SnapshotNode>,
	path: string,
): Promise<void> {
	const file = await source.open(path);
	if (!file) return;
	nodes.set(path, {
		isDir: false,
		content: file.content,
		modTime: file.modTime,
		size: file.size,
	});
}

async function collectDirNode(
	source: FS,
	nodes: Map<string, SnapshotNode>,
	path: string,
	modTime: number,
): Promise<void> {
	const rawEntries = (await source.readDir(path)) ?? [];
	const entries = rawEntries
		.map(({ name, isDir }) => ({ name, isDir }))
		.sort((a, b) => a.name.localeCompare(b.name));

	nodes.set(path, { isDir: true, modTime, entries });

	for (const entry of entries) {
		await collectNodes(source, nodes, join(path, entry.name));
	}
}
