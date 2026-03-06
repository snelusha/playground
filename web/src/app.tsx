import { TooltipProvider } from "@/components/ui/tooltip";

import { Editor } from "@/components/editor";
import { FSSamplePage } from "@/components/fs-sample-page";

export default function App() {
    return (
        <TooltipProvider>
            <div className="flex h-screen flex-col gap-4 p-4">
                {/* <div className="flex-1 min-h-0">
                    <Editor />
                </div> */}
                <div className="h-[320px] min-h-[240px]">
                    <FSSamplePage />
                </div>
            </div>
        </TooltipProvider>
    );
}
