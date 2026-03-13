import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

import "./wasm_exec";

let initialized = false;

globalThis.require = require;
globalThis.fs = require("fs");
globalThis.path = require("path");
globalThis.TextEncoder = require("util").TextEncoder;
globalThis.TextDecoder = require("util").TextDecoder;

globalThis.performance ??= require("performance");

globalThis.crypto ??= require("crypto");

export async function init() {
	if (initialized) return;

	const go = new Go();
	go.argv = process.argv.slice(2);
	go.env = Object.assign({ TMPDIR: require("os").tmpdir() }, process.env);
	go.exit = process.exit;
	const wasmPath = join(__dirname, "ballerina.wasm");
	const wasmBytes = readFileSync(wasmPath);
	const { instance } = await WebAssembly.instantiate(
		wasmBytes,
		go.importObject,
	);
	go.run(instance);
	initialized = true;
}
