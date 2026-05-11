import * as Comlink from "comlink";

import type {
	BallerinaWorkerApi,
	BallerinaWorkerResults,
	FsSnapshot,
} from "@/workers/ballerina-worker-protocol";

function resolveWasmUrl(): string {
	return new URL(
		"ballerina.wasm",
		new URL(import.meta.env.BASE_URL, window.location.origin),
	).toString();
}

export class BallerinaWorkerClient {
	private worker: Worker | null = null;
	private api: Comlink.Remote<BallerinaWorkerApi> | null = null;

	private initPromise: Promise<void> | null = null;

	private readonly progressListeners = new Set<(percent: number) => void>();

	onProgress(listener: (percent: number) => void): () => void {
		this.progressListeners.add(listener);
		return () => this.progressListeners.delete(listener);
	}

	async init(wasmUrl: string = resolveWasmUrl()): Promise<void> {
		return this.ensureReady(wasmUrl);
	}

	async run(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["run"]> {
		return (await this.getApi()).run(input);
	}

	async getDiagnostics(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["getDiagnostics"]> {
		return (await this.getApi()).getDiagnostics(input);
	}

	dispose(): void {
		this.worker?.terminate();
		this.worker = null;
		this.api = null;
		this.initPromise = null;
		this.progressListeners.clear();
	}

	private ensureReady(wasmUrl: string = resolveWasmUrl()): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.worker = new Worker(
			new URL("./ballerina.worker.ts", import.meta.url),
			{ type: "module" },
		);
		this.api = Comlink.wrap<BallerinaWorkerApi>(this.worker);

		this.initPromise = this.api
			.init(
				wasmUrl,
				Comlink.proxy((percent: number) => {
					for (const listener of this.progressListeners) {
						listener(percent);
					}
				}),
			)
			.catch((err) => {
				this.worker?.terminate();
				this.worker = null;
				this.api = null;
				this.initPromise = null;
				throw err;
			});

		return this.initPromise;
	}

	private async getApi(): Promise<Comlink.Remote<BallerinaWorkerApi>> {
		await this.ensureReady();
		if (!this.api) {
			throw new Error("Ballerina worker failed to initialize");
		}
		return this.api;
	}
}

let _client: BallerinaWorkerClient | null = null;

export function getBallerinaWorkerClient(): BallerinaWorkerClient {
	_client ??= new BallerinaWorkerClient();
	return _client;
}
