import "@/wasm_exec";

import { getBallerinaProjectTarget } from "@/lib/fs/project-target";

import type { FS } from "@/lib/fs/core/fs.interface";

type JsonRpcMessage = {
	jsonrpc?: "2.0";
	id?: number | string;
	method?: string;
	params?: unknown;
};

type MainToWorkerMessage =
	| { type: "lsp"; message: string }
	| { type: "fs-result"; id: number; result: unknown }
	| { type: "fs-error"; id: number; error: string };

type WorkerToMainMessage =
	| { type: "lsp"; message: string }
	| { type: "fs-request"; id: number; op: keyof FS; args: unknown[] };

type WasmGlobal = typeof globalThis & {
	Go: new () => {
		importObject: WebAssembly.Imports;
		run(instance: WebAssembly.Instance): Promise<void>;
	};
	getDiagnostics?: (
		proxy: FS,
		path: string,
	) => Promise<Array<Record<string, unknown>> | null>;
};

type WorkerContext = {
	onmessage: ((event: MessageEvent<MainToWorkerMessage>) => void) | null;
	postMessage(message: WorkerToMainMessage): void;
	setTimeout(handler: () => void, timeout?: number): number;
	clearTimeout(handle?: number): void;
};

const ctx = self as unknown as WorkerContext;
const wasmGlobal = globalThis as WasmGlobal;

let fsRequestId = 0;
let diagnosticsTimer: number | undefined;
let diagnosticsVersion = 0;
let wasmReady: Promise<void> | null = null;

const pendingFsRequests = new Map<
	number,
	{ resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
>();

const fsProxy: FS = {
	open: (path) => callFs("open", path),
	stat: (path) => callFs("stat", path),
	readDir: (path) => callFs("readDir", path),
	writeFile: (path, content) => callFs("writeFile", path, content),
	remove: (path) => callFs("remove", path),
	move: (oldPath, newPath) => callFs("move", oldPath, newPath),
	mkdirAll: (path) => callFs("mkdirAll", path),
};

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
	const data = event.data;
	if (data.type === "lsp") {
		void handleLsp(data.message);
		return;
	}

	const pending = pendingFsRequests.get(data.id);
	if (!pending) return;
	pendingFsRequests.delete(data.id);

	if (data.type === "fs-error") pending.reject(new Error(data.error));
	else pending.resolve(data.result);
};

async function handleLsp(message: string): Promise<void> {
	const request = JSON.parse(message) as JsonRpcMessage;

	switch (request.method) {
		case "initialize":
			if (request.id !== undefined) {
				respond(request.id, {
					capabilities: {
						textDocumentSync: 1,
					},
				});
			}
			return;

		case "textDocument/didOpen":
		case "textDocument/didChange":
			scheduleDiagnostics(request.params);
			return;
	}
}

function scheduleDiagnostics(params: unknown): void {
	ctx.clearTimeout(diagnosticsTimer);
	const version = ++diagnosticsVersion;
	diagnosticsTimer = ctx.setTimeout(() => {
		void runDiagnostics(params, version);
	}, 300);
}

async function runDiagnostics(params: unknown, version: number): Promise<void> {
	const uri = textDocumentUri(params);
	if (!uri) return;

	try {
		await ensureWasmReady();
		const getDiagnostics = wasmGlobal.getDiagnostics;
		if (!getDiagnostics) throw new Error("Ballerina diagnostics are not ready");

		const targetPath = await getBallerinaProjectTarget(fsProxy, uri);
		const diagnostics = await getDiagnostics(fsProxy, targetPath);
		if (version !== diagnosticsVersion) return;

		notify("textDocument/publishDiagnostics", {
			uri,
			diagnostics: diagnostics ?? [],
		});
	} catch {
		if (version !== diagnosticsVersion) return;
		notify("textDocument/publishDiagnostics", {
			uri,
			diagnostics: [],
		});
	}
}

async function ensureWasmReady(): Promise<void> {
	if (wasmReady) return wasmReady;

	wasmReady = (async () => {
		const go = new wasmGlobal.Go();
		const wasmUrl = new URL(
			"ballerina.wasm",
			new URL(import.meta.env.BASE_URL, globalThis.location.origin),
		).toString();
		const result = await WebAssembly.instantiateStreaming(
			fetch(wasmUrl),
			go.importObject,
		);
		void go.run(result.instance);
	})();

	return wasmReady;
}

function callFs<T>(op: keyof FS, ...args: unknown[]): Promise<T> {
	const id = ++fsRequestId;
	const message: WorkerToMainMessage = { type: "fs-request", id, op, args };
	ctx.postMessage(message);

	return new Promise<T>((resolve, reject) => {
		pendingFsRequests.set(id, {
			resolve: (value) => resolve(value as T),
			reject,
		});
	});
}

function textDocumentUri(params: unknown): string | null {
	if (!params || typeof params !== "object") return null;
	const textDocument = (params as { textDocument?: unknown }).textDocument;
	if (!textDocument || typeof textDocument !== "object") return null;
	const uri = (textDocument as { uri?: unknown }).uri;
	return typeof uri === "string" ? uri : null;
}

function respond(id: number | string, result: unknown): void {
	publish({ jsonrpc: "2.0", id, result });
}

function notify(method: string, params: unknown): void {
	publish({ jsonrpc: "2.0", method, params });
}

function publish(message: unknown): void {
	const outgoing: WorkerToMainMessage = {
		type: "lsp",
		message: JSON.stringify(message),
	};
	ctx.postMessage(outgoing);
}
