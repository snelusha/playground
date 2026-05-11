/**
 * Code loaded only inside `ballerina.worker.ts`: WASM boot, Go `globalThis` typing, RPC dispatch.
 * Kept separate from `worker-client.ts` so Vite does not bundle the main-thread client into the worker.
 */

import {
	createReadOnlySnapshotBridge,
	type ReadOnlySnapshotBridge,
} from "@/lib/fs/snapshot-bridge-proxy";

import type {
	BallerinaWorkerRequest,
	BallerinaWorkerResponse,
	RunOutcome,
	WasmDiagnostic,
} from "./protocol";

type BallerinaGoGlobal = typeof globalThis & {
	Go: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
	getDiagnostics: (
		proxy: ReadOnlySnapshotBridge,
		path: string,
	) => Promise<WasmDiagnostic[] | null>;
	run: (proxy: ReadOnlySnapshotBridge, path: string) => Promise<RunOutcome>;
};

type PostToMain = (message: BallerinaWorkerResponse) => void;

const WASM_FILE = "ballerina.wasm";
const POLL_MS = 10;
const POLL_ATTEMPTS = 500;

let bootPromise: Promise<void> | null = null;

async function fetchWithDownloadProgress(
	url: string,
	onProgress: (percent: number) => void,
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

function wasmUrl(workerOrigin: string): string {
	return new URL(
		WASM_FILE,
		new URL(import.meta.env.BASE_URL, workerOrigin),
	).toString();
}

function go(): BallerinaGoGlobal {
	return globalThis as BallerinaGoGlobal;
}

async function waitForGoJsExports(g: BallerinaGoGlobal): Promise<void> {
	for (let i = 0; i < POLL_ATTEMPTS; i++) {
		if (typeof g.getDiagnostics === "function" && typeof g.run === "function") {
			return;
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	throw new Error("Ballerina WASM did not expose run/getDiagnostics in time");
}

async function bootOnce(post: PostToMain, workerOrigin: string): Promise<void> {
	try {
		const g = go();
		const runtime = new g.Go();
		const result = await WebAssembly.instantiateStreaming(
			fetchWithDownloadProgress(wasmUrl(workerOrigin), (pct) =>
				post({ type: "loadProgress", pct }),
			),
			runtime.importObject,
		);
		void runtime.run(result.instance);
		await waitForGoJsExports(g);
		post({ type: "ready" });
	} catch (e) {
		post({ type: "bootError", error: String(e) });
		throw e;
	}
}

/** Single-flight WASM boot; posts `loadProgress`, then `ready` or `bootError`. */
export function ensureBallerinaWasmBoot(
	post: PostToMain,
	workerOrigin: string,
): Promise<void> {
	if (!bootPromise) {
		bootPromise = bootOnce(post, workerOrigin).catch((err) => {
			bootPromise = null;
			throw err;
		});
	}
	return bootPromise;
}

function formatConsoleLine(args: unknown[]): string {
	return args
		.map((a) => {
			if (typeof a === "string") return a;
			try {
				return JSON.stringify(a);
			} catch {
				return String(a);
			}
		})
		.join(" ");
}

function postBootstrapFailure(
	msg: BallerinaWorkerRequest,
	error: unknown,
	post: PostToMain,
) {
	const err = String(error);
	if (msg.type === "getDiagnostics") {
		post({
			type: "getDiagnosticsResult",
			requestId: msg.requestId,
			ok: false,
			error: err,
		});
		return;
	}
	post({
		type: "runResult",
		requestId: msg.requestId,
		ok: false,
		error: err,
	});
}

async function dispatchRequest(msg: BallerinaWorkerRequest, post: PostToMain) {
	const g = go();

	if (msg.type === "getDiagnostics") {
		try {
			const proxy = createReadOnlySnapshotBridge(msg.snapshot);
			const diagnostics = await g.getDiagnostics(proxy, msg.targetPath);
			post({
				type: "getDiagnosticsResult",
				requestId: msg.requestId,
				ok: true,
				diagnostics: diagnostics ?? null,
			});
		} catch (e) {
			post({
				type: "getDiagnosticsResult",
				requestId: msg.requestId,
				ok: false,
				error: String(e),
			});
		}
		return;
	}

	const prevLog = console.log;
	const prevErr = console.error;
	const forward =
		(level: "log" | "error") =>
		(...args: unknown[]) => {
			post({ type: "log", line: formatConsoleLine(args), level });
			if (level === "log") prevLog(...args);
			else prevErr(...args);
		};

	console.log = forward("log");
	console.error = forward("error");

	try {
		const proxy = createReadOnlySnapshotBridge(msg.snapshot);
		const result = await g.run(proxy, msg.targetPath);
		post({
			type: "runResult",
			requestId: msg.requestId,
			ok: true,
			result: result ?? null,
		});
	} catch (e) {
		post({
			type: "runResult",
			requestId: msg.requestId,
			ok: false,
			error: String(e),
		});
	} finally {
		console.log = prevLog;
		console.error = prevErr;
	}
}

export async function handleWorkerMessageEvent(
	ev: MessageEvent<BallerinaWorkerRequest>,
	post: PostToMain,
	ensureBoot: () => Promise<void>,
): Promise<void> {
	const msg = ev.data;
	try {
		await ensureBoot();
	} catch (e) {
		postBootstrapFailure(msg, e, post);
		return;
	}
	await dispatchRequest(msg, post);
}
