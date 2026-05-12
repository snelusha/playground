/**
 * Absolute URL to `ballerina.wasm` for the current deployment.
 * Main-thread only (uses `window`); not imported from the worker bundle.
 */
export function getBallerinaWasmUrl(): string {
	return new URL(
		"ballerina.wasm",
		new URL(import.meta.env.BASE_URL, window.location.origin),
	).toString();
}
