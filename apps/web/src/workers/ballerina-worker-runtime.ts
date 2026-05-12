/// <reference lib="webworker" />

import { SnapshotFS } from "@/lib/fs/snapshot";

import {
	BallerinaWorkerErrors,
	type BallerinaWorkerApi,
	type WasmInitProgressCallback,
	type WorkerDiagnostic,
	type WorkerRunResult,
} from "@/workers/ballerina-worker-contract";

// ---------------------------------------------------------------------------
// Worker global augmentation (Go WASM + Ballerina exports)
// ---------------------------------------------------------------------------

declare const self: DedicatedWorkerGlobalScope & {
	Go: new () => {
		importObject: WebAssembly.Imports;
		/**
		 * Async: resolves when the Go program exits; the playground runtime stays
		 * resident, so callers must not `await` it during init.
		 */
		run(instance: WebAssembly.Instance): Promise<void>;
	};
	run(proxy: SnapshotFS, path: string): Promise<{ error?: string } | null>;
	getDiagnostics(
		proxy: SnapshotFS,
		path: string,
	): Promise<WorkerDiagnostic[] | null>;
};

function toErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return fallback;
}

/**
 * Fetches a URL and reports download progress (0–100) via `onProgress`.
 *
 * Falls back to a plain `Response` when `Content-Length` is absent (e.g.
 * chunked transfer), so `instantiateStreaming` always receives a body stream.
 */
async function fetchWithProgress(
	url: string,
	onProgress: WasmInitProgressCallback,
): Promise<Response> {
	const response = await fetch(url);

	const contentLength = response.headers.get("content-length");
	const total = contentLength ? Number(contentLength) : 0;

	if (!response.body || total <= 0) {
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

/**
 * Runs the WASM program while capturing `console.log` output.
 *
 * Restores the previous `console.log` in `finally` so failures and re-entrant
 * calls do not leak a capturing logger.
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

/**
 * Builds the object passed to `Comlink.expose`. State is closed over so this
 * module stays test-friendly and the worker entry file stays minimal.
 */
export function createBallerinaWorkerApi(): BallerinaWorkerApi {
	let initialized = false;
	let runtimeInit: Promise<void> | null = null;

	return {
		async init(wasmUrl, onProgress) {
			if (runtimeInit) return runtimeInit;

			runtimeInit = (async () => {
				const go = new self.Go();

				const wasmResponse = fetchWithProgress(
					wasmUrl,
					onProgress ?? (() => void 0),
				);

				const { instance } = await WebAssembly.instantiateStreaming(
					wasmResponse,
					go.importObject,
				);

				void go.run(instance);
				initialized = true;
			})().catch((err) => {
				runtimeInit = null;
				initialized = false;
				throw new Error(toErrorMessage(err, BallerinaWorkerErrors.initFailed));
			});

			return runtimeInit;
		},

		async run(path, snapshot) {
			if (!initialized) {
				throw new Error(BallerinaWorkerErrors.notInitialized);
			}

			if (typeof self.run !== "function") {
				throw new Error(BallerinaWorkerErrors.runUnavailable);
			}

			try {
				const fs = SnapshotFS.deserialize(snapshot);
				return await captureRun(fs, path);
			} catch (error) {
				throw new Error(toErrorMessage(error, BallerinaWorkerErrors.runFailed));
			}
		},

		async diagnostics(path, snapshot) {
			if (!initialized) {
				throw new Error(BallerinaWorkerErrors.notInitialized);
			}

			if (typeof self.getDiagnostics !== "function") {
				throw new Error(BallerinaWorkerErrors.diagnosticsUnavailable);
			}

			try {
				const fs = SnapshotFS.deserialize(snapshot);
				return await self.getDiagnostics(fs, path);
			} catch (error) {
				throw new Error(
					toErrorMessage(error, BallerinaWorkerErrors.diagnosticsFailed),
				);
			}
		},
	};
}
