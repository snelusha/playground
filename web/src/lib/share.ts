import {
	getRelativePathInTree,
	toFileNode,
} from "@/lib/fs/core/file-node-utils";
import { isSafeRelativePath } from "@/lib/fs/core/path-utils";

import type { LayeredFS } from "@/lib/fs/layered-fs";
import type { FileNode } from "@/lib/fs/core/file-node.types";

export type SharePayload = {
	root: FileNode;
	openRelativePath?: string;
};

function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	return btoa(String.fromCharCode(...bytes));
}

function base64ToUtf8(b64: string): string {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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

export function encodeSharePayload(
	root: FileNode,
	openRelativePath?: string | null,
): string {
	return utf8ToBase64(
		JSON.stringify({ root, ...(openRelativePath && { openRelativePath }) }),
	);
}

export function decodeSharePayload(encoded: string): SharePayload | null {
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

export function createShareUrl(encodedPayload: string) {
	const url = new URL(import.meta.env.BASE_URL, window.location.origin);
	url.searchParams.set("share", encodedPayload);
	return url.toString();
}

export function omitSearchParam(
	prev: Record<string, unknown>,
	key: string,
): Record<string, unknown> {
	const { [key]: _, ...rest } = prev;
	return rest;
}

export function copyShareLinkToClipboard(
	fs: LayeredFS,
	nodePath: string,
	activeFilePath: string | null,
): void {
	const root = toFileNode(fs, nodePath);
	if (!root) return;

	if (root.kind === "file") {
		const encoded = encodeSharePayload(root);
		const url = createShareUrl(encoded);
		void navigator.clipboard.writeText(url).catch(() => {});
		return;
	}

	const openRelativePath = getRelativePathInTree(
		root,
		nodePath,
		activeFilePath,
	);
	const encoded = openRelativePath
		? encodeSharePayload(root, openRelativePath)
		: encodeSharePayload(root);
	const url = createShareUrl(encoded);
	void navigator.clipboard.writeText(url).catch(() => {});
}
