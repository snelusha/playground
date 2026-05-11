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
	private ready = false;
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
			.then(() => {
				this.ready = true;
			});
		return this.initPromise;
	}

	async run(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["run"]> {
		await this.init();
		if (!this.api) throw new Error("Ballerina worker is not initialized");
		return this.api.run(input);
	}

	async getDiagnostics(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["getDiagnostics"]> {
		await this.init();
		if (!this.api) throw new Error("Ballerina worker is not initialized");
		return this.api.getDiagnostics(input);
	}
}

export const ballerinaWorkerClient = new BallerinaWorkerClient();
