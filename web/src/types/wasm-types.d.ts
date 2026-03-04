import type { BrowserFSProxy } from "@/lib/browser-fs";

declare global {
    export interface Window {
        Go: any;
        updateFile(path: string, content: string): { error?: string } | null;
        run(path: string): { error?: string } | null;
    }
}

export {};
