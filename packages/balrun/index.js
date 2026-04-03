import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the Go WASM runtime (wasm_exec.js patches globalThis.Go)
const require = createRequire(import.meta.url);
require("./wasm_exec.js");

let _ready = null;

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

			// Run Go's main() — this registers all __go_* globals and blocks on the channel
			go.run(instance);

			// Give the Go runtime one tick to register the globals
			setImmediate(resolve);
		} catch (err) {
			reject(err);
		}
	});

	return _ready;
}

/**
 * Echoes the message back.
 * @param {string} msg
 * @returns {Promise<string>}
 */
export async function echo(msg) {
	await loadWasm();
	return globalThis.echo(msg);
}
