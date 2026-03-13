await Bun.build({
	entrypoints: ["./wasm_exec_node.cjs"],
	outdir: "./dist",
});
