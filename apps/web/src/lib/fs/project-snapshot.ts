import { join } from "@/lib/fs/core/path-utils";

import type { FS } from "@/lib/fs/core/fs.interface";

export type SnapshotFile = { path: string; content: string };

export type ProjectSnapshot = {
	files: SnapshotFile[];
};

/**
 * Collects all files under `targetPath` (inclusive) for a read-only WASM FS in a worker.
 */
export async function collectProjectSnapshot(
	fs: FS,
	targetPath: string,
): Promise<ProjectSnapshot> {
	const files: SnapshotFile[] = [];

	async function walk(dir: string): Promise<void> {
		const entries = await fs.readDir(dir);
		if (!entries) return;
		for (const e of entries) {
			const p = join(dir, e.name);
			if (e.isDir) {
				await walk(p);
			} else {
				const opened = await fs.open(p);
				if (opened && !opened.isDir) {
					files.push({ path: p, content: opened.content });
				}
			}
		}
	}

	const rootStat = await fs.stat(targetPath);
	if (rootStat?.isDir) {
		await walk(targetPath);
	} else {
		const opened = await fs.open(targetPath);
		if (opened && !opened.isDir) {
			files.push({ path: targetPath, content: opened.content });
		}
	}

	return { files };
}
