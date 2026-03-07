import * as React from "react";

import { EphemeralFS } from "@/lib/fs/ephemeral-fs";
import { LocalStorageFS } from "@/lib/fs/local-storage-fs";
import { LayeredFS } from "@/lib/fs/layered-fs";

import { useFileTreeStore } from "@/stores/file-tree-store";

import EXAMPLES from "@/assets/examples.json";

import type { FileNode } from "@/lib/fs/core/file-node.types";

const MORE: FileNode[] = [
    {
        kind: "dir",
        name: "paypal.orders",
        children: [
            {
                kind: "dir",
                name: "modules",
                children: [
                    {
                        kind: "dir",
                        name: "service",
                        children: [
                            {
                                kind: "file",
                                name: "service.bal",
                                content: "",
                            },
                        ],
                    },
                ],
            },
            {
                kind: "file",
                name: "Ballerina.toml",
                content: "",
            },
            {
                kind: "file",
                name: "main.bal",
                content: "",
            },
        ],
    },
];

function createFS(): LayeredFS {
    const wrappedExamples: FileNode[] = [
        {
            kind: "dir",
            name: "tmp",
            children: (EXAMPLES as FileNode[]).concat(MORE),
        },
    ];
    return new LayeredFS(
        new EphemeralFS(wrappedExamples),
        new LocalStorageFS(),
    );
}

const DEFAULT_FILE = "/tmp/01-orders.bal";

export const FSContext = React.createContext<LayeredFS | null>(null);

export function FSProvider({ children }: React.PropsWithChildren) {
    const fs = React.useRef<LayeredFS>(null);

    const init = useFileTreeStore((s) => s.init);
    const ready = useFileTreeStore((s) => s.ready);
    const activeFile = useFileTreeStore((s) => s.activeFile);
    const openFile = useFileTreeStore((s) => s.openFile);

    if (!fs.current) fs.current = createFS();

    React.useEffect(() => {
        if (fs.current) init(fs.current);
    }, [init]);

    React.useEffect(() => {
        if (ready && !activeFile) openFile(DEFAULT_FILE);
    }, [ready, activeFile, openFile]);

    return (
        <FSContext.Provider value={fs.current}>{children}</FSContext.Provider>
    );
}

export const useFS = (): LayeredFS => {
    const fs = React.useContext(FSContext);
    if (!fs) throw new Error("FS not available");
    return fs;
};
