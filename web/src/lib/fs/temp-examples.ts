import type { FileNode } from "@/lib/fs/core/file-node.types";

import {
	TEMP_EXAMPLES_DIR_NAME,
	TEMP_EXAMPLES_ROOT,
	TEMP_ROOT,
} from "@/lib/fs/layered-fs";

/**
 * Children of `/tmp` as returned by {@link LayeredFS.tempTree}, with the `examples`
 * directory hoisted: its children are returned as top-level nodes and `basePath` is
 * `/tmp/examples` so the UI can render them without an extra folder row.
 */
export type HoistedTempExamples = {
	nodes: FileNode[];
	basePath: string;
};

export function hoistTempExamples(childrenOfTmp: FileNode[]): HoistedTempExamples {
	const wrapped = childrenOfTmp.find(
		(n): n is Extract<FileNode, { kind: "dir" }> =>
			n.kind === "dir" && n.name === TEMP_EXAMPLES_DIR_NAME,
	);
	if (wrapped) {
		return { nodes: wrapped.children, basePath: TEMP_EXAMPLES_ROOT };
	}
	return { nodes: childrenOfTmp, basePath: TEMP_ROOT };
}
