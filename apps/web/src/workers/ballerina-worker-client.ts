import * as Comlink from "comlink";

import type { SnapshotFS } from "@/lib/fs/snapshot";
import type {
	BallerinaWorkerApi,
	WasmInitProgressCallback,
	WorkerDiagnostic,
	WorkerRunResult,
} from "@/workers/ballerina-worker-contract";
import { ComlinkProgressProxy } from "@/workers/comlink-progress-proxy";
import { createDefaultBallerinaWorker } from "@/workers/create-ballerina-worker";

export type { WasmInitProgressCallback } from "@/workers/ballerina-worker-contract";

export type BallerinaWorkerClientOptions = {
	/** Inject a worker (e.g. in tests). Defaults to the bundled Ballerina worker. */
	createWorker?: () => Worker;
};

/**
 * Main-thread client for the Ballerina WASM worker (Comlink over a dedicated worker).
 *
 * `run` / `diagnostics` accept {@link SnapshotFS}; the client serializes it for
 * the worker (only structured-cloneable payloads cross the thread boundary).
 */
export class BallerinaWorkerClient {
	private readonly worker: Worker;
	private readonly remote: Comlink.Remote<BallerinaWorkerApi>;
	private terminated = false;
	private progressProxy: ComlinkProgressProxy | null = null;

	constructor(options: BallerinaWorkerClientOptions = {}) {
		this.worker = options.createWorker
			? options.createWorker()
			: createDefaultBallerinaWorker();

		this.remote = Comlink.wrap<BallerinaWorkerApi>(this.worker);

		this.worker.onerror = () => {
			this.dispose();
		};
	}

	async init(
		wasmUrl: string,
		onProgress?: WasmInitProgressCallback,
	): Promise<void> {
		this.assertNotTerminated();

		if (onProgress) {
			this.progressProxy = new ComlinkProgressProxy(onProgress);
			try {
				await this.remote.init(wasmUrl, this.progressProxy.asRemoteCallback());
			} finally {
				this.progressProxy.scheduleDeferredRelease();
			}
			return;
		}

		await this.remote.init(wasmUrl);
	}

	async run(
		path: string,
		snapshot: SnapshotFS,
	): Promise<WorkerRunResult | null> {
		this.assertNotTerminated();
		return this.remote.run(path, snapshot.serialize());
	}

	async diagnostics(
		path: string,
		snapshot: SnapshotFS,
	): Promise<WorkerDiagnostic[] | null> {
		this.assertNotTerminated();
		return this.remote.diagnostics(path, snapshot.serialize());
	}

	/**
	 * Terminates the worker. In-flight Comlink calls may reject when the port closes.
	 * Idempotent.
	 */
	terminate(): void {
		this.dispose();
	}

	private dispose(): void {
		if (this.terminated) return;
		this.terminated = true;
		if (this.progressProxy) {
			this.progressProxy.dispose();
			this.progressProxy = null;
		}
		try {
			this.remote[Comlink.releaseProxy]();
		} catch {
			// Worker may already be torn down.
		}
		this.worker.terminate();
	}

	private assertNotTerminated(): void {
		if (this.terminated) {
			throw new Error("Cannot use a terminated BallerinaWorkerClient");
		}
	}
}
