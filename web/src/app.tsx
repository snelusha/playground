import { TooltipProvider } from "@/components/ui/tooltip";

import { Editor } from "@/components/editor";

export default function App() {
    return (
        <TooltipProvider>
            <Editor />
        </TooltipProvider>
    );
}
