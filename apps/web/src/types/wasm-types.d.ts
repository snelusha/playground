import type { FS } from "@/lib/fs/core/fs.interface";

declare global {
	export interface Window {
		Go: any; 
		getDiagnostics: (proxy: FS, path: string) => Array<Record<string, any>> | null;
		run(proxy: FS, path: string): { error?: string } | null;
	}
}
