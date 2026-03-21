import { TEMP_ROOT } from "@/lib/fs/layered-fs";
import { join } from "@/lib/fs/core/path-utils";

import type { FileNode } from "./fs/core/file-node.types";

const EXAMPLES_ROOT = join(TEMP_ROOT, "examples");

export type ResolvedExamples = {
	nodes: FileNode[];
	basePath: string;
};

export function resolveExamples(children: FileNode[]): ResolvedExamples {
	const examplesDir = children.find(
		(n): n is Extract<FileNode, { kind: "dir" }> =>
			n.kind === "dir" && n.name === "examples",
	);
	if (!examplesDir) return { nodes: children, basePath: TEMP_ROOT };
	return {
		nodes: examplesDir.children,
		basePath: EXAMPLES_ROOT,
	};
}
