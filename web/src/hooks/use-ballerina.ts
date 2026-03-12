import "@/wasm_exec";

import * as React from "react";

export function useBallerina() {
    const [isReady, setIsReady] = React.useState(false);
    const [progress, setProgress] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;

        async function load() {
            const go = new window.Go();
            const res = await fetch("ballerina.wasm");
            const total = Number(res.headers.get("content-length") ?? 0);

            if (!res.body || !total) {
                const result = await WebAssembly.instantiateStreaming(
                    res,
                    go.importObject,
                );
                go.run(result.instance);
                if (!cancelled) {
                    setProgress(100);
                    setIsReady(true);
                }
                return;
            }

            const reader = res.body.getReader();
            let loaded = 0;
            const chunks: Uint8Array[] = [];

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    chunks.push(value);
                    loaded += value.byteLength;
                    if (!cancelled && total) {
                        setProgress(Math.round((loaded / total) * 100));
                    }
                }
            }

            const bytes = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }

            const result = await WebAssembly.instantiate(bytes, go.importObject);
            go.run(result.instance);
            if (!cancelled) {
                setProgress(100);
                setIsReady(true);
            }
        }

        load().catch(() => {
            if (!cancelled) setIsReady(false);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    function updateFile(
        path: string,
        content: string,
    ): { error?: string } | null {
        if (typeof window.updateFile !== "function") {
            return { error: "Ballerina runtime is not ready" };
        }
        const result = window.updateFile(path, content);
        if (result && typeof result === "object" && "error" in result) {
            return result as { error?: string };
        }
        return null;
    }

    function run(path: string): { error?: string } | null {
        if (typeof window.run !== "function") {
            return { error: "Ballerina runtime is not ready" };
        }
        const result = window.run(path);
        if (result && typeof result === "object" && "error" in result) {
            return result as { error?: string };
        }
        return null;
    }

    return { isReady, progress, updateFile, run };
}
