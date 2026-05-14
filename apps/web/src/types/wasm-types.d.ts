import type { FS } from "@/lib/fs/core/fs.interface";

declare global {
	export interface Window {
		Go: any;
		run(
			proxy: FS,
			path: string,
		): Promise<{ stdout?: string; stderr?: string }>;
		getDiagnostics: (
			proxy: FS,
			path: string,
		) => Promise<Array<Record<string, any>> | null>;
	}
}
