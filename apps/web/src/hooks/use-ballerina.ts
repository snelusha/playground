import * as React from "react";

import { ballerinaWorker } from "@/lib/ballerina-worker-client";
import { snapshotFS } from "@/lib/fs/snapshot-fs";
import { useFS } from "@/providers/fs-provider";

export function useBallerina() {
	const fs = useFS();

	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		let cancelled = false;

		async function load() {
			await ballerinaWorker.load((pct) => {
				if (!cancelled) setProgress(pct);
			});

			if (!cancelled) {
				setProgress(100);
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

	async function run(path: string): Promise<{ error?: string } | null> {
		if (!fs) return { error: "Virtual file system is not available" };

		const result = await ballerinaWorker.run(await snapshotFS(fs), path);
		if (result.output) {
			console.log(result.output.trimEnd());
		}

		return result.error ? { error: result.error } : null;
	}

	return { isReady, progress, run };
}
