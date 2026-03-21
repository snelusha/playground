import { AbstractFS } from "@/lib/fs/core/abstract-fs";
import { join } from "@/lib/fs/core/path-utils";

import type { FileNode } from "@/lib/fs/core/file-node.types";

/** Must match `TEMP_SHARED_ROOT` in `layered-fs.ts`. */
const TEMP_SHARED_ROOT = join("/tmp", "shared");

function sanitizeSuggestedName(name: string): string {
	const s = name.replace(/[/\\]/g, "").replace(/\0/g, "").trim();
	if (!s || s === "." || s === "..") return "shared";
	return s.slice(0, 120);
}

function pathSegmentOk(seg: string): boolean {
	if (!seg || seg === "." || seg === "..") return false;
	if (/[/\\]/.test(seg) || seg.includes("\0")) return false;
	return seg.length <= 255;
}

function findFirstFilePath(fs: AbstractFS, dirPath: string): string | null {
	const entries = fs.readDir(dirPath);
	if (!entries) return null;
	const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
	for (const e of sorted) {
		const p = `${dirPath}/${e.name}`;
		if (!e.isDir) return p;
		const sub = findFirstFilePath(fs, p);
		if (sub) return sub;
	}
	return null;
}

export class EphemeralFS extends AbstractFS {
	constructor(initial: FileNode[] = []) {
		super();
		this._seed(initial);
	}

	/**
	 * Writes shared content under `/tmp/shared/...` only (not persisted).
	 * Returns a file path to open, or null.
	 */
	importSharedRoot(
		suggestedName: string,
		root: FileNode,
		openRelativePath?: string,
	): string | null {
		const base = sanitizeSuggestedName(suggestedName);
		let unique = base;
		let i = 1;
		while (this.stat(`${TEMP_SHARED_ROOT}/${unique}`)) {
			unique = `${base}-${i}`;
			i++;
		}
		const target = `${TEMP_SHARED_ROOT}/${unique}`;
		if (root.kind === "file") {
			if (!this.writeFile(target, root.content)) return null;
			return target;
		}
		if (!this.mkdirAll(target)) return null;
		this._seed(root.children, target);

		const rel = openRelativePath?.trim();
		if (rel) {
			const segs = rel.split("/").filter(Boolean);
			if (segs.length && segs.every(pathSegmentOk)) {
				let candidate = target;
				for (const seg of segs) {
					candidate = `${candidate}/${seg}`;
				}
				const st = this.stat(candidate);
				if (st && !st.isDir) return candidate;
			}
		}
		return findFirstFilePath(this, target);
	}
}
