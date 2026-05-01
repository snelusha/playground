import type { FS } from "@/lib/fs/core/fs.interface";

export interface RunIOHandlers {
	stdout?: (chunk: string) => void;
	stderr?: (chunk: string) => void;
}

declare global {
	export interface Window {
		Go: any;
		run(
			proxy: FS,
			path: string,
			ioHandlers?: RunIOHandlers,
		): { error?: string } | null;
	}
}
