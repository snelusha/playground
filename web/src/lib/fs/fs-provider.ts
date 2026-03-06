import * as React from "react";
import { UnionFS } from "./union-fs";
import { EphemeralFS } from "./ephemeral-fs";
import { LocalStorageFS } from "./local-storage-fs";
import { useFileTreeStore } from "./file-store.store";
import type { FileNode } from "./core/file-node.types";

const EXAMPLES: FileNode[] = [
    {
        name: "examples",
        kind: "dir",
        children: [
            {
                name: "main.bal",
                kind: "file",
                content: `import ballerina/io;

public function main() {
    io:println("Hello, World!");
}
`,
            },
        ],
    },
];

export function FSProvider({ children }: React.PropsWithChildren) {
    const fs = React.useRef<UnionFS | null>(null);
    const init = useFileTreeStore((s) => s.init);

    if (!fs.current) {
        const examplesFS = new EphemeralFS(EXAMPLES);
        const localStorageFS = new LocalStorageFS();
        fs.current = new UnionFS(examplesFS, localStorageFS);
    }

    React.useEffect(() => {
        if (fs.current) {
            init(fs.current);
        }
    }, [init]);

    return children;
}
