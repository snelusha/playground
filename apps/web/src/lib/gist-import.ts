import type { FileNode } from "@/lib/fs/core/file-node.types";

export type GistImportResult = {
	gistId: string;
	root: FileNode;
};

type GistApiResponse = {
	id: string;
	files: Record<
		string,
		{
			filename: string;
			truncated?: boolean;
			content?: string | null;
			raw_url?: string;
			size?: number;
		}
	>;
};

const DEFAULT_TOTAL_BYTES_LIMIT = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 200;

function isHexGistId(value: string): boolean {
	return /^[a-f0-9]{20,64}$/i.test(value);
}

function tryParseUrl(input: string): URL | null {
	try {
		return new URL(input);
	} catch {
		return null;
	}
}

export function parseGistInput(value: string): { gistId: string } | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (isHexGistId(trimmed)) return { gistId: trimmed };

	const url = tryParseUrl(trimmed);
	if (!url) return null;

	if (url.hostname === "gist.github.com") {
		const parts = url.pathname.split("/").filter(Boolean);
		const maybeId = parts.at(-1);
		if (maybeId && isHexGistId(maybeId)) return { gistId: maybeId };
		return null;
	}

	if (url.hostname === "gist.githubusercontent.com") {
		const parts = url.pathname.split("/").filter(Boolean);
		if (parts.length < 2) return null;
		const maybeId = parts[1];
		if (maybeId && isHexGistId(maybeId)) return { gistId: maybeId };
		return null;
	}

	return null;
}

function bytesLen(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
		},
	});
	if (!res.ok) {
		throw new Error(`Request failed (${res.status})`);
	}
	return (await res.json()) as T;
}

async function fetchTextWithLimit(
	url: string,
	remainingBytes: number,
): Promise<{ text: string; usedBytes: number }> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Request failed (${res.status})`);

	const contentLength = Number(res.headers.get("content-length") ?? 0);
	if (contentLength > 0 && contentLength > remainingBytes) {
		throw new Error("Gist content too large");
	}

	const text = await res.text();
	const usedBytes = bytesLen(text);
	if (usedBytes > remainingBytes) throw new Error("Gist content too large");
	return { text, usedBytes };
}

function safePathSegments(filename: string): string[] {
	return filename
		.split("/")
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && s !== "." && s !== "..");
}

function insertFile(
	root: Extract<FileNode, { kind: "dir" }>,
	pathSegments: string[],
	content: string,
) {
	let cursor = root;
	for (let i = 0; i < pathSegments.length; i++) {
		const seg = pathSegments[i]!;
		const isLeaf = i === pathSegments.length - 1;

		if (isLeaf) {
			cursor.children.push({ kind: "file", name: seg, content });
			return;
		}

		let next = cursor.children.find(
			(c) => c.kind === "dir" && c.name === seg,
		) as Extract<FileNode, { kind: "dir" }> | undefined;

		if (!next) {
			next = { kind: "dir", name: seg, children: [] };
			cursor.children.push(next);
		}
		cursor = next;
	}
}

export async function importGistToFileNodeTree(
	input: string,
	opts?: { totalBytesLimit?: number; maxFiles?: number },
): Promise<GistImportResult> {
	const parsed = parseGistInput(input);
	if (!parsed) throw new Error("Invalid gist URL");

	const totalBytesLimit = opts?.totalBytesLimit ?? DEFAULT_TOTAL_BYTES_LIMIT;
	const maxFiles = opts?.maxFiles ?? DEFAULT_MAX_FILES;

	const apiUrl = `https://api.github.com/gists/${encodeURIComponent(parsed.gistId)}`;
	const gist = await fetchJson<GistApiResponse>(apiUrl);

	const root: Extract<FileNode, { kind: "dir" }> = {
		kind: "dir",
		name: "gist",
		children: [],
	};

	let remaining = totalBytesLimit;
	let count = 0;

	for (const entry of Object.values(gist.files ?? {})) {
		if (count >= maxFiles) throw new Error("Too many gist files");
		const segments = safePathSegments(entry.filename);
		if (!segments.length) continue;

		let content = entry.content ?? "";
		if (entry.truncated) {
			if (!entry.raw_url) throw new Error("Gist file is truncated");
			const fetched = await fetchTextWithLimit(entry.raw_url, remaining);
			content = fetched.text;
			remaining -= fetched.usedBytes;
		} else {
			const used = bytesLen(content);
			if (used > remaining) throw new Error("Gist content too large");
			remaining -= used;
		}

		insertFile(root, segments, content);
		count++;
	}

	return { gistId: gist.id, root };
}

