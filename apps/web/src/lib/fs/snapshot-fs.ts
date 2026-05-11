import {
	basename,
	isRootPath,
	join,
	pathSegments,
} from "@/lib/fs/core/path-utils";

import type {
	DirEntry,
	FS,
	OpenResult,
	StatResult,
} from "@/lib/fs/core/fs.interface";

export type SerializedFSNode = {
	isDir: boolean;
	content?: string;
	modTime: number;
	children?: Record<string, SerializedFSNode>;
};

export async function snapshotFS(fs: FS): Promise<SerializedFSNode> {
	return snapshotNode(fs, "/");
}

async function snapshotNode(fs: FS, path: string): Promise<SerializedFSNode> {
	const stat = await fs.stat(path);
	if (!stat) return { isDir: true, modTime: 0, children: {} };

	if (!stat.isDir) {
		const file = await fs.open(path);
		return {
			isDir: false,
			content: file?.content ?? "",
			modTime: stat.modTime,
		};
	}

	const entries = (await fs.readDir(path)) ?? [];
	const children: Record<string, SerializedFSNode> = {};

	for (const entry of entries) {
		children[entry.name] = await snapshotNode(fs, join(path, entry.name));
	}

	return {
		isDir: true,
		modTime: stat.modTime,
		children,
	};
}

export class SnapshotFS implements FS {
	constructor(private readonly root: SerializedFSNode) {}

	async open(path: string): Promise<OpenResult | null> {
		const node = this.node(path);
		if (!node || node.isDir) return null;
		const content = node.content ?? "";
		return {
			content,
			size: content.length,
			modTime: node.modTime,
			isDir: false,
		};
	}

	async stat(path: string): Promise<StatResult | null> {
		const node = this.node(path);
		if (!node) return null;
		return {
			name: isRootPath(path) ? "/" : basename(path),
			size: node.isDir ? 0 : (node.content?.length ?? 0),
			modTime: node.modTime,
			isDir: node.isDir,
		};
	}

	async readDir(path: string): Promise<DirEntry[] | null> {
		const node = this.node(path);
		if (!node?.isDir || !node.children) return null;
		return Object.entries(node.children).map(([name, child]) => ({
			name,
			isDir: child.isDir,
		}));
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

	private node(path: string): SerializedFSNode | null {
		let current: SerializedFSNode | undefined = this.root;
		for (const segment of pathSegments(path)) {
			current = current?.children?.[segment];
			if (!current) return null;
		}
		return current ?? null;
	}
}
