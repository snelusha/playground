import { useFileTreeStore } from "@/stores/file-tree-store";
import { languageServerExtensions, LSPClient } from "@codemirror/lsp-client";

import type { Transport } from "@codemirror/lsp-client";

type TextDocumentParams = {
	textDocument: { uri: string };
};

type DiagnosticRange = {
	start: { line: number; column: number };
	end: { line: number; column: number };
};

type WasmDiagnostic = {
	range?: DiagnosticRange;
	severity?: number;
	message?: unknown;
};

const diagnosticSequenceByUri = new Map<string, number>();

function toCodeMirrorDiagnostics(result: unknown) {
	if (!Array.isArray(result)) return [];

	return result.map((d: WasmDiagnostic) => {
		const start = d.range?.start ?? { line: 0, column: 0 };
		const end = d.range?.end ?? start;

		return {
			range: {
				start: { line: start.line, character: start.column },
				end: { line: end.line, character: end.column },
			},
			severity: d.severity ?? 1,
			message: String(d.message ?? ""),
		};
	});
}

export const ballerinaLS = {
	name: "Ballerina Language Server",
	onNotification: (_n: unknown) => {},
	handleRequest: async (method: string, params: unknown): Promise<unknown> => {
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
				const uri = textDocument.uri;
				const sequence = (diagnosticSequenceByUri.get(uri) ?? 0) + 1;
				diagnosticSequenceByUri.set(uri, sequence);

				const result = await window.getDiagnostics(
					useFileTreeStore.getState().fs(),
					uri,
				);
				console.log("Diagnostics result:", result);
				if (diagnosticSequenceByUri.get(uri) !== sequence) {
					return null;
				}

				const diagnostics = toCodeMirrorDiagnostics(result);
				ballerinaLS.onNotification({
					jsonrpc: "2.0",
					method: "textDocument/publishDiagnostics",
					params: {
						uri,
						diagnostics,
					},
				});

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
		void (async () => {
			const req = JSON.parse(message);
			const result = await ballerinaLS.handleRequest(req.method, req.params);
			if (req.id !== undefined) {
				const response = { jsonrpc: "2.0", id: req.id, result };
				for (const h of this.handlers) {
					h(JSON.stringify(response));
				}
			}
		})();
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
