import type { FS } from "@/lib/fs/core/fs.interface";

declare global {
	export interface Window {
		Go: any;
		run(proxy: FS, path: string): Promise<{ error?: string } | null>;
		getDiagnostics(
			proxy: FS,
			path: string,
		): Promise<
			| {
					range: {
						start: { line: number; character: number };
						end: { line: number; character: number };
					};
					severity: number;
					message: string;
			  }[]
			| null
		>;
	}
}
