import "@/wasm_exec";

import * as React from "react";

import { BrowserFS } from "@/lib/browser-fs";

export function useBallerina() {
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;

        async function load() {
            const go = new window.Go();
            const result = await WebAssembly.instantiateStreaming(
                fetch("ballerina.wasm"),
                go.importObject,
            );
            go.run(result.instance);
            if (!cancelled) setIsLoading(true);
        }

        load().catch(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    function run(projectPath: string): { error?: string } | null {
        if (typeof window.run !== "function") {
            return { error: "Ballerina runtime is not ready" };
        }
        const bfs = BrowserFS.getInstance();
        const result = window.run(bfs, projectPath);
        if (result && typeof result === "object" && "error" in result) {
            return result as { error?: string };
        }
        return null;
    }

    return { isReady: isLoading, run };
}
