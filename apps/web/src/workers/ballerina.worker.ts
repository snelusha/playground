import "@/wasm_exec";

import * as Comlink from "comlink";

import type { FS, OpenResult, StatResult } from "@/lib/fs/core/fs.interface";
import type {
	BallerinaWorkerApi,
	FsSnapshot,
} from "@/workers/ballerina-worker-protocol";

type GoRuntime = {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void> | void;
};

type RuntimeGlobals = typeof globalThis & {
	Go: new () => GoRuntime;
	run: (proxy: FS, path: string) => { error?: string } | null;
	getDiagnostics: (
		proxy: FS,
		path: string,
	) => Promise<Array<Record<string, unknown>> | null>;
};

class SnapshotFS implements FS {
	private readonly files = new Map<
		string,
		{ content: string; modTime: number }
	>();
	private readonly dirs = new Map<string, { modTime: number }>();

	constructor(snapshot: FsSnapshot) {
		for (const entry of snapshot.entries) {
			if (entry.kind === "dir") {
				this.dirs.set(entry.path, { modTime: entry.modTime });
			} else {
				this.files.set(entry.path, {
					content: entry.content,
					modTime: entry.modTime,
				});
			}
		}
		if (!this.dirs.has("/")) this.dirs.set("/", { modTime: Date.now() });
	}

	async open(path: string): Promise<OpenResult | null> {
		const file = this.files.get(path);
		if (!file) return null;
		return {
			content: file.content,
			size: file.content.length,
			modTime: file.modTime,
			isDir: false,
		};
	}

	async stat(path: string): Promise<StatResult | null> {
		const dir = this.dirs.get(path);
		if (dir) {
			return {
				name: this.baseName(path),
				size: 0,
				modTime: dir.modTime,
				isDir: true,
			};
		}
		const file = this.files.get(path);
		if (!file) return null;
		return {
			name: this.baseName(path),
			size: file.content.length,
			modTime: file.modTime,
			isDir: false,
		};
	}

	async readDir(
		path: string,
	): Promise<Array<{ name: string; isDir: boolean }> | null> {
		if (!this.dirs.has(path)) return null;

		const prefix = path === "/" ? "/" : `${path}/`;
		const children = new Map<string, boolean>();

		for (const dirPath of this.dirs.keys()) {
			if (dirPath === path || !dirPath.startsWith(prefix)) continue;
			const segment = dirPath.slice(prefix.length).split("/")[0];
			if (segment) children.set(segment, true);
		}
		for (const filePath of this.files.keys()) {
			if (!filePath.startsWith(prefix)) continue;
			const segment = filePath.slice(prefix.length).split("/")[0];
			if (segment && !children.has(segment)) children.set(segment, false);
		}

		return [...children.entries()]
			.map(([name, isDir]) => ({ name, isDir }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async writeFile(): Promise<boolean> {
		return false;
	}
	async remove(): Promise<boolean> {
		return false;
	}
	async move(): Promise<boolean> {
		return false;
	}
	async mkdirAll(): Promise<boolean> {
		return false;
	}

	private baseName(path: string): string {
		return path.split("/").filter(Boolean).at(-1) ?? "/";
	}
}

let runtimeInit: Promise<void> | null = null;

async function streamWithProgress(
	url: string,
	onProgress?: (percent: number) => void,
): Promise<Response> {
	const res = await fetch(url);
	const total = Number(res.headers.get("content-length") ?? 0);
	if (!res.body || !total) return res;

	let loaded = 0;
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			loaded += chunk.byteLength;
			onProgress?.(Math.round((loaded / total) * 100));
			controller.enqueue(chunk);
		},
	});

	res.body.pipeTo(writable).catch(() => {});
	return new Response(readable, { headers: res.headers });
}

async function initRuntime(
	wasmUrl: string,
	onProgress?: (percent: number) => void,
): Promise<void> {
	if (runtimeInit) return runtimeInit;

	runtimeInit = (async () => {
		const { Go } = globalThis as RuntimeGlobals;
		const go = new Go();
		const result = await WebAssembly.instantiateStreaming(
			streamWithProgress(wasmUrl, onProgress),
			go.importObject,
		);
		// Do not await: wasm_exec's go.run() waits on _exitPromise until the Go
		// program exits; the Ballerina runtime stays resident, so awaiting would hang.
		void go.run(result.instance);
	})().catch((err) => {
		runtimeInit = null;
		throw err;
	});

	return runtimeInit;
}

async function captureConsoleLogs<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; output: string }> {
	const lines: string[] = [];
	const originalLog = console.log;
	console.log = (...args: unknown[]) => lines.push(args.join(" "));
	try {
		const result = await fn();
		return { result, output: lines.join("\n") };
	} finally {
		console.log = originalLog;
	}
}

const api: BallerinaWorkerApi = {
	async init(wasmUrl, onProgress) {
		await initRuntime(wasmUrl, onProgress);
	},

	async run({ snapshot, targetPath }) {
		const { run } = globalThis as RuntimeGlobals;
		const fs = new SnapshotFS(snapshot);
		const { result, output } = await captureConsoleLogs(() =>
			Promise.resolve(run(fs, targetPath)),
		);
		return result ? { ...result, output } : { output };
	},

	async getDiagnostics({ snapshot, targetPath }) {
		const { getDiagnostics } = globalThis as RuntimeGlobals;
		const fs = new SnapshotFS(snapshot);
		return getDiagnostics(fs, targetPath);
	},
};

Comlink.expose(api);
