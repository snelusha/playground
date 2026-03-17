import "@/wasm_exec";

import * as React from "react";

import { useFS } from "@/providers/fs-provider";

export function useBallerina() {
	const fs = useFS();

	const [isReady, setIsReady] = React.useState(false);
	const [progressPct, setProgressPct] = React.useState<number | null>(0);

	React.useEffect(() => {
		let cancelled = false;

		async function load() {
			const go = new window.Go();

			const result = await WebAssembly.instantiateStreaming(
				fetchResponseWithProgress("ballerina.wasm", (pct) => {
					if (!cancelled) setProgressPct(pct);
				}),
				go.importObject,
			);

			go.run(result.instance);

			if (!cancelled) {
				setProgressPct(100);
				setIsReady(true);
			}
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

	return { isReady, progressPct, run };
}

async function fetchResponseWithProgress(
	url: string,
	onProgress: (pct: number | null) => void,
): Promise<Response> {
	const res = await fetch(url);
	const total = Number(res.headers.get("content-length") ?? 0);
	const hasTotal = Number.isFinite(total) && total > 0;

	if (!res.body) return res;
	if (!hasTotal) {
		onProgress(null);
		return res;
	}

	const reader = res.body.getReader();
	const stream = new ReadableStream({
		async start(controller) {
			let loaded = 0;
			let lastPct = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					onProgress(100);
					controller.close();
					break;
				}
				if (value) {
					loaded += value.byteLength;
					const rawPct = Math.floor((loaded / total) * 100);
					const clampedPct = Math.max(0, Math.min(99, rawPct));
					if (clampedPct !== lastPct) {
						lastPct = clampedPct;
						onProgress(clampedPct);
					}
					controller.enqueue(value);
				}
			}
		},
	});

	return new Response(stream, { headers: res.headers });
}
