import { join } from "@/lib/fs/core/path-utils";

import type { AsyncFS } from "@playground/remote-fs";

import type { FileNode } from "@/lib/fs/core/file-node.types";

/** Build a [`FileNode`](file-node.types.ts) tree under `rootPath` using async FS (e.g. [`PlaygroundAsyncFS`](playground-async-fs.ts)). */
export async function asyncFsToFileTree(
	fs: AsyncFS,
	rootPath: string,
): Promise<FileNode[]> {
	const entries = await fs.readDir(rootPath);
	if (!entries) return [];
	const result: FileNode[] = [];
	for (const entry of entries) {
		const fullPath = join(rootPath, entry.name);
		if (entry.isDir) {
			result.push({
				kind: "dir",
				name: entry.name,
				children: await asyncFsToFileTree(fs, fullPath),
			});
		} else {
			const f = await fs.open(fullPath);
			result.push({
				kind: "file",
				name: entry.name,
				content: f?.content ?? "",
			});
		}
	}
	return result.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}
