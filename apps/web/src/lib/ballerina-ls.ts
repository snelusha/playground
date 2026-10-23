import { SnapshotFS } from "@/lib/fs/snapshot";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";

import { useFileTreeStore } from "@/stores/file-tree-store";

import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { Transport } from "@codemirror/lsp-client";

type TextDocument = {
	uri?: string;
	languageId?: string;
	text?: string;
	version?: number;
};

type JSONRPCMessage = {
	method?: string;
	params?: { textDocument?: TextDocument; contentChanges?: { text: string }[] };
};

type OpenDocument = Required<
	Pick<TextDocument, "languageId" | "text" | "version">
>;

// Transport for the real Ballerina language server running in WASM. It starts
// once the Playground filesystem has an active document, then forwards normal
// JSON-RPC messages to the server.
export class BallerinaLS implements Transport {
	private handlers: ((value: string) => void)[] = [];
	private documents = new Map<string, OpenDocument>();
	private pending: string[] = [];
	private starting: Promise<void> | null = null;
	private started = false;

	send(message: string): void {
		const request = JSON.parse(message) as JSONRPCMessage;
		this.rememberDocument(request);
		if (this.started) {
			void this.forward(message, request);
			return;
		}

		this.pending.push(message);
		if (request.method === "initialize") this.startWhenFileIsReady();
	}

	subscribe(handler: (value: string) => void): void {
		this.handlers.push(handler);
	}

	unsubscribe(handler: (value: string) => void): void {
		this.handlers = this.handlers.filter((h) => h !== handler);
	}

	private rememberDocument(request: JSONRPCMessage): void {
		const document = request.params?.textDocument;
		const uri = document?.uri;
		if (!uri) return;
		if (
			request.method === "textDocument/didOpen" &&
			document.text !== undefined
		) {
			this.documents.set(uri, {
				languageId: document.languageId ?? "ballerina",
				text: document.text,
				version: document.version ?? 0,
			});
			return;
		}
		if (request.method === "textDocument/didChange") {
			const openDocument = this.documents.get(uri);
			const text = request.params?.contentChanges?.at(-1)?.text;
			if (openDocument && text !== undefined) {
				openDocument.text = text;
				openDocument.version = document.version ?? openDocument.version + 1;
			}
		}
	}

	private startWhenFileIsReady(): void {
		const activeFile = useFileTreeStore.getState().activeFile;
		if (useFileTreeStore.getState().ready && activeFile) {
			this.start(fileURI(activeFile.path));
			return;
		}
		setTimeout(() => this.startWhenFileIsReady(), 10);
	}

	private start(uri: string): void {
		if (this.starting) return;
		this.starting = this.startServer(uri).catch((error: unknown) => {
			console.error("Unable to start the Ballerina language server", error);
			this.pending = [];
			this.starting = null;
		});
	}

	private async startServer(uri: string): Promise<void> {
		const filePath = filePathFromURI(uri);
		const fs = useFileTreeStore.getState().fs();
		const targetPath = await getBallerinaProjectTarget(fs, filePath);
		const snapshot = await SnapshotFS.from(fs, targetPath);
		const client = getBallerinaWorkerClient();
		await client.init(() => undefined);
		await client.startLanguageServer(snapshot, (message) => {
			for (const handler of this.handlers) handler(message);
		});
		this.started = true;
		for (const message of this.pending) {
			await this.forward(message, JSON.parse(message) as JSONRPCMessage);
		}
		this.pending = [];
	}

	private async forward(
		message: string,
		request: JSONRPCMessage,
	): Promise<void> {
		try {
			const client = getBallerinaWorkerClient();
			const document = request.params?.textDocument;
			const openDocument = document?.uri
				? this.documents.get(document.uri)
				: undefined;

			// The upstream LS currently fails to publish a fresh result for a
			// ChangeUpdate in the browser host. Reopening the standard LSP document
			// with its current full text uses the server's proven open/load path and
			// ensures stale diagnostics are replaced until that upstream incremental
			// path is fixed.
			if (
				request.method === "textDocument/didChange" &&
				document?.uri &&
				openDocument
			) {
				await client.languageServerMessage(
					JSON.stringify({
						jsonrpc: "2.0",
						method: "textDocument/didClose",
						params: { textDocument: { uri: document.uri } },
					}),
				);
				await client.languageServerMessage(
					JSON.stringify({
						jsonrpc: "2.0",
						method: "textDocument/didOpen",
						params: { textDocument: { uri: document.uri, ...openDocument } },
					}),
				);
				return;
			}
			await client.languageServerMessage(message);
		} catch (error) {
			console.error("Ballerina language-server transport failed", error);
		}
	}
}

export function fileURI(path: string): string {
	const uri = new URL("file:///");
	uri.pathname = path;
	return uri.toString();
}

function filePathFromURI(uri: string): string {
	const url = new URL(uri);
	if (url.protocol !== "file:") throw new Error(`Unsupported URI: ${uri}`);
	return decodeURIComponent(url.pathname);
}
