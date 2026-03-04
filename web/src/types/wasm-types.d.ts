declare global {
    export interface Window {
        Go: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        updateFile(path: string, content: string): { error?: string } | null;
        run(path: string): { error?: string } | null;
    }
}

export {};
