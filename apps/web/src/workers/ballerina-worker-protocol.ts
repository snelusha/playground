import type { SerializedSnapshot } from "@/lib/fs/snapshot";

/** Non-null when the program produced output (even if it also errored). */
export type WorkerRunResult = {
	readonly output: string;
	readonly error?: string;
};

export type WorkerDiagnostic = Record<string, unknown>;

/**
 * Contract implemented in the worker (`Comlink.expose`) and invoked from the
 * main thread via `Comlink.wrap`.
 */
export interface BallerinaWorkerApi {
	init(wasmUrl: string, onProgress?: (value: number) => void): Promise<void>;
	run(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerRunResult | null>;
	diagnostics(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerDiagnostic[] | null>;
}
