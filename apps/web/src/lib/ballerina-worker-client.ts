import type { SerializedFSNode } from "@/lib/fs/snapshot-fs";
import type {
	BallerinaDiagnostic,
	BallerinaRunResult,
	BallerinaWorkerRequest,
	BallerinaWorkerResponse,
} from "@/lib/ballerina-worker-protocol";

type PendingRequest =
	| {
			type: "load";
			resolve: () => void;
			reject: (error: Error) => void;
			onProgress?: (progress: number) => void;
	  }
	| {
			type: "diagnostics";
			resolve: (diagnostics: BallerinaDiagnostic[]) => void;
			reject: (error: Error) => void;
	  }
	| {
			type: "run";
			resolve: (result: BallerinaRunResult) => void;
			reject: (error: Error) => void;
	  };

class BallerinaWorkerClient {
	private worker: Worker | null = null;
	private nextId = 1;
	private pending = new Map<number, PendingRequest>();

	load(onProgress?: (progress: number) => void): Promise<void> {
		const id = this.nextId++;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { type: "load", resolve, reject, onProgress });
			this.post({ type: "load", id });
		});
	}

	getDiagnostics(
		fs: SerializedFSNode,
		targetPath: string,
	): Promise<BallerinaDiagnostic[]> {
		const id = this.nextId++;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { type: "diagnostics", resolve, reject });
			this.post({
				type: "diagnostics",
				id,
				fs,
				targetPath,
			});
		});
	}

	run(fs: SerializedFSNode, targetPath: string): Promise<BallerinaRunResult> {
		const id = this.nextId++;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { type: "run", resolve, reject });
			this.post({
				type: "run",
				id,
				fs,
				targetPath,
			});
		});
	}

	private post(message: BallerinaWorkerRequest): void {
		this.getWorker().postMessage(message);
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;

		this.worker = new Worker(
			new URL("./ballerina.worker.ts", import.meta.url),
			{
				type: "module",
			},
		);
		this.worker.addEventListener("message", this.handleMessage);
		this.worker.addEventListener("error", this.handleError);

		return this.worker;
	}

	private handleMessage = (event: MessageEvent<BallerinaWorkerResponse>) => {
		const message = event.data;
		const pending = this.pending.get(message.id);
		if (!pending) return;

		if (message.type === "progress") {
			if (pending.type === "load") pending.onProgress?.(message.progress);
			return;
		}

		this.pending.delete(message.id);

		if (message.type === "error") {
			pending.reject(new Error(message.error));
			return;
		}

		if (message.type === "load" && pending.type === "load") {
			pending.resolve();
			return;
		}

		if (message.type === "diagnostics" && pending.type === "diagnostics") {
			pending.resolve(message.diagnostics);
			return;
		}

		if (message.type === "run" && pending.type === "run") {
			pending.resolve(message.result);
		}
	};

	private handleError = (event: ErrorEvent) => {
		const error = new Error(event.message || "Ballerina worker failed");
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		this.worker?.terminate();
		this.worker = null;
	};
}

export const ballerinaWorker = new BallerinaWorkerClient();
