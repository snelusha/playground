import * as React from "react";

import { buildScopedFsSnapshot } from "@/lib/fs/snapshot";
import { useFS } from "@/providers/fs-provider";
import { ballerinaWorkerClient } from "@/workers/ballerina-worker-client";

export function useBallerina() {
	const fs = useFS();

	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		let cancelled = false;
		const unsubscribeProgress = ballerinaWorkerClient.onProgress((pct) => {
			if (!cancelled) setProgress(pct);
		});

		ballerinaWorkerClient
			.init()
			.then(() => {
				if (!cancelled) {
					setProgress(100);
					setIsReady(true);
				}
			})
			.catch(() => {
				if (!cancelled) setIsReady(false);
			});

		return () => {
			unsubscribeProgress();
			cancelled = true;
		};
	}, []);

	async function run(
		path: string,
	): Promise<{ error?: string; output?: string } | null> {
		if (!ballerinaWorkerClient.isReady())
			return { error: "Ballerina runtime is not ready" };
		if (!fs) return { error: "Virtual file system is not available" };

		try {
			const snapshot = await buildScopedFsSnapshot(fs, path);
			const result = await ballerinaWorkerClient.run({
				targetPath: path,
				snapshot,
			});
			if (result && typeof result === "object") {
				return result as { error?: string; output?: string };
			}
			return null;
		} catch {
			setIsReady(false);
			return { error: "Failed to execute Ballerina program" };
		}
	}

	return { isReady, progress, run };
}
