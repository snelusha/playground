import type { FS } from "@/lib/fs/core/fs.interface";
import type {
	HttpDispatchRequest,
	HttpDispatchResponse,
	RunEventCallback,
} from "@/workers/ballerina-worker-api";
import type { FileWatchEvent } from "@/lib/fs/mutations";

declare global {
	export interface Window {
		Go: any;
		run(proxy: FS, path: string, onEvent: RunEventCallback): Promise<void>;
		getDiagnostics: (
			proxy: FS,
			path: string,
		) => Promise<Array<Record<string, any>> | null>;
		notifyFilesystemEvents(events: FileWatchEvent[]): boolean;
		dispatchHttpRequest: (
			request: HttpDispatchRequest,
		) => Promise<HttpDispatchResponse>;
	}
}
