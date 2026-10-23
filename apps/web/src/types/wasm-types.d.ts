import type { FS } from "@/lib/fs/core/fs.interface";
import type {
	HttpDispatchRequest,
	HttpDispatchResponse,
	RunEventCallback,
} from "@/workers/ballerina-worker-api";

declare global {
	export interface Window {
		Go: any;
		run(proxy: FS, path: string, onEvent: RunEventCallback): Promise<void>;
		dispatchHttpRequest(
			request: HttpDispatchRequest,
		): Promise<HttpDispatchResponse>;
	}
}
