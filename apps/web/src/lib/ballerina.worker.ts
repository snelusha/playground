import "@/wasm_exec";

import { SnapshotFS } from "@/lib/fs/snapshot-fs";

import type { SerializedFSNode } from "@/lib/fs/snapshot-fs";

type Diagnostic = Record<string, unknown>;

type RunResult = {
	error?: string;
	output: string;
};

type LoadRequest = {
	type: "load";
	id: number;
};

type DiagnosticsRequest = {
	type: "diagnostics";
	id: number;
	fs: SerializedFSNode;
	targetPath: string;
};

type RunRequest = {
	type: "run";
	id: number;
	fs: SerializedFSNode;
	targetPath: string;
};

type WorkerRequest = LoadRequest | DiagnosticsRequest | RunRequest;

type LoadResponse = {
	type: "load";
	id: number;
};

type ProgressResponse = {
	type: "progress";
	id: number;
	progress: number;
};

type DiagnosticsResponse = {
	type: "diagnostics";
	id: number;
	diagnostics: Diagnostic[];
};

type RunResponse = {
	type: "run";
	id: number;
	result: RunResult;
};

type ErrorResponse = {
	type: "error";
	id: number;
	error: string;
};

type GoRuntime = {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void>;
};

const workerGlobal = globalThis as typeof globalThis & {
	Go: new () => GoRuntime;
	run(proxy: SnapshotFS, path: string): Promise<{ error?: string } | null>;
	getDiagnostics(proxy: SnapshotFS, path: string): Promise<Diagnostic[] | null>;
};

let wasmReady: Promise<void> | null = null;
let wasmLoaded = false;

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	void handleRequest(event.data);
});

async function handleRequest(request: WorkerRequest): Promise<void> {
	try {
		switch (request.type) {
			case "load":
				await loadWasm((progress) => {
					postMessage({
						type: "progress",
						id: request.id,
						progress,
					} satisfies ProgressResponse);
				});
				postMessage({ type: "load", id: request.id } satisfies LoadResponse);
				return;
			case "diagnostics": {
				await loadWasm();
				const diagnostics = await workerGlobal.getDiagnostics(
					new SnapshotFS(request.fs),
					request.targetPath,
				);
				postMessage({
					type: "diagnostics",
					id: request.id,
					diagnostics: diagnostics ?? [],
				} satisfies DiagnosticsResponse);
				return;
			}
			case "run": {
				await loadWasm();
				const result = await runWithCapturedOutput(
					new SnapshotFS(request.fs),
					request.targetPath,
				);
				postMessage({
					type: "run",
					id: request.id,
					result,
				} satisfies RunResponse);
				return;
			}
		}
	} catch (error) {
		postMessage({
			type: "error",
			id: request.id,
			error: error instanceof Error ? error.message : String(error),
		} satisfies ErrorResponse);
	}
}

async function runWithCapturedOutput(
	fs: SnapshotFS,
	targetPath: string,
): Promise<RunResult> {
	const oldLog = console.log;
	let output = "";

	console.log = (...args) => {
		output += `${args.join(" ")}\n`;
		oldLog.apply(console, args);
	};

	try {
		const result = await workerGlobal.run(fs, targetPath);
		return {
			...(result?.error ? { error: result.error } : {}),
			output,
		};
	} finally {
		console.log = oldLog;
	}
}

async function loadWasm(
	onProgress?: (progress: number) => void,
): Promise<void> {
	if (wasmLoaded) {
		onProgress?.(100);
		return;
	}

	wasmReady ??= (async () => {
		const go = new workerGlobal.Go();
		const wasmUrl = new URL(
			"ballerina.wasm",
			new URL(import.meta.env.BASE_URL, self.location.origin),
		).toString();
		const result = await WebAssembly.instantiateStreaming(
			fetchResponseWithProgress(wasmUrl, (progress) => {
				onProgress?.(progress);
			}),
			go.importObject,
		);
		void go.run(result.instance);
		wasmLoaded = true;
		onProgress?.(100);
	})();

	return wasmReady;
}

async function fetchResponseWithProgress(
	url: string,
	onProgress: (progress: number) => void,
): Promise<Response> {
	const res = await fetch(url);
	const total = Number(res.headers.get("content-length") ?? 0);

	if (!res.body || !total) return res;

	const reader = res.body.getReader();
	const stream = new ReadableStream({
		async start(controller) {
			let loaded = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					break;
				}
				if (value) {
					loaded += value.byteLength;
					onProgress(Math.round((loaded / total) * 100));
					controller.enqueue(value);
				}
			}
		},
	});

	return new Response(stream, { headers: res.headers });
}
