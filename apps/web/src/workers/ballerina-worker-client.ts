import type {
	FsSnapshot,
	WorkerRequest,
	WorkerResponse,
	WorkerResultMap,
} from "@/workers/ballerina-worker-protocol";

type WorkerMethod = keyof WorkerResultMap;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

function resolveWasmUrl(): string {
	return new URL(
		"ballerina.wasm",
		new URL(import.meta.env.BASE_URL, window.location.origin),
	).toString();
}

export class BallerinaWorkerClient {
	private worker: Worker | null = null;
	private ready = false;
	private nextRequestId = 1;
	private pending = new Map<number, PendingRequest>();
	private initPromise: Promise<void> | null = null;
	private progressListeners = new Set<(percent: number) => void>();

	isReady(): boolean {
		return this.ready;
	}

	onProgress(listener: (percent: number) => void): () => void {
		this.progressListeners.add(listener);
		return () => {
			this.progressListeners.delete(listener);
		};
	}

	async init(wasmUrl: string = resolveWasmUrl()): Promise<void> {
		if (this.ready) return;
		if (this.initPromise) return this.initPromise;
		this.worker = new Worker(
			new URL("./ballerina.worker.ts", import.meta.url),
			{
				type: "module",
			},
		);
		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			this.handleResponse(event.data);
		};
		this.initPromise = this.request("init", { wasmUrl }).then(() => {
			this.ready = true;
		});
		return this.initPromise;
	}

	async run(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<WorkerResultMap["run"]> {
		await this.init();
		return this.request("run", input);
	}

	async getDiagnostics(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<WorkerResultMap["getDiagnostics"]> {
		await this.init();
		return this.request("getDiagnostics", input);
	}

	private async request<T extends WorkerMethod>(
		type: T,
		payload: Extract<WorkerRequest, { type: T }>["payload"],
	): Promise<WorkerResultMap[T]> {
		if (!this.worker) throw new Error("Ballerina worker is not initialized");
		const requestId = this.nextRequestId++;
		const message: WorkerRequest = {
			requestId,
			type,
			payload,
		} as WorkerRequest;

		return new Promise<WorkerResultMap[T]>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			this.worker?.postMessage(message);
		});
	}

	private handleResponse(response: WorkerResponse): void {
		if (response.type === "progress") {
			for (const listener of this.progressListeners) {
				listener(response.payload.percent);
			}
			return;
		}

		const pending = this.pending.get(response.requestId);
		if (!pending) return;

		this.pending.delete(response.requestId);

		if (response.type === "error") {
			const err = new Error(response.payload.message);
			err.stack = response.payload.stack;
			pending.reject(err);
			return;
		}

		pending.resolve(response.payload);
	}
}

export const ballerinaWorkerClient = new BallerinaWorkerClient();
