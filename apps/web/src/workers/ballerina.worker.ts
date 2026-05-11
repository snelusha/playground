import "@/wasm_exec";

import type { FS, OpenResult, StatResult } from "@/lib/fs/core/fs.interface";
import type {
	FsSnapshot,
	WorkerRequest,
	WorkerResponse,
	WorkerResultMap,
} from "@/workers/ballerina-worker-protocol";

type GoRuntime = {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void> | void;
};

type RuntimeGlobals = typeof globalThis & {
	Go: new () => GoRuntime;
	run: (proxy: FS, path: string) => { error?: string } | null;
	getDiagnostics: (
		proxy: FS,
		path: string,
	) => Promise<Array<Record<string, unknown>> | null>;
};

class SnapshotFS implements FS {
	private files = new Map<string, { content: string; modTime: number }>();
	private dirs = new Map<string, { modTime: number }>();

	constructor(snapshot: FsSnapshot) {
		for (const entry of snapshot.entries) {
			if (entry.kind === "dir") {
				this.dirs.set(entry.path, { modTime: entry.modTime });
				continue;
			}
			this.files.set(entry.path, {
				content: entry.content,
				modTime: entry.modTime,
			});
		}
		if (!this.dirs.has("/")) this.dirs.set("/", { modTime: Date.now() });
	}

	async open(path: string): Promise<OpenResult | null> {
		const file = this.files.get(path);
		if (!file) return null;
		return {
			content: file.content,
			size: file.content.length,
			modTime: file.modTime,
			isDir: false,
		};
	}

	async stat(path: string): Promise<StatResult | null> {
		const dir = this.dirs.get(path);
		if (dir) {
			return {
				name: this.baseName(path),
				size: 0,
				modTime: dir.modTime,
				isDir: true,
			};
		}
		const file = this.files.get(path);
		if (!file) return null;
		return {
			name: this.baseName(path),
			size: file.content.length,
			modTime: file.modTime,
			isDir: false,
		};
	}

	async readDir(
		path: string,
	): Promise<Array<{ name: string; isDir: boolean }> | null> {
		if (!this.dirs.has(path)) return null;
		const children = new Map<string, boolean>();

		const prefix = path === "/" ? "/" : `${path}/`;
		for (const dirPath of this.dirs.keys()) {
			if (dirPath === path || !dirPath.startsWith(prefix)) continue;
			const suffix = dirPath.slice(prefix.length);
			if (!suffix) continue;
			const [segment] = suffix.split("/");
			if (segment) children.set(segment, true);
		}
		for (const filePath of this.files.keys()) {
			if (!filePath.startsWith(prefix)) continue;
			const suffix = filePath.slice(prefix.length);
			if (!suffix) continue;
			const [segment] = suffix.split("/");
			if (segment && !children.has(segment)) children.set(segment, false);
		}

		return [...children.entries()]
			.map(([name, isDir]) => ({ name, isDir }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async writeFile(): Promise<boolean> {
		return false;
	}

	async remove(): Promise<boolean> {
		return false;
	}

	async move(): Promise<boolean> {
		return false;
	}

	async mkdirAll(): Promise<boolean> {
		return false;
	}

	private baseName(path: string): string {
		const parts = path.split("/").filter(Boolean);
		return parts[parts.length - 1] ?? "/";
	}
}

let runtimeReady = false;
let initRequestId = -1;

function send(response: WorkerResponse): void {
	self.postMessage(response);
}

function sendError(requestId: number, error: unknown): void {
	const err =
		error instanceof Error
			? error
			: new Error(typeof error === "string" ? error : "Unknown worker error");
	send({
		requestId,
		type: "error",
		payload: {
			message: err.message,
			stack: err.stack,
		},
	});
}

async function fetchResponseWithProgress(
	url: string,
	requestId: number,
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
				if (!value) continue;
				loaded += value.byteLength;
				send({
					requestId,
					type: "progress",
					payload: { percent: Math.round((loaded / total) * 100) },
				});
				controller.enqueue(value);
			}
		},
	});

	return new Response(stream, { headers: res.headers });
}

async function initRuntime(wasmUrl: string, requestId: number): Promise<void> {
	if (runtimeReady) return;
	if (initRequestId >= 0 && initRequestId !== requestId) return;
	initRequestId = requestId;

	const globals = globalThis as RuntimeGlobals;
	const go = new globals.Go();
	const result = await WebAssembly.instantiateStreaming(
		fetchResponseWithProgress(wasmUrl, requestId),
		go.importObject,
	);
	go.run(result.instance);
	runtimeReady = true;
}

function withCapturedLogs<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; output: string }> {
	let output = "";
	const oldLog = console.log;
	console.log = (...args: unknown[]) => {
		output += `${args.join(" ")}\n`;
	};
	return fn()
		.then((result) => ({ result, output }))
		.finally(() => {
			console.log = oldLog;
		});
}

async function handleRun(
	requestId: number,
	payload: Extract<WorkerRequest, { type: "run" }>["payload"],
): Promise<void> {
	const globals = globalThis as RuntimeGlobals;
	const fs = new SnapshotFS(payload.snapshot);
	const { result, output } = await withCapturedLogs(async () =>
		Promise.resolve(globals.run(fs, payload.targetPath)),
	);

	send({
		requestId,
		type: "success",
		payload: result ? { ...result, output } : { output },
	});
}

async function handleDiagnostics(
	requestId: number,
	payload: Extract<WorkerRequest, { type: "getDiagnostics" }>["payload"],
): Promise<void> {
	const globals = globalThis as RuntimeGlobals;
	const fs = new SnapshotFS(payload.snapshot);
	const diagnostics = await globals.getDiagnostics(fs, payload.targetPath);
	send({
		requestId,
		type: "success",
		payload: diagnostics,
	});
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	void (async () => {
		const message = event.data;
		try {
			switch (message.type) {
				case "init":
					await initRuntime(message.payload.wasmUrl, message.requestId);
					send({
						requestId: message.requestId,
						type: "success",
						payload: { ready: true } satisfies WorkerResultMap["init"],
					});
					break;
				case "run":
					await handleRun(message.requestId, message.payload);
					break;
				case "getDiagnostics":
					await handleDiagnostics(message.requestId, message.payload);
					break;
			}
		} catch (error) {
			sendError(message.requestId, error);
		}
	})();
};
