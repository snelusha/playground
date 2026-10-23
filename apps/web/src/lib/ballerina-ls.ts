import { SnapshotFS } from "@/lib/fs/snapshot";
import { getBallerinaProjectTarget } from "@/lib/fs/project-target";

import { useFileTreeStore } from "@/stores/file-tree-store";

import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { Transport } from "@codemirror/lsp-client";

type JSONRPCMessage = {
	method?: string;
	params?: { textDocument?: { uri?: string } };
};

// Transport for the real Ballerina language server running in WASM. It delays
// startup until CodeMirror opens a document because that is when the
// Playground filesystem and project root are available.
export class BallerinaLS implements Transport {
	private handlers: ((value: string) => void)[] = [];
	private pending: string[] = [];
	private starting: Promise<void> | null = null;
	private started = false;

	send(message: string): void {
		if (this.started) {
			void this.forward(message);
			return;
		}

		this.pending.push(message);
		const request = JSON.parse(message) as JSONRPCMessage;
		if (request.method !== "textDocument/didOpen") return;
		const uri = request.params?.textDocument?.uri;
		if (uri) this.start(uri);
	}

	subscribe(handler: (value: string) => void): void {
		this.handlers.push(handler);
	}

	unsubscribe(handler: (value: string) => void): void {
		this.handlers = this.handlers.filter((h) => h !== handler);
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
		if (!useFileTreeStore.getState().ready)
			throw new Error("Filesystem is not ready");

		const filePath = filePathFromURI(uri);
		const fs = useFileTreeStore.getState().fs();
		const targetPath = await getBallerinaProjectTarget(fs, filePath);
		const snapshot = await SnapshotFS.from(fs, targetPath);
		const client = getBallerinaWorkerClient();

		await client.startLanguageServer(snapshot, (message) => {
			for (const handler of this.handlers) handler(message);
		});
		this.started = true;

		const pending = this.pending;
		this.pending = [];
		for (const message of pending) await this.forward(message);
	}

	private async forward(message: string): Promise<void> {
		try {
			await getBallerinaWorkerClient().languageServerMessage(message);
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
