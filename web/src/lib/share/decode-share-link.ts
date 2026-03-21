import type { SharePayloadV1 } from "@/lib/share/share-payload.types";
import { validateSharePayloadV1 } from "@/lib/share/validate-share-payload";

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

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data.slice()])
		.stream()
		.pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parsePayloadJson(bytes: Uint8Array): SharePayloadV1 | null {
	try {
		const text = new TextDecoder().decode(bytes);
		const parsed: unknown = JSON.parse(text);
		if (
			!parsed ||
			typeof parsed !== "object" ||
			(parsed as { v?: unknown }).v !== 1
		) {
			return null;
		}
		if (!validateSharePayloadV1(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

/**
 * Decodes a token produced by {@link encodeShareToken}. Reserved for import flow.
 */
export async function decodeShareToken(
	token: string,
): Promise<SharePayloadV1 | null> {
	const bytes = base64UrlToBytes(token.trim());
	if (!bytes || bytes.length < 2) return null;

	const format = bytes[0];
	const rest = bytes.slice(1);

	if (format === 0) {
		return parsePayloadJson(rest);
	}

	if (format === 1) {
		if (typeof DecompressionStream === "undefined") return null;
		try {
			const jsonBytes = await gunzip(rest);
			return parsePayloadJson(jsonBytes);
		} catch {
			return null;
		}
	}

	return null;
}
