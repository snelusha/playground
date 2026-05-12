/**
 * Default dedicated worker for the Ballerina playground WASM runtime.
 * Tests may substitute their own `Worker` via {@link BallerinaWorkerClientOptions}.
 */
export function createDefaultBallerinaWorker(): Worker {
	return new Worker(new URL("./ballerina.worker.ts", import.meta.url), {
		type: "module",
	});
}
