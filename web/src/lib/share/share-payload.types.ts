import type { FileNode } from "@/lib/fs/core/file-node.types";

export type SharePayloadV1 = {
	v: 1;
	/** Basename of the shared root (file or directory) */
	name: string;
	/** Single file or directory subtree */
	root: FileNode;
};
