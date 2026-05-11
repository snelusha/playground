import type { ProjectSnapshot } from "@/lib/fs/project-snapshot";

import type {
	BallerinaWorkerRequest,
	BallerinaWorkerResponse,
	ConsoleLevel,
	RunOutcome,
	WasmDiagnostic,
} from "@/lib/ballerina/protocol";

export type BallerinaWorkerState = {
	ready: boolean;
	progress: number;
	bootError: string | null;
};

type Pending = {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
};

let singleton: BallerinaWorkerClient | null = null;

export function getBallerinaWorkerClient(): BallerinaWorkerClient {
	if (!singleton) singleton = new BallerinaWorkerClient();
	return singleton;
}

export class BallerinaWorkerClient {
	private readonly worker: Worker;
	private nextRequestId = 1;
	private readonly pending = new Map<number, Pending>();
	private runLogHandler: ((line: string, level: ConsoleLevel) => void) | null =
		null;

	private state: BallerinaWorkerState = {
		ready: false,
		progress: 0,
		bootError: null,
	};

	private readonly listeners = new Set<() => void>();

	constructor() {
		this.worker = new Worker(
			new URL("../../workers/ballerina.worker.ts", import.meta.url),
			{ type: "module" },
		);
		this.worker.onmessage = (e: MessageEvent<BallerinaWorkerResponse>) => {
			this.onWorkerMessage(e.data);
		};
		this.worker.onerror = (e) => {
			this.patchState({
				bootError: e.message || "Worker error",
				ready: false,
			});
		};
	}

	subscribe = (onStoreChange: () => void): (() => void) => {
		this.listeners.add(onStoreChange);
		return () => {
			this.listeners.delete(onStoreChange);
		};
	};

	getState = (): BallerinaWorkerState => this.state;

	private emit() {
		for (const listener of this.listeners) listener();
	}

	private patchState(patch: Partial<BallerinaWorkerState>) {
		this.state = { ...this.state, ...patch };
		this.emit();
	}

	private onWorkerMessage(msg: BallerinaWorkerResponse) {
		switch (msg.type) {
			case "loadProgress":
				this.patchState({ progress: msg.pct });
				break;
			case "ready":
				this.patchState({ ready: true, progress: 100, bootError: null });
				break;
			case "bootError":
				this.patchState({ ready: false, bootError: msg.error });
				break;
			case "log":
				this.runLogHandler?.(msg.line, msg.level);
				break;
			case "getDiagnosticsResult":
				if (msg.ok) {
					this.finishPending(msg.requestId, true, msg.diagnostics);
				} else {
					this.finishPending(msg.requestId, false, msg.error);
				}
				break;
			case "runResult":
				if (msg.ok) {
					this.finishPending(msg.requestId, true, msg.result);
				} else {
					this.finishPending(msg.requestId, false, msg.error);
				}
				break;
		}
	}

	private finishPending(requestId: number, ok: boolean, payload: unknown) {
		const entry = this.pending.get(requestId);
		if (!entry) return;
		this.pending.delete(requestId);
		if (ok) entry.resolve(payload);
		else entry.reject(new Error(String(payload)));
	}

	private assertReady() {
		if (!this.state.ready) {
			throw new Error("Ballerina runtime is not ready");
		}
	}

	private postRequest(body: Omit<BallerinaWorkerRequest, "requestId">): number {
		const requestId = this.nextRequestId++;
		this.worker.postMessage({ ...body, requestId } as BallerinaWorkerRequest);
		return requestId;
	}

	async getDiagnostics(
		snapshot: ProjectSnapshot,
		targetPath: string,
	): Promise<WasmDiagnostic[] | null> {
		this.assertReady();
		const requestId = this.postRequest({
			type: "getDiagnostics",
			snapshot,
			targetPath,
		});
		return new Promise<WasmDiagnostic[] | null>((resolve, reject) => {
			this.pending.set(requestId, {
				resolve: (v) => resolve(v as WasmDiagnostic[] | null),
				reject,
			});
		});
	}

	async run(
		snapshot: ProjectSnapshot,
		targetPath: string,
		options?: { onLog?: (line: string, level: ConsoleLevel) => void },
	): Promise<RunOutcome> {
		if (!this.state.ready) {
			return { error: "Ballerina runtime is not ready" };
		}
		const requestId = this.postRequest({
			type: "run",
			snapshot,
			targetPath,
		});
		this.runLogHandler = options?.onLog ?? null;
		try {
			return await new Promise<RunOutcome>((resolve, reject) => {
				this.pending.set(requestId, {
					resolve: (v) => resolve(v as RunOutcome),
					reject,
				});
			});
		} finally {
			this.runLogHandler = null;
		}
	}
}
