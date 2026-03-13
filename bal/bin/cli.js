#!/usr/bin/env node

globalThis.require = require;
globalThis.fs = require("fs");
globalThis.path = require("path");
globalThis.TextEncoder = require("util").TextEncoder;
globalThis.TextDecoder = require("util").TextDecoder;

globalThis.performance ??= require("performance");

globalThis.crypto ??= require("crypto");

require("./wasm_exec");

const go = new Go();
go.argv = process.argv.slice(2);
go.env = Object.assign({ TMPDIR: require("os").tmpdir() }, process.env);
go.exit = process.exit;
WebAssembly.instantiate(
	fs.readFileSync(path.join(__dirname, "..", "ballerina.wasm")),
	go.importObject,
)
	.then((result) => {
		process.on("exit", (code) => {
			// Node.js exits if no event handler is pending
			if (code === 0 && !go.exited) {
				// deadlock, make Go print error and stack traces
				go._pendingEvent = { id: 0 };
				go._resume();
			}
		});
		return go.run(result.instance);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});

// import { readFileSync } from "fs";
// import { createRequire } from "module";
// import { fileURLToPath } from "url";
// import { dirname, join } from "path";
//
// const __dirname = dirname(fileURLToPath(import.meta.url));
//
// // Load wasm_exec_node.js to register the Go global
// const require = createRequire(import.meta.url);
// require("./wasm_exec");
// // require(join(__dirname, "..", "wasm_exec_node.cjs"));
//
// const wasmBuffer = readFileSync(join(__dirname, "..", "ballerina.wasm"));
// const go = new Go();
//
// const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);
// await go.run(instance);
