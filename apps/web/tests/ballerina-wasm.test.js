import "../src/wasm_exec.js";

import { beforeAll, expect, test } from "bun:test";

function createFs(files) {
	const modTime = Date.now();
	const dirs = new Set(["/"]);

	for (const file of files.keys()) {
		let dir = file.split("/").slice(0, -1).join("/") || "/";
		while (!dirs.has(dir)) {
			dirs.add(dir);
			dir = dir.split("/").slice(0, -1).join("/") || "/";
		}
	}

	return {
		async open(path) {
			const content = files.get(path);
			if (content === undefined) return null;
			return { content, size: content.length, modTime, isDir: false };
		},

		async stat(path) {
			if (dirs.has(path)) {
				return {
					name: path.split("/").pop() || "/",
					size: 0,
					modTime,
					isDir: true,
				};
			}

			const content = files.get(path);
			if (content === undefined) return null;
			return {
				name: path.split("/").pop(),
				size: content.length,
				modTime,
				isDir: false,
			};
		},

		async readDir(path) {
			if (!dirs.has(path)) return null;

			const prefix = path === "/" ? "/" : `${path}/`;
			const entries = new Map();

			for (const dir of dirs) {
				if (dir === path || !dir.startsWith(prefix)) continue;
				const name = dir.slice(prefix.length).split("/")[0];
				entries.set(name, { name, isDir: true });
			}

			for (const file of files.keys()) {
				if (!file.startsWith(prefix)) continue;
				const name = file.slice(prefix.length).split("/")[0];
				entries.set(name, entries.get(name) ?? { name, isDir: false });
			}

			return [...entries.values()];
		},

		async writeFile() {
			return false;
		},
		async remove() {
			return false;
		},
		async move() {
			return false;
		},
		async mkdirAll() {
			return false;
		},
	};
}

beforeAll(async () => {
	const go = new globalThis.Go();
	const wasm = await Bun.file(
		new URL("../public/ballerina.wasm", import.meta.url),
	).arrayBuffer();
	const { instance } = await WebAssembly.instantiate(wasm, go.importObject);

	void go.run(instance);

	while (typeof globalThis.run !== "function") {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

test("runs hello world", async () => {
	const path = "/tmp/main.bal";
	const source = await Bun.file(
		new URL("./fixtures/hello-world.bal", import.meta.url),
	).text();

	const result = await globalThis.run(
		createFs(new Map([[path, source]])),
		path,
	);

	expect(result.stdout).toBe("Hello, World!\n");
	expect(result.stderr).toBe("");
}, 30_000);

test("runs a Ballerina package directory", async () => {
	const packagePath = "/tmp/hello_package";
	const main = await Bun.file(
		new URL("./fixtures/hello-package/main.bal", import.meta.url),
	).text();
	const toml = await Bun.file(
		new URL("./fixtures/hello-package/Ballerina.toml", import.meta.url),
	).text();
	const fs = createFs(
		new Map([
			[`${packagePath}/main.bal`, main],
			[`${packagePath}/Ballerina.toml`, toml],
		]),
	);

	const result = await globalThis.run(fs, packagePath);

	expect(result.stdout).toBe("Hello from package!\n");
	expect(result.stderr).toBe("");
}, 30_000);
