import type { SerializedSnapshot } from "@/lib/fs/snapshot";

/** 0–100 while the WASM module is downloading (when `Content-Length` is known). */
export type WasmInitProgressCallback = (percent: number) => void;

/** Non-null when the program produced output (even if it also errored). */
export type WorkerRunResult = {
	readonly output: string;
	readonly error?: string;
};

export type WorkerDiagnostic = Record<string, unknown>;

/**
 * RPC surface exposed from the dedicated worker (`Comlink.expose`) and
 * consumed on the main thread (`Comlink.wrap`).
 */
export interface BallerinaWorkerApi {
	init(wasmUrl: string, onProgress?: WasmInitProgressCallback): Promise<void>;
	run(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerRunResult | null>;
	diagnostics(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerDiagnostic[] | null>;
}

export const BallerinaWorkerErrors = {
	notInitialized: "WASM worker is not initialized",
	runUnavailable: "WASM run function is unavailable",
	diagnosticsUnavailable: "WASM diagnostics function is unavailable",
	initFailed: "Failed to initialize WASM in worker",
	runFailed: "Failed to run Ballerina program",
	diagnosticsFailed: "Failed to get diagnostics",
} as const;
