import type { FileNode } from "@/lib/fs/core/file-node.types";
import type { SharePayloadV1 } from "@/lib/share/share-payload.types";

const MAX_DEPTH = 40;
const MAX_NODES = 2000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isSafeSegmentName(name: string): boolean {
	if (!name || name.length > 255) return false;
	if (name === "." || name === "..") return false;
	if (/[/\\]/.test(name) || name.includes("\0")) return false;
	return true;
}

function validateFileNode(
	node: unknown,
	depth: number,
	counter: { n: number },
): node is FileNode {
	if (depth > MAX_DEPTH) return false;
	if (counter.n++ > MAX_NODES) return false;
	if (!node || typeof node !== "object") return false;
	const rec = node as Record<string, unknown>;
	if (rec.kind === "file") {
		if (typeof rec.name !== "string" || typeof rec.content !== "string")
			return false;
		if (!isSafeSegmentName(rec.name)) return false;
		if (rec.content.length > MAX_FILE_BYTES) return false;
		return true;
	}
	if (rec.kind === "dir") {
		if (typeof rec.name !== "string" || !Array.isArray(rec.children))
			return false;
		if (!isSafeSegmentName(rec.name)) return false;
		return rec.children.every((c) => validateFileNode(c, depth + 1, counter));
	}
	return false;
}

export function validateSharePayloadV1(
	payload: unknown,
): payload is SharePayloadV1 {
	if (!payload || typeof payload !== "object") return false;
	const p = payload as Record<string, unknown>;
	if (p.v !== 1) return false;
	if (typeof p.name !== "string" || !isSafeSegmentName(p.name)) return false;
	if (!validateFileNode(p.root, 0, { n: 0 })) return false;
	return true;
}
