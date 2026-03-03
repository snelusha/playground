import * as React from "react";

import { useBrowserFS } from "@/hooks/use-browser-fs";

import { useFileStore } from "@/stores/file-store";

export function BrowserFSProvider({ children }: React.PropsWithChildren) {
    const fs = useBrowserFS();
    const setTree = useFileStore((state) => state.setTree);

    React.useEffect(() => setTree(fs.transformToTree()), []);

    return children;
}
