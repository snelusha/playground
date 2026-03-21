import { getRouterBasePath } from "@/lib/router-utils";

import { relativePathFromAncestor } from "@/lib/fs/core/path-utils";

import type { FileNode } from "@/lib/fs/core/file-node.types";

/** Share envelope (versioned for future formats). */
export type SharePayload = {
	v: 1;
	name: string;
	root: FileNode;
	/** Path under the shared root to open after import (POSIX). Set when sharing a folder and a nested file is active. */
	openRelativePath?: string;
};

export type ShareSearch = {
	share?: string;
};

export function parseShareSearch(search: Record<string, unknown>): ShareSearch {
	const raw = search.share;
	if (typeof raw !== "string" || !raw.trim()) return {};
	return { share: raw };
}

const FORMAT_RAW = 0;
const FORMAT_GZIP = 1;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_DEPTH = 40;
const MAX_NODES = 2000;
const MAX_FILE = 2 * 1024 * 1024;

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array | null {
	try {
		const pad = "=".repeat((4 - (s.length % 4)) % 4);
		const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
		const bin = atob(base64);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) {
			out[i] = bin.charCodeAt(i);
		}
		return out;
	} catch {
		return null;
	}
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data.slice()])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data.slice()])
		.stream()
		.pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function safeSeg(name: string): boolean {
	if (!name || name.length > 255) return false;
	if (name === "." || name === "..") return false;
	if (/[/\\]/.test(name) || name.includes("\0")) return false;
	return true;
}

function validNode(
	node: unknown,
	depth: number,
	n: { c: number },
): node is FileNode {
	if (depth > MAX_DEPTH || n.c++ > MAX_NODES) return false;
	if (!node || typeof node !== "object") return false;
	const r = node as Record<string, unknown>;
	if (r.kind === "file") {
		if (typeof r.name !== "string" || typeof r.content !== "string")
			return false;
		if (!safeSeg(r.name) || r.content.length > MAX_FILE) return false;
		return true;
	}
	if (r.kind === "dir") {
		if (typeof r.name !== "string" || !Array.isArray(r.children)) return false;
		if (!safeSeg(r.name)) return false;
		return r.children.every((c) => validNode(c, depth + 1, n));
	}
	return false;
}

function validOpenRelativePath(s: unknown): boolean {
	if (s === undefined) return true;
	if (typeof s !== "string" || s.length > 4096) return false;
	for (const seg of s.split("/")) {
		if (seg && !safeSeg(seg)) return false;
	}
	return true;
}

function validPayload(x: unknown): x is SharePayload {
	if (!x || typeof x !== "object") return false;
	const p = x as Record<string, unknown>;
	if (p.v !== 1 || typeof p.name !== "string" || !safeSeg(p.name)) return false;
	if (!validOpenRelativePath(p.openRelativePath)) return false;
	return validNode(p.root, 0, { c: 0 });
}

function parseJson(bytes: Uint8Array): SharePayload | null {
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!validPayload(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function encodeShareToken(payload: SharePayload): Promise<string> {
	const raw = new TextEncoder().encode(JSON.stringify(payload));
	if (raw.length > MAX_JSON) throw new Error("Share payload is too large");

	let body: Uint8Array;
	if (typeof CompressionStream !== "undefined") {
		const gz = await gzip(raw);
		body = new Uint8Array(1 + gz.length);
		body[0] = FORMAT_GZIP;
		body.set(gz, 1);
	} else {
		body = new Uint8Array(1 + raw.length);
		body[0] = FORMAT_RAW;
		body.set(raw, 1);
	}
	return bytesToBase64Url(body);
}

export async function decodeShareToken(
	token: string,
): Promise<SharePayload | null> {
	const bytes = base64UrlToBytes(token.trim());
	if (!bytes || bytes.length < 2) return null;

	const fmt = bytes[0];
	const rest = bytes.slice(1);

	if (fmt === 0) return parseJson(rest);
	if (fmt === 1) {
		if (typeof DecompressionStream === "undefined") return null;
		try {
			return parseJson(await gunzip(rest));
		} catch {
			return null;
		}
	}
	return null;
}

export function buildSharePageUrl(token: string): string {
	const base = getRouterBasePath(import.meta.env.BASE_URL);
	const pathname = base === "/" ? "/" : `${base}/`;
	const url = new URL(pathname, window.location.origin);
	url.searchParams.set("share", token);
	return url.href;
}

/** Overlays unsaved editor text onto the exported tree when the active file lies under `sharedFsPath`. */
export function mergeFileContentAtRelativePath(
	root: FileNode,
	relativePath: string,
	content: string,
): FileNode {
	if (root.kind === "file") {
		if (relativePath !== "") return root;
		return { ...root, content };
	}
	const segs = relativePath.split("/").filter(Boolean);
	if (segs.length === 0) return root;
	return {
		...root,
		children: mergeInChildren(root.children, segs, content),
	};
}

function mergeInChildren(
	children: FileNode[],
	segments: string[],
	content: string,
): FileNode[] {
	const [head, ...rest] = segments;
	return children.map((child) => {
		if (child.name !== head) return child;
		if (rest.length === 0) {
			if (child.kind === "file") return { ...child, content };
			return child;
		}
		if (child.kind === "dir") {
			return {
				...child,
				children: mergeInChildren(child.children, rest, content),
			};
		}
		return child;
	});
}

/**
 * Applies current editor buffer for the active file when it is the shared item or inside it.
 * For directory shares, sets `openRelativePath` so the recipient opens the same nested file.
 */
export function enrichShareFromActiveEditor(
	sharedFsPath: string,
	root: FileNode,
	active: { path: string; content: string } | null,
): { root: FileNode; openRelativePath?: string } {
	if (!active) return { root };
	const rel = relativePathFromAncestor(sharedFsPath, active.path);
	if (rel === null) return { root };

	const merged = mergeFileContentAtRelativePath(root, rel, active.content);
	if (root.kind === "dir" && rel !== "") {
		return { root: merged, openRelativePath: rel };
	}
	return { root: merged };
}
