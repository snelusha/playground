import * as React from "react";

import { buildScopedFsSnapshot } from "@/lib/fs/snapshot";
import { useFS } from "@/providers/fs-provider";
import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";
import type { BallerinaWorkerResults } from "@/workers/ballerina-worker-protocol";

export function useBallerina() {
	const fs = useFS();

	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		const ballerinaWorkerClient = getBallerinaWorkerClient();
		let cancelled = false;
		const unsubscribeProgress = ballerinaWorkerClient.onProgress(
			(pct: number) => {
				if (!cancelled) setProgress(pct);
			},
		);

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

	const run = React.useCallback(
		async (
			path: string,
		): Promise<
			BallerinaWorkerResults["run"] | { error: string; output?: string }
		> => {
			if (!isReady) return { error: "Ballerina runtime is not ready" };
			if (!fs) return { error: "Virtual file system is not available" };

			const ballerinaWorkerClient = getBallerinaWorkerClient();
			try {
				const snapshot = await buildScopedFsSnapshot(fs, path);
				return await ballerinaWorkerClient.run({
					targetPath: path,
					snapshot,
				});
			} catch {
				setIsReady(false);
				return { error: "Failed to execute Ballerina program" };
			}
		},
		[isReady, fs],
	);

	return { isReady, progress, run };
}
