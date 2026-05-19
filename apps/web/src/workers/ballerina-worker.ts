import "@/wasm_exec";

import * as Comlink from "comlink";

import type { BallerinaWorkerAPI, RunResult } from "./ballerina-worker-api";
import type { SnapshotFS } from "@/lib/fs/snapshot";

export interface GoRuntime {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void>;
}

declare const self: typeof globalThis & {
	Go: new () => GoRuntime;
	run: (fs: SnapshotFS, path: string) => Promise<{ error?: string } | null>;
	getDiagnostics: (
		fs: SnapshotFS,
		path: string,
	) => Promise<Array<Record<string, unknown>>>;
};

async function fetchWithProgress(
	url: string,
	onProgress: (pct: number) => void,
): Promise<Response> {
	const res = await fetch(url);
	if (!res.body) return res;

	const total = Number(res.headers.get("content-length") ?? 0);
	const reader = res.body.getReader();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let loaded = 0;
			if (total <= 0) onProgress(0);

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					if (total <= 0) onProgress(100);
					controller.close();
					break;
				}

				if (value) {
					loaded += value.byteLength;
					if (total > 0) onProgress(Math.round((loaded / total) * 100));
					controller.enqueue(value);
				}
			}
		},
	});

	return new Response(stream, { headers: res.headers });
}

// TODO: This can be removed when we have PAL support (v0.5.0)
async function captureConsoleLogs<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; output: string }> {
	const lines: string[] = [];
	const originalLog = console.log;

	console.log = (...args: unknown[]) => lines.push(args.join(" "));

	try {
		const result = await fn();
		return { result, output: lines.join("\n") };
	} finally {
		console.log = originalLog;
	}
}

let initPromise: Promise<void> | null = null;

const api: BallerinaWorkerAPI = {
	init: (
		wasmUrl: string,
		onProgress: (progress: number) => void,
	): Promise<void> => {
		if (initPromise) return initPromise;

		initPromise = (async () => {
			const go = new self.Go();
			const { instance } = await WebAssembly.instantiateStreaming(
				fetchWithProgress(wasmUrl, onProgress),
				go.importObject,
			);
			void go.run(instance);
		})().catch((error) => {
			initPromise = null;
			throw error;
		});

		return initPromise;
	},
	run: async (snapshot: SnapshotFS, path: string): Promise<RunResult> => {
		if (typeof self.run !== "function")
			return Promise.resolve({ error: "Ballerina runtime is not initialized" });
		return captureConsoleLogs(() =>
			Promise.resolve(self.run(snapshot, path)),
		).then(({ result, output }) => ({
			output: output || undefined,
			error: result?.error || undefined,
		}));
	},
	getDiagnostics: (
		snapshot: SnapshotFS,
		path: string,
	): Promise<Array<Record<string, unknown>>> => {
		if (typeof self.getDiagnostics !== "function") return Promise.resolve([]);
		return Promise.resolve(self.getDiagnostics(snapshot, path) ?? []);
	},
};

Comlink.expose(api);
