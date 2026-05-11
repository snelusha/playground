import { basename, join } from "@/lib/fs/core/path-utils";

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

export type SerializedSnapshot = Array<{
	path: string;
	node:
		| {
				isDir: false;
				content: string;
				modTime: number;
				size: number;
		  }
		| {
				isDir: true;
				modTime: number;
				entries: DirEntry[];
		  };
}>;

export class SnapshotFS implements FS {
	private constructor(
		private readonly nodes: ReadonlyMap<string, SnapshotNode>,
	) {}

	static async from(source: FS, rootPath: string): Promise<SnapshotFS> {
		const nodes = new Map<string, SnapshotNode>();
		await collectNodes(source, nodes, rootPath);
		return new SnapshotFS(nodes);
	}

	static deserialize(data: SerializedSnapshot): SnapshotFS {
		const nodes = new Map<string, SnapshotNode>();
		for (const entry of data) {
			nodes.set(entry.path, entry.node);
		}
		return new SnapshotFS(nodes);
	}

	serialize(): SerializedSnapshot {
		const result: SerializedSnapshot = [];
		for (const [path, node] of this.nodes.entries()) {
			if (node.isDir) {
				result.push({
					path,
					node: {
						isDir: true,
						modTime: node.modTime,
						entries: [...node.entries],
					},
				});
			} else {
				result.push({
					path,
					node: {
						isDir: false,
						content: node.content,
						modTime: node.modTime,
						size: node.size,
					},
				});
			}
		}
		return result;
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

	async writeFile(): Promise<boolean> {
		return false;
	}
	async remove(): Promise<boolean> {
		return false;
	}
	async move(): Promise<boolean> {
		return false;
	}
	async mkdirAll(): Promise<boolean> {
		return false;
	}
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
