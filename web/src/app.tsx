import { TooltipProvider } from "@/components/ui/tooltip";

import { BrowserFSProvider } from "@/providers/fs-provider";

import { Editor } from "@/components/editor";

export default function App() {
    return (
        <BrowserFSProvider>
            <TooltipProvider>
                <Editor />
            </TooltipProvider>
        </BrowserFSProvider>
    );
}
