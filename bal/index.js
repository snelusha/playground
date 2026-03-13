import { readFile } from "node:fs/promises";
import { WASI } from "node:wasi";
import { argv, env } from "node:process";

const wasi = new WASI({
	version: "preview1",
	args: argv,
	env: { ...env, PWD: "/" },
	preopens: {
		"/": ".",
	},
});

async function main() {
	const wasm = await WebAssembly.compile(
		await readFile(new URL("ballerina.wasm", import.meta.url)),
	);
	const instance = await WebAssembly.instantiate(wasm, {
		wasi_snapshot_preview1: wasi.wasiImport,
	});
	wasi.start(instance);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
