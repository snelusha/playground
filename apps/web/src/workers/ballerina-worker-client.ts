import type {
	DiagnosticsRequest,
	DiagnosticsResponse,
	InitRequest,
	InitResponse,
	RunRequest,
	RunResponse,
	WorkerDiagnostic,
	WorkerRunResult,
	WorkerRequest,
	WorkerResponse,
} from "@/workers/ballerina-worker-protocol";

import type { SerializedSnapshot } from "@/lib/fs/snapshot";

type PendingInit = {
	readonly type: "init";
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
};

type PendingRun = {
	readonly type: "run";
	readonly resolve: (result: WorkerRunResult | null) => void;
	readonly reject: (error: Error) => void;
};

type PendingDiagnostics = {
	readonly type: "diagnostics";
	readonly resolve: (diagnostics: WorkerDiagnostic[] | null) => void;
	readonly reject: (error: Error) => void;
};

type PendingRequest = PendingInit | PendingRun | PendingDiagnostics;

export type WorkerClientOptions = {
	/** Called with 0-100 during WASM download. Scoped to the active init id. */
	onProgress?: (id: number, value: number) => void;
	/** Factory so tests can inject a fake Worker. Defaults to the real worker bundle. */
	workerFactory?: () => Worker;
};

/**
 * Typed, promise-based wrapper around the Ballerina web worker.
 *
 * Lifecycle:
 *   1. Construct → wire up message / error handlers.
 *   2. `await client.init(wasmUrl)` → load + compile WASM inside the worker.
 *   3. `await client.run(path, snapshot)` → execute a program.
 *   4. `client.terminate()` → hard-kill the worker (rejects all pending calls).
 */
export class BallerinaWorkerClient {
	private readonly worker: Worker;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly onProgress: WorkerClientOptions["onProgress"];
	private nextId = 1;
	private terminated = false;

	constructor(options: WorkerClientOptions = {}) {
		this.onProgress = options.onProgress;
		this.worker = options.workerFactory
			? options.workerFactory()
			: new Worker(new URL("./ballerina.worker.ts", import.meta.url), {
					type: "module",
				});

		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			this.handleMessage(event.data);
		};

		this.worker.onerror = (event) => {
			this.rejectAll(new Error(event.message || "Worker encountered an error"));
		};
	}

	async init(wasmUrl: string): Promise<void> {
		this.assertAlive();

		const req: InitRequest = {
			id: this.nextRequestId(),
			type: "init",
			wasmUrl,
		};

		return new Promise<void>((resolve, reject) => {
			this.pending.set(req.id, { type: "init", resolve, reject });
			this.post(req);
		});
	}

	async run(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerRunResult | null> {
		this.assertAlive();

		const req: RunRequest = {
			id: this.nextRequestId(),
			type: "run",
			path,
			snapshot,
		};

		return new Promise<WorkerRunResult | null>((resolve, reject) => {
			this.pending.set(req.id, { type: "run", resolve, reject });
			this.post(req);
		});
	}

	async diagnostics(
		path: string,
		snapshot: SerializedSnapshot,
	): Promise<WorkerDiagnostic[] | null> {
		this.assertAlive();

		const req: DiagnosticsRequest = {
			id: this.nextRequestId(),
			type: "diagnostics",
			path,
			snapshot,
		};

		return new Promise<WorkerDiagnostic[] | null>((resolve, reject) => {
			this.pending.set(req.id, { type: "diagnostics", resolve, reject });
			this.post(req);
		});
	}

	/**
	 * Hard-terminates the worker. All pending promises are rejected.
	 * Safe to call multiple times.
	 */
	terminate(): void {
		if (this.terminated) return;
		this.terminated = true;
		this.worker.terminate();
		this.rejectAll(new Error("Worker was terminated"));
	}

	private handleMessage(message: WorkerResponse): void {
		if (message.type === "progress") {
			this.onProgress?.(message.id, message.value);
			return;
		}

		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);

		switch (message.type) {
			case "init-result":
				this.settleInit(pending, message);
				break;
			case "run-result":
				this.settleRun(pending, message);
				break;
			case "diagnostics-result":
				this.settleDiagnostics(pending, message);
				break;
		}
	}

	private settleInit(pending: PendingRequest, response: InitResponse): void {
		if (pending.type !== "init") return;

		if (!response.ok) {
			pending.reject(new Error(response.error));
			return;
		}
		pending.resolve();
	}

	private settleRun(pending: PendingRequest, response: RunResponse): void {
		if (pending.type !== "run") return;

		if (!response.ok) {
			pending.reject(new Error(response.error));
			return;
		}
		pending.resolve(response.result);
	}

	private settleDiagnostics(
		pending: PendingRequest,
		response: DiagnosticsResponse,
	): void {
		if (pending.type !== "diagnostics") return;

		if (!response.ok) {
			pending.reject(new Error(response.error));
			return;
		}
		pending.resolve(response.diagnostics);
	}

	private post(message: WorkerRequest): void {
		this.worker.postMessage(message);
	}

	private nextRequestId(): number {
		return this.nextId++;
	}

	private assertAlive(): void {
		if (this.terminated) {
			throw new Error("Cannot use a terminated BallerinaWorkerClient");
		}
	}

	private rejectAll(error: Error): void {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
	}
}
