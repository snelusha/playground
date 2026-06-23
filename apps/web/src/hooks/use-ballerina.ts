import "@/wasm_exec";

import * as React from "react";

import { SnapshotFS } from "@/lib/fs/snapshot";

import { useFS } from "@/providers/fs-provider";

import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { BallerinaWorkerClient } from "@/workers/ballerina-worker-client";
import type {
	HttpDispatchRequest,
	HttpDispatchResponse,
	RunEventCallback,
} from "@/workers/ballerina-worker-api";

export function useBallerina() {
	const fs = useFS();

	const clientRef = React.useRef<BallerinaWorkerClient | null>(null);

	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		const client = getBallerinaWorkerClient();
		clientRef.current = client;

		client
			.init((p) => setProgress(p))
			.then(() => setIsReady(true))
			.catch(() => setIsReady(false));

		return () => {
			if (clientRef.current === client) clientRef.current = null;
		};
	}, []);

	const run = React.useCallback(
		async (path: string, onEvent: RunEventCallback): Promise<void> => {
			if (!clientRef.current) {
				onEvent({
					type: "output",
					stream: "stderr",
					text: "Ballerina runtime is not initialized",
				});
				return;
			}
			if (!fs) {
				onEvent({
					type: "output",
					stream: "stderr",
					text: "Virtual file system is not available",
				});
				return;
			}

			const snapshot = await SnapshotFS.from(fs, path);
			await clientRef.current.run(snapshot, path, onEvent);
		},
		[fs],
	);

	const sendStopSignal = React.useCallback(async (): Promise<boolean> => {
		if (!clientRef.current) return false;
		return clientRef.current.sendStopSignal();
	}, []);

	const dispatchHttpRequest = React.useCallback(
		async (request: HttpDispatchRequest): Promise<HttpDispatchResponse> => {
			if (!clientRef.current)
				throw new Error("Ballerina runtime is not initialized");
			return clientRef.current.dispatchHttpRequest(request);
		},
		[],
	);

	return { isReady, progress, run, sendStopSignal, dispatchHttpRequest };
}
