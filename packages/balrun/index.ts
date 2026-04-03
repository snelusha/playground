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
			const wasmPath = join(__dirname, "main.wasm");
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

export async function echo(msg) {
	await loadWasm();
	return globalThis.echo(msg);
}

export async function add(a, b) {
	await loadWasm();
	return globalThis.add(a, b);
}
