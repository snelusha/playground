import type { BrowserFSProxy } from "@/lib/browser-fs";

declare global {
    export interface Window {
        Go: any;
        run(fsProxy: BrowserFSProxy, path: string): { error?: string } | null;
    }
}

export {};
