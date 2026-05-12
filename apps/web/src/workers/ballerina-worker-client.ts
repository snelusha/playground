import * as Comlink from "comlink";
import type { ProxyMethods } from "comlink";

import type { SerializedSnapshot } from "@/lib/fs/snapshot";
import type {
	BallerinaWorkerApi,
	WorkerDiagnostic,
	WorkerRunResult,
} from "@/workers/ballerina-worker-protocol";

export type WorkerClientOptions = {
	/** Called with 0-100 during WASM download. Scoped to the active init id. */
	onProgress?: (id: number, value: number) => void;
	/** Factory so tests can inject a fake Worker. Defaults to the real worker bundle. */
	workerFactory?: () => Worker;
};

/**
 * Typed wrapper around the Ballerina web worker using Comlink.
 *
 * Lifecycle:
 *   1. Construct → spin up worker and wrap exposed API.
 *   2. `await client.init(wasmUrl)` → load + compile WASM inside the worker.
 *   3. `await client.run(path, snapshot)` → execute a program.
 *   4. `client.terminate()` → hard-kill the worker (rejects in-flight calls).
 */
export class BallerinaWorkerClient {
	private readonly worker: Worker;
	private readonly api: Comlink.Remote<BallerinaWorkerApi>;
	private readonly onProgress: WorkerClientOptions["onProgress"];
	private readonly terminationPromise: Promise<never>;
	private rejectTermination!: (error: Error) => void;
	private terminated = false;

	constructor(options: WorkerClientOptions = {}) {
		this.onProgress = options.onProgress;

		this.terminationPromise = new Promise<never>((_, reject) => {
			this.rejectTermination = reject;
		});

		this.worker = options.workerFactory
			? options.workerFactory()
			: new Worker(new URL("./ballerina.worker.ts", import.meta.url), {
					type: "module",
				});

		this.api = Comlink.wrap<BallerinaWorkerApi>(this.worker);

		this.worker.onerror = (event) => {
			this._failAll(new Error(event.message || "Worker encountered an error"));
		};
	}

	async init(wasmUrl: string): Promise<void> {
		this.assertAlive();

		const progressProxy = this.onProgress
			? Comlink.proxy((value: number) => {
					this.onProgress?.(0, value);
				})
			: undefined;

		try {
			await this.raceTermination(
				progressProxy
					? this.api.init(wasmUrl, progressProxy)
					: this.api.init(wasmUrl),
			);
		} finally {
			if (progressProxy) {
				(progressProxy as unknown as ProxyMethods)[Comlink.releaseProxy]();
			}
		}
	}

	async run(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerRunResult | null> {
		this.assertAlive();
		return this.raceTermination(this.api.run(path, snapshot));
	}

	async diagnostics(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerDiagnostic[] | null> {
		this.assertAlive();
		return this.raceTermination(this.api.diagnostics(path, snapshot));
	}

	/**
	 * Hard-terminates the worker. All in-flight promises are rejected.
	 * Safe to call multiple times.
	 */
	terminate(): void {
		if (this.terminated) return;
		this.terminated = true;
		this.rejectTermination(new Error("Worker was terminated"));
		this.api[Comlink.releaseProxy]();
		this.worker.terminate();
	}

	private raceTermination<T>(p: Promise<T>): Promise<T> {
		return Promise.race([p, this.terminationPromise]);
	}

	private _failAll(error: Error): void {
		if (!this.terminated) {
			this.terminated = true;
			this.rejectTermination(error);
			this.api[Comlink.releaseProxy]();
			this.worker.terminate();
		}
	}

	private assertAlive(): void {
		if (this.terminated) {
			throw new Error("Cannot use a terminated BallerinaWorkerClient");
		}
	}
}
