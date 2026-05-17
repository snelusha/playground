import "../src/wasm_exec.js";

import { beforeAll, expect, test } from "bun:test";

type DirEntry = {
	name: string;
	isDir: boolean;
};

type OpenResult = {
	content: string;
	size: number;
	modTime: number;
	isDir: false;
};

type StatResult = {
	name: string;
	size: number;
	modTime: number;
	isDir: boolean;
};

type RunResult = {
	stdout?: string;
	stderr?: string;
};

type GoRuntime = {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void>;
};

declare global {
	var Go: new () => GoRuntime;
	var run:
		| ((fs: InMemoryBallerinaFS, path: string) => Promise<RunResult>)
		| undefined;
}

class InMemoryBallerinaFS {
	private readonly modTime = Date.now();

	constructor(private readonly files: ReadonlyMap<string, string>) {}

	async open(path: string): Promise<OpenResult | null> {
		const content = this.files.get(path);
		if (content === undefined) return null;

		return {
			content,
			size: content.length,
			modTime: this.modTime,
			isDir: false,
		};
	}

	async stat(path: string): Promise<StatResult | null> {
		if (path === "/") {
			return { name: "/", size: 0, modTime: this.modTime, isDir: true };
		}

		if (path === "/tmp") {
			return { name: "tmp", size: 0, modTime: this.modTime, isDir: true };
		}

		const content = this.files.get(path);
		if (content === undefined) return null;

		return {
			name: path.split("/").pop() ?? path,
			size: content.length,
			modTime: this.modTime,
			isDir: false,
		};
	}

	async readDir(path: string): Promise<DirEntry[] | null> {
		if (path === "/") return [{ name: "tmp", isDir: true }];
		if (path !== "/tmp") return null;

		return [...this.files.keys()].map((filePath) => ({
			name: filePath.split("/").pop() ?? filePath,
			isDir: false,
		}));
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
}

beforeAll(async () => {
	const go = new globalThis.Go();
	const wasmUrl = new URL("../public/ballerina.wasm", import.meta.url);
	const bytes = await Bun.file(wasmUrl).arrayBuffer();
	const { instance } = await WebAssembly.instantiate(bytes, go.importObject);

	void go.run(instance);

	while (typeof globalThis.run !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

test("runs a hello world Ballerina file and captures stdout/stderr", async () => {
	const path = "/tmp/main.bal";
	const source = await Bun.file(
		new URL("./fixtures/hello-world.bal", import.meta.url),
	).text();
	const fs = new InMemoryBallerinaFS(new Map([[path, source]]));

	const result = await globalThis.run?.(fs, path);

	expect(result).toEqual({
		stdout: "Hello, World!\n",
		stderr: "",
	});
}, 30_000);
