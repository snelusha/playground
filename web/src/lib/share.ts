import { isSafeRelativePath, join } from "@/lib/fs/core/path-utils";

import type { FileNode } from "@/lib/fs/core/file-node.types";

function base64ToUtf8(b64: string): string {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

function isFileNode(value: unknown): value is FileNode {
	if (!value || typeof value !== "object") return false;
	const o = value as Record<string, unknown>;
	if (o.kind === "file") {
		return typeof o.name === "string" && typeof o.content === "string";
	}
	if (o.kind === "dir") {
		return (
			typeof o.name === "string" &&
			Array.isArray(o.children) &&
			o.children.every(isFileNode)
		);
	}
	return false;
}

export type SharePayload = {
	root: FileNode;
	/** Path under `/tmp/shared` after import (e.g. `MyPkg/main.bal`). */
	openRelativePath?: string;
};

/** When sharing a directory, pass the active file path so the recipient can open the same file. */
export function relativePathUnderSharedRoot(
	sharedRootPath: string,
	activePath: string | null,
): string | null {
	if (!activePath) return null;
	const root = sharedRootPath.replace(/\/$/, "");
	if (activePath !== root && !activePath.startsWith(`${root}/`)) return null;
	if (activePath === root) return null;
	return activePath.slice(root.length + 1);
}

/**
 * Path to open after {@link LayeredFS.importSharedFileNodeIntoTemp}: `join(SHARED_IMPORT_ROOT, result)`.
 * For a directory snapshot this is `dirName/...` relative to `/tmp/shared`, not only the file segment.
 */
export function relativePathForSharedImport(
	snapshot: FileNode,
	filesystemSharedPath: string,
	activePath: string | null,
): string | null {
	if (snapshot.kind !== "dir" || !activePath) return null;
	const rel = relativePathUnderSharedRoot(filesystemSharedPath, activePath);
	if (!rel) return null;
	return join(snapshot.name, rel);
}

/** Decodes legacy raw {@link FileNode} payloads and wrapped {@link SharePayload}. */
export function deserializeSharePayload(encoded: string): SharePayload | null {
	try {
		const json = base64ToUtf8(encoded);
		const parsed: unknown = JSON.parse(json);
		if (isFileNode(parsed)) return { root: parsed };
		if (
			parsed &&
			typeof parsed === "object" &&
			"root" in parsed &&
			isFileNode((parsed as { root: unknown }).root)
		) {
			const p = parsed as { root: FileNode; openRelativePath?: unknown };
			const raw = p.openRelativePath;
			if (raw === undefined || raw === null) return { root: p.root };
			if (typeof raw !== "string") return { root: p.root };
			const rel = raw.trim();
			if (!rel || !isSafeRelativePath(rel)) return { root: p.root };
			return { root: p.root, openRelativePath: rel };
		}
		return null;
	} catch {
		return null;
	}
}

/** Decodes a payload produced by {@link serializeFileNodeForShare} / {@link serializeSharePayload}. Returns `null` if invalid. */
export function deserializeFileNodeFromShare(encoded: string): FileNode | null {
	return deserializeSharePayload(encoded)?.root ?? null;
}

function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

export function serializeFileNodeForShare(node: FileNode): string {
	return utf8ToBase64(JSON.stringify(node));
}

/** Prefer this when sharing a directory while a file inside it is active. */
export function serializeSharePayload(
	root: FileNode,
	openRelativePath?: string | null,
): string {
	if (openRelativePath) {
		return utf8ToBase64(JSON.stringify({ root, openRelativePath }));
	}
	return utf8ToBase64(JSON.stringify(root));
}

export function buildShareUrl(encodedPayload: string): string {
	const url = new URL(window.location.href);
	url.searchParams.set("share", encodedPayload);
	return url.toString();
}

export function copyToClipboardSilent(text: string): void {
	void navigator.clipboard.writeText(text).catch(() => {});
}
