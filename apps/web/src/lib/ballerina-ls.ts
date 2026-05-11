import { useFileTreeStore } from "@/stores/file-tree-store";

import type { FS } from "@/lib/fs/core/fs.interface";
import type { Transport } from "@codemirror/lsp-client";

type WorkerToMainMessage =
	| { type: "lsp"; message: string }
	| { type: "fs-request"; id: number; op: keyof FS; args: unknown[] };

type MainToWorkerMessage =
	| { type: "lsp"; message: string }
	| { type: "fs-result"; id: number; result: unknown }
	| { type: "fs-error"; id: number; error: string };

const SYNCED_METHODS = new Set([
	"textDocument/didOpen",
	"textDocument/didChange",
]);

export class BallerinaLS implements Transport {
	private handlers: ((value: string) => void)[] = [];
	private worker = new Worker(
		new URL("./ballerina-ls.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);

	constructor() {
		this.worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
			const data = event.data;
			if (data.type === "lsp") {
				this._publish(data.message);
				return;
			}
			void this._handleFsRequest(data);
		};
	}

	send(message: string): void {
		void this._send(message);
	}

	private async _send(message: string): Promise<void> {
		try {
			const request = JSON.parse(message) as { method?: string };
			if (request.method && SYNCED_METHODS.has(request.method)) {
				await useFileTreeStore.getState().saveFile();
			}
		} catch {
			// Let the worker/LS deal with malformed JSON-RPC messages.
		}

		this._post({ type: "lsp", message });
	}

	private async _handleFsRequest(
		request: Extract<WorkerToMainMessage, { type: "fs-request" }>,
	): Promise<void> {
		try {
			if (!useFileTreeStore.getState().ready) {
				throw new Error("Virtual file system is not ready");
			}

			const fs = useFileTreeStore.getState().fs();
			const fn = fs[request.op];
			if (typeof fn !== "function") {
				throw new Error(`Unsupported FS operation: ${String(request.op)}`);
			}

			const result = await (
				fn as (...args: unknown[]) => Promise<unknown>
			).apply(fs, request.args);
			this._post({ type: "fs-result", id: request.id, result });
		} catch (error) {
			this._post({
				type: "fs-error",
				id: request.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private _post(message: MainToWorkerMessage): void {
		this.worker.postMessage(message);
	}

	private _publish(message: string): void {
		this.handlers.forEach((handler) => {
			handler(message);
		});
	}

	subscribe(handler: (value: string) => void): void {
		this.handlers.push(handler);
	}

	unsubscribe(handler: (value: string) => void): void {
		this.handlers = this.handlers.filter((h) => h !== handler);
	}
}
