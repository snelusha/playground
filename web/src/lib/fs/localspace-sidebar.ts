import { join } from "@/lib/fs/core/path-utils";
import type { FileNode } from "@/lib/fs/core/file-node.types";

import {
	LOCAL_ROOT,
	TEMP_SHARED_DIR_NAME,
	TEMP_SHARED_ROOT,
} from "@/lib/fs/layered-fs";

export type LocalspaceSidebarEntry = {
	node: FileNode;
	path: string;
};

/**
 * Localspace sidebar lists persisted `/local/...` first, then ephemeral
 * `/tmp/shared/...` imports. Use {@link isTempSharedPath} on `path` to dim shared rows.
 */
export function localspaceSidebarEntries(
	localTree: FileNode[],
	childrenOfTmp: FileNode[],
): LocalspaceSidebarEntry[] {
	const persisted = localTree.map((node) => ({
		node,
		path: join(LOCAL_ROOT, node.name),
	}));

	const sharedDir = childrenOfTmp.find(
		(n): n is Extract<FileNode, { kind: "dir" }> =>
			n.kind === "dir" && n.name === TEMP_SHARED_DIR_NAME,
	);
	const shared = (sharedDir?.children ?? []).map((node) => ({
		node,
		path: join(TEMP_SHARED_ROOT, node.name),
	}));

	return [...persisted, ...shared];
}
