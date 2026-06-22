import type { FS } from "@/lib/fs/core/fs.interface";
import type {
	HttpDispatchRequest,
	HttpDispatchResponse,
	RunOutputCallback,
} from "@/workers/ballerina-worker-api";

declare global {
	export interface Window {
		Go: any;
		run(proxy: FS, path: string, onOutput: RunOutputCallback): Promise<void>;
		getDiagnostics: (
			proxy: FS,
			path: string,
		) => Promise<Array<Record<string, any>> | null>;
		dispatchHttpRequest: (
			request: HttpDispatchRequest,
		) => Promise<HttpDispatchResponse>;
	}
}
