import { buildScopedFsSnapshot } from "@/lib/fs/snapshot";
import { useFileTreeStore } from "@/stores/file-tree-store";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";
import { ballerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { Transport } from "@codemirror/lsp-client";

function lspUriToFsPath(uri: string): string {
	if (uri.startsWith("file://")) {
		const rest = uri.slice("file://".length);
		const path = rest.startsWith("/") ? rest : `/${rest}`;
		try {
			return decodeURIComponent(path);
		} catch {
			return path;
		}
	}
	return uri;
}

export class BallerinaLS implements Transport {
	private handlers: ((value: string) => void)[] = [];
	private diagnosticsVersion = 0;

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
				const requestVersion = ++this.diagnosticsVersion;

				try {
					await useFileTreeStore.getState().saveFile();
					const fs = useFileTreeStore.getState().fs();
					const filePath = lspUriToFsPath(uri);
					const targetPath = await getBallerinaProjectTarget(fs, filePath);
					const snapshot = await buildScopedFsSnapshot(fs, targetPath);
					const diagnostics = await ballerinaWorkerClient.getDiagnostics({
						targetPath,
						snapshot,
					});
					if (requestVersion !== this.diagnosticsVersion) return null;
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
					if (requestVersion !== this.diagnosticsVersion) return null;
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
}
