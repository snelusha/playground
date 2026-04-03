import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// const __dirname = dirname(fileURLToPath(import.meta.url));

// const require = createRequire(import.meta.url);
require("./wasm_exec.js");

let _ready: any = null;

function loadWasm() {
	if (_ready) return _ready;

	// biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
	_ready = new Promise(async (resolve, reject) => {
		try {
			const go = new globalThis.Go();
			const wasmPath = join(__dirname, "ballerina.wasm");
			const wasmBuffer = readFileSync(wasmPath);
			const { instance } = await WebAssembly.instantiate(
				wasmBuffer,
				go.importObject,
			);
			go.run(instance);
			setImmediate(resolve);
		} catch (err) {
			reject(err);
		}
	});

	return _ready;
}

export interface FS {
	open(path: string): {
		content: string;
		size: number;
		modTime: number;
		isDir: boolean;
	} | null;

	stat(path: string): {
		name: string;
		size: number;
		modTime: number;
		isDir: boolean;
	} | null;

	readDir(path: string): { name: string; isDir: boolean }[] | null;

	writeFile(path: string, content: string): boolean;

	remove(path: string): boolean;

	move(oldPath: string, newPath: string): boolean;

	mkdirAll(path: string): boolean;
}

class FSImpl implements FS {
	open(path: string): {
		content: string;
		size: number;
		modTime: number;
		isDir: boolean;
	} | null {
		const fs = require("fs");
		try {
			const stats = fs.statSync(path);
			if (stats.isDirectory()) {
				return {
					content: "",
					size: stats.size,
					modTime: stats.mtimeMs,
					isDir: true,
				};
			} else {
				const content = fs.readFileSync(path, "utf-8");
				return {
					content,
					size: stats.size,
					modTime: stats.mtimeMs,
					isDir: false,
				};
			}
		} catch (err) {
			return null;
		}
	}
	stat(path: string): {
		name: string;
		size: number;
		modTime: number;
		isDir: boolean;
	} | null {
		const fs = require("fs");
		try {
			const stats = fs.statSync(path);
			return {
				name: path,
				size: stats.size,
				modTime: stats.mtimeMs,
				isDir: stats.isDirectory(),
			};
		} catch (err) {
			return null;
		}
	}
	readDir(path: string): { name: string; isDir: boolean }[] | null {
		const fs = require("fs");
		try {
			const entries = fs.readdirSync(path, { withFileTypes: true });
			return entries.map((entry) => ({
				name: entry.name,
				isDir: entry.isDirectory(),
			}));
		} catch (err) {
			return null;
		}
	}
	writeFile(path: string, content: string): boolean {
		throw new Error("writeFile Method not implemented.");
	}
	remove(path: string): boolean {
		throw new Error("remove Method not implemented.");
	}
	move(oldPath: string, newPath: string): boolean {
		throw new Error("move Method not implemented.");
	}
	mkdirAll(path: string): boolean {
		throw new Error("mkdirAll Method not implemented.");
	}
}

export async function run(path: string) {
	await loadWasm();
	const fs = new FSImpl();
	return globalThis.run(fs, path);
}

// export async function echo(msg) {
// 	await loadWasm();
// 	return globalThis.echo(msg);
// }
//
// export async function add(a, b) {
// 	await loadWasm();
// 	return globalThis.add(a, b);
// }
