import { dirname, join } from "@/lib/fs/core/path-utils";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";

import type { FS } from "@/lib/fs/core/fs.interface";
import type {
	FsSnapshot,
	SnapshotEntry,
} from "@/workers/ballerina-worker-protocol";

export async function buildScopedFsSnapshot(
	fs: FS,
	targetPath: string,
): Promise<FsSnapshot> {
	const rootPath = await resolveSnapshotRoot(fs, targetPath);
	const entries = await snapshotSubtree(fs, rootPath);

	return {
		rootPath,
		targetPath,
		entries,
	};
}

async function resolveSnapshotRoot(
	fs: FS,
	targetPath: string,
): Promise<string> {
	try {
		const projectTarget = await getBallerinaProjectTarget(fs, targetPath);
		const targetInfo = await fs.stat(projectTarget);
		if (targetInfo?.isDir) return projectTarget;
	} catch {
		// Fall back to target path resolution below.
	}

	const fileInfo = await fs.stat(targetPath);
	if (fileInfo?.isDir) return targetPath;

	const parent = dirname(targetPath);
	if (await fs.stat(parent)) return parent;

	return "/";
}

async function snapshotSubtree(
	fs: FS,
	rootPath: string,
): Promise<SnapshotEntry[]> {
	const entries: SnapshotEntry[] = [];
	const visitedDirs = new Set<string>();

	async function walk(path: string): Promise<void> {
		const info = await fs.stat(path);
		if (!info) return;

		if (info.isDir) {
			if (visitedDirs.has(path)) return;
			visitedDirs.add(path);
			entries.push({
				path,
				kind: "dir",
				modTime: info.modTime,
			});

			const dirEntries = await fs.readDir(path);
			if (!dirEntries) return;

			for (const child of dirEntries) {
				await walk(join(path, child.name));
			}
			return;
		}

		const file = await fs.open(path);
		if (!file) return;
		entries.push({
			path,
			kind: "file",
			content: file.content,
			modTime: file.modTime,
		});
	}

	await walk(rootPath);
	return entries;
}
