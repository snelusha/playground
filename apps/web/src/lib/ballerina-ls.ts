import { useFileTreeStore } from "@/stores/file-tree-store";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";

import { SnapshotFS } from "@/lib/fs/snapshot";
import { BallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { Transport } from "@codemirror/lsp-client";

export class BallerinaLS implements Transport {
	private handlers: ((value: string) => void)[] = [];
	private workerClient: BallerinaWorkerClient | null = null;
	private initPromise: Promise<void> | null = null;

	send(message: string): void {
		void (async () => {
			const request = JSON.parse(message);
			const result = await this._handleRequest(request.method, request.params);
			if (request.id === undefined || result === null) return;

			const response = {
				jsonrpc: "2.0",
				id: request.id,
				result,
			};
			this._publish(JSON.stringify(response));
		})();
	}

	// biome-ignore lint/suspicious/noExplicitAny: this is a generic handler for all requests, so we can't type params
	private async _handleRequest(method: string, params: any): Promise<any> {
		switch (method) {
			case "initialize":
				return {
					capabilities: {
						textDocumentSync: 1,
					},
				};
			case "textDocument/didOpen":
			case "textDocument/didChange": {
				if (!useFileTreeStore.getState().ready) return null;
				const uri: string = params.textDocument?.uri;
				if (!uri) return null;

				try {
					await this._ensureWorkerReady();
					await useFileTreeStore.getState().saveFile();
					const fs = useFileTreeStore.getState().fs();
					const targetPath = await getBallerinaProjectTarget(fs, uri);
					const snapshot = await SnapshotFS.from(fs, targetPath);
					const diagnostics = await this.workerClient?.diagnostics(
						targetPath,
						snapshot.serialize(),
					);

					this._publish(
						JSON.stringify({
							jsonrpc: "2.0",
							method: "textDocument/publishDiagnostics",
							params: {
								uri,
								diagnostics: diagnostics ?? [],
							},
						}),
					);
				} catch {
					this._publish(
						JSON.stringify({
							jsonrpc: "2.0",
							method: "textDocument/publishDiagnostics",
							params: {
								uri,
								diagnostics: [],
							},
						}),
					);
				}
				return null;
			}
		}
	}

	private _publish(d: string): void {
		this.handlers.forEach((h) => {
			h(d);
		});
	}

	subscribe(handler: (value: string) => void): void {
		this.handlers.push(handler);
	}

	unsubscribe(handler: (value: string) => void): void {
		this.handlers = this.handlers.filter((h) => h !== handler);
	}

	private async _ensureWorkerReady(): Promise<void> {
		if (!this.workerClient) {
			this.workerClient = new BallerinaWorkerClient();
		}
		if (!this.initPromise) {
			const wasmUrl = new URL(
				"ballerina.wasm",
				new URL(import.meta.env.BASE_URL, window.location.origin),
			).toString();
			this.initPromise = this.workerClient.init(wasmUrl);
		}

		await this.initPromise;
	}
}
