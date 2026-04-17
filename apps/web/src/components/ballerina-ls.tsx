import { useFileTreeStore } from "@/stores/file-tree-store";
import { languageServerExtensions, LSPClient } from "@codemirror/lsp-client";

import type { Transport } from "@codemirror/lsp-client";

type TextDocumentParams = {
	textDocument: { uri: string };
};

export const ballerinaLS = {
	name: "Ballerina Language Server",
	onNotification: (_n: unknown) => {},
	handleRequest: (method: string, params: unknown): unknown => {
		switch (method) {
			case "initialize":
				return { capabilities: { textDocumentSync: 1 } };

			case "textDocument/didChange":
			case "textDocument/didOpen": {
				console.log("Received notification:", method, params);
				if (!useFileTreeStore.getState().ready) {
					return null;
				}
				const { textDocument } = params as TextDocumentParams;
				if (!textDocument?.uri) {
					return null;
				}
				useFileTreeStore.getState().saveFile();
				const result = window.getDiagnostics(
					useFileTreeStore.getState().fs(),
					textDocument.uri,
				);
				console.log("Diagnostics result:", result);
				if (result && Array.isArray(result)) {
					const diagnostics = result.map((d: Record<string, unknown>) => {
						const range = d.range as
							| {
									start: { line: number; column: number };
									end: { line: number; column: number };
							  }
							| undefined;
						const start = range?.start ?? { line: 0, column: 0 };
						const end = range?.end ?? start;
						return {
							range: {
								start: { line: start.line, character: start.column },
								end: { line: end.line, character: end.column },
							},
							severity: (d.severity as number | undefined) ?? 1,
							message: String(d.message ?? ""),
						};
					});
					ballerinaLS.onNotification({
						jsonrpc: "2.0",
						method: "textDocument/publishDiagnostics",
						params: {
							uri: textDocument.uri,
							diagnostics,
						},
					});
				}

				// console.log(
				// 	useFileTreeStore.getState().fs().stat(params.textDocument.uri),
				// );
				// const diagnostics = [
				// 	{
				// 		range: {
				// 			start: { line: 2, character: 0 },
				// 			end: { line: 2, character: 6 },
				// 		},
				// 		severity: 2,
				// 		message: "Custom Ballerina Error Example",
				// 	},
				// ];
				//
				// ballerinaLS.onNotification({
				// 	jsonrpc: "2.0",
				// 	method: "textDocument/publishDiagnostics",
				// 	params: {
				// 		uri: params.textDocument.uri,
				// 		diagnostics: diagnostics,
				// 	},
				// });
				return null;
			}

			default:
				return null;
		}
	},
};

export class BallerinaTransport implements Transport {
	private handlers: ((value: string) => void)[] = [];

	constructor() {
		ballerinaLS.onNotification = (notification) => {
			const message = JSON.stringify(notification);
			for (const h of this.handlers) {
				h(message);
			}
		};
	}

	send(message: string): void {
		const req = JSON.parse(message);
		const result = ballerinaLS.handleRequest(req.method, req.params);
		if (req.id !== undefined) {
			const response = { jsonrpc: "2.0", id: req.id, result };
			for (const h of this.handlers) {
				h(JSON.stringify(response));
			}
		}
	}
	subscribe(handler: (value: string) => void): void {
		this.handlers.push(handler);
	}
	unsubscribe(handler: (value: string) => void): void {
		this.handlers = this.handlers.filter((h) => h !== handler);
	}
}

export const ballerinaLSPClient = new LSPClient({
	extensions: languageServerExtensions(),
}).connect(new BallerinaTransport());
