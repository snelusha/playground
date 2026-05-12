/// <reference lib="webworker" />

import * as Comlink from "comlink";

import "@/wasm_exec";

import { SnapshotFS } from "@/lib/fs/snapshot";

import type {
	BallerinaWorkerApi,
	WorkerDiagnostic,
	WorkerRunResult,
} from "@/workers/ballerina-worker-protocol";

// ---------------------------------------------------------------------------
// Worker global augmentation
// ---------------------------------------------------------------------------

declare const self: DedicatedWorkerGlobalScope & {
	Go: new () => {
		importObject: WebAssembly.Imports;
		run(instance: WebAssembly.Instance): void;
	};
	run(proxy: SnapshotFS, path: string): Promise<{ error?: string } | null>;
	getDiagnostics(
		proxy: SnapshotFS,
		path: string,
	): Promise<WorkerDiagnostic[] | null>;
};

// ---------------------------------------------------------------------------
// Worker state (encapsulated — never exported)
// ---------------------------------------------------------------------------

let initialized = false;

// ---------------------------------------------------------------------------
// API implementation
// ---------------------------------------------------------------------------

const api: BallerinaWorkerApi = {
	async init(wasmUrl, onProgress) {
		try {
			const go = new self.Go();

			const wasmResponse = fetchWithProgress(wasmUrl, (value) =>
				onProgress?.(value),
			);

			const { instance } = await WebAssembly.instantiateStreaming(
				wasmResponse,
				go.importObject,
			);

			go.run(instance);
			initialized = true;
		} catch (error) {
			throw new Error(
				toErrorMessage(error, "Failed to initialize WASM in worker"),
			);
		}
	},

	async run(path, snapshot) {
		if (!initialized) {
			throw new Error("WASM worker is not initialized");
		}

		if (typeof self.run !== "function") {
			throw new Error("WASM run function is unavailable");
		}

		try {
			const fs = SnapshotFS.deserialize(snapshot);
			return await captureRun(fs, path);
		} catch (error) {
			throw new Error(toErrorMessage(error, "Failed to run Ballerina program"));
		}
	},

	async diagnostics(path, snapshot) {
		if (!initialized) {
			throw new Error("WASM worker is not initialized");
		}

		if (typeof self.getDiagnostics !== "function") {
			throw new Error("WASM diagnostics function is unavailable");
		}

		try {
			const fs = SnapshotFS.deserialize(snapshot);
			return await self.getDiagnostics(fs, path);
		} catch (error) {
			throw new Error(toErrorMessage(error, "Failed to get diagnostics"));
		}
	},
};

Comlink.expose(api);

// ---------------------------------------------------------------------------
// Output capture
// ---------------------------------------------------------------------------

/**
 * Runs the WASM program while capturing `console.log` output.
 *
 * The original `console.log` is saved and restored in a `finally` block so
 * that even a throw leaves the worker in a clean state. Reentrant calls are
 * safe because each invocation captures a fresh reference to the *current*
 * `console.log` (which may itself already be a capturing wrapper).
 */
async function captureRun(
	snapshot: SnapshotFS,
	path: string,
): Promise<WorkerRunResult | null> {
	const savedLog = console.log;
	const chunks: string[] = [];

	console.log = (...args: unknown[]) => {
		chunks.push(args.map(String).join(" "));
		savedLog.apply(console, args);
	};

	try {
		const runtimeResult = await self.run(snapshot, path);
		const output = chunks.join("\n");

		if (runtimeResult?.error) {
			return { output, error: runtimeResult.error };
		}
		return { output };
	} finally {
		console.log = savedLog;
	}
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return fallback;
}

/**
 * Fetches a URL and reports download progress (0–100) via `onProgress`.
 *
 * Falls back to a plain fetch when `Content-Length` is absent (e.g. chunked
 * transfer encoding), so callers always get a usable `Response`.
 */
async function fetchWithProgress(
	url: string,
	onProgress: (value: number) => void,
): Promise<Response> {
	const response = await fetch(url);

	const contentLength = response.headers.get("content-length");
	const total = contentLength ? Number(contentLength) : 0;

	if (!response.body || total <= 0) {
		// No progress info available — return as-is.
		return response;
	}

	const reader = response.body.getReader();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let loaded = 0;

			try {
				for (;;) {
					const { done, value } = await reader.read();

					if (done) {
						controller.close();
						break;
					}

					if (!value) continue;

					loaded += value.byteLength;
					onProgress(Math.min(100, Math.round((loaded / total) * 100)));
					controller.enqueue(value);
				}
			} catch (err) {
				controller.error(err);
				reader.cancel().catch(() => void 0);
			}
		},
		cancel() {
			reader.cancel().catch(() => void 0);
		},
	});

	return new Response(stream, { headers: response.headers });
}
