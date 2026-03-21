import { getRouterBasePath } from "@/lib/router-utils";

import type { SharePayloadV1 } from "@/lib/share/share-payload.types";

/** 0 = raw UTF-8 JSON, 1 = gzip(JSON) */
const FORMAT_RAW = 0;
const FORMAT_GZIP = 1;

const MAX_JSON_BYTES = 2 * 1024 * 1024;

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

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data.slice()])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encodes a share payload as a single base64url token (format byte + payload).
 */
export async function encodeShareToken(
	payload: SharePayloadV1,
): Promise<string> {
	const json = JSON.stringify(payload);
	const encoder = new TextEncoder();
	const raw = encoder.encode(json);
	if (raw.length > MAX_JSON_BYTES) {
		throw new Error("Share payload is too large");
	}

	let body: Uint8Array;
	if (typeof CompressionStream !== "undefined") {
		const gz = await gzipCompress(raw);
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

/**
 * Full app URL with `share` query param, respecting Vite `BASE_URL`.
 */
export function buildSharePageUrl(shareToken: string): string {
	const base = getRouterBasePath(import.meta.env.BASE_URL);
	const pathname = base === "/" ? "/" : `${base}/`;
	const url = new URL(pathname, window.location.origin);
	url.searchParams.set("share", shareToken);
	return url.href;
}
