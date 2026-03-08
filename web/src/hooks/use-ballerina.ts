import "@/wasm_exec";

import * as React from "react";

import { useFS } from "@/providers/fs-provider";

export function useBallerina() {
	const fs = useFS();

	const [isReady, setIsReady] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;

		async function load() {
			const go = new window.Go();
			const result = await WebAssembly.instantiateStreaming(
				fetch("ballerina.wasm"),
				go.importObject,
			);
			go.run(result.instance);
			if (!cancelled) setIsReady(true);
		}

		load().catch(() => {
			if (!cancelled) setIsReady(false);
		});

		return () => {
			cancelled = true;
		};
	}, []);

	function run(path: string): { error?: string } | null {
		if (typeof window.run !== "function")
			return { error: "Ballerina runtime is not ready" };
		if (!fs) return { error: "Virtual file system is not available" };

		const result = window.run(fs, path);
		if (result && typeof result === "object" && "error" in result) {
			return result as { error?: string };
		}
		return null;
	}

	return { isReady, run };
}
