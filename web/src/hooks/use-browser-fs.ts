import * as React from "react";

import { BrowserFS } from "@/lib/browser-fs";

export function useBrowserFS() {
    const fs = React.useRef(BrowserFS.getInstance());
    return fs.current;
}
