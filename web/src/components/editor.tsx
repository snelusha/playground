import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import {
    ChevronDown,
    ChevronUp,
    CleanIcon,
    GithubFreeIcons,
    PlayIcon,
} from "@hugeicons/core-free-icons";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";

import { AppSidebar } from "@/components/app-sidebar";

import { useBallerina } from "@/hooks/use-ballerina";
import { useFileStore, useSelectedFile } from "@/stores/file-store";

import { cn } from "@/lib/utils";

import { MinimalEditor } from "./minimal-editor";
import { languageFromFileName, projectPathFromFilePath } from "@/types/files";

type AnsiStyleState = {
    color?: string;
    fontWeight?: "normal" | "bold";
};

const ANSI_PATTERN = /\x1b\[(\d+(?:;\d+)*)m/g;

function ansiCodesToStyle(
    prev: AnsiStyleState,
    codes: number[],
): AnsiStyleState {
    let next: AnsiStyleState = { ...prev };

    for (const code of codes) {
        if (code === 0) {
            next = {};
            continue;
        }

        if (code === 1) {
            next.fontWeight = "bold";
            continue;
        }

        if (code === 22) {
            next.fontWeight = "normal";
            continue;
        }

        if (code === 39) {
            delete next.color;
            continue;
        }

        switch (code) {
            case 30:
                next.color = "#6b7280";
                break;
            case 31:
                next.color = "#dc2626";
                break;
            case 32:
                next.color = "#16a34a";
                break;
            case 33:
                next.color = "#ca8a04";
                break;
            case 34:
                next.color = "#2563eb";
                break;
            case 35:
                next.color = "#7c3aed";
                break;
            case 36:
                next.color = "#0891b2";
                break;
            case 37:
                next.color = "#e5e7eb";
                break;
            case 90:
                next.color = "#9ca3af";
                break;
            case 91:
                next.color = "#f97373";
                break;
            case 92:
                next.color = "#4ade80";
                break;
            case 93:
                next.color = "#facc15";
                break;
            case 94:
                next.color = "#60a5fa";
                break;
            case 95:
                next.color = "#a855f7";
                break;
            case 96:
                next.color = "#22d3ee";
                break;
            case 97:
                next.color = "#f9fafb";
                break;
        }
    }

    return next;
}

function renderAnsi(output: string) {
    if (!output) {
        return null;
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let state: AnsiStyleState = {};
    let key = 0;

    while ((match = ANSI_PATTERN.exec(output)) !== null) {
        if (match.index > lastIndex) {
            const text = output.slice(lastIndex, match.index);
            if (text) {
                nodes.push(
                    <span key={key++} style={state}>
                        {text}
                    </span>,
                );
            }
        }

        const codes = match[1]
            .split(";")
            .map((c) => Number.parseInt(c, 10))
            .filter((n) => !Number.isNaN(n));

        state = ansiCodesToStyle(state, codes);
        lastIndex = ANSI_PATTERN.lastIndex;
    }

    if (lastIndex < output.length) {
        const text = output.slice(lastIndex);
        if (text) {
            nodes.push(
                <span key={key++} style={state}>
                    {text}
                </span>,
            );
        }
    }

    return nodes;
}

function EditorContent() {
    const [output, setOutput] = React.useState("");
    const [outputOpen, setOutputOpen] = React.useState(false);

    const { ready, run } = useBallerina();
    const { toggleSidebar } = useSidebar();

    const selectedFile = useSelectedFile();
    const selectedFilePath = useFileStore((s) => s.selectedFilePath);
    const updateFileContent = useFileStore((s) => s.updateFile);

    const handleRun = React.useCallback(() => {
        if (
            !selectedFile ||
            languageFromFileName(selectedFile.name) !== "ballerina"
        )
            return;
        if (!selectedFilePath) return;

        const oldConsole = console.log;
        let captured = "";

        console.log = (...args) => {
            captured += args.join(" ") + "\n";
            oldConsole.apply(console, args);
        };

        try {
            const projectPath = projectPathFromFilePath(selectedFilePath);
            const result = run(projectPath);
            if (result?.error) {
                captured += result.error + "\n";
            }
        } finally {
            console.log = oldConsole;
        }

        setOutput(captured);
        setOutputOpen(true);
    }, [selectedFile, selectedFilePath, run]);

    useHotkeys(
        "mod+enter",
        (e) => {
            e.preventDefault();
            handleRun();
        },
        {
            enableOnFormTags: ["TEXTAREA"],
            preventDefault: true,
        },
    );

    useHotkeys(
        "mod+shift+e",
        (e) => {
            e.preventDefault();
            toggleSidebar();
        },
        {
            enableOnFormTags: true,
            preventDefault: true,
        },
    );

    if (!ready) {
        return (
            <div className="w-full flex items-center justify-center min-h-dvh">
                <div className="text-sm text-muted-foreground">
                    Getting Ready!
                </div>
            </div>
        );
    }

    return (
        <>
            <AppSidebar />
            <SidebarInset className="flex flex-col h-dvh overflow-hidden">
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
                    <div className="flex items-center gap-4">
                        <SidebarTrigger className="-ml-1" />
                        <h1 className="text-sm font-medium">
                            Ballerina Playground
                        </h1>
                    </div>
                    <div>
                        <a
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-secondary-foreground"
                            href="https://github.com/ballerina-platform/ballerina-lang-go"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <HugeiconsIcon
                                icon={GithubFreeIcons}
                                strokeWidth={1.5}
                                size={16}
                            />
                            <span>GitHub</span>
                        </a>
                    </div>
                </header>
                <main className="flex flex-col lg:flex-row flex-1 min-h-0">
                    <div
                        className={cn(
                            "flex flex-col lg:border-b-0 lg:border-r min-h-0",
                            "lg:w-1/2 lg:flex-none lg:h-full",
                            outputOpen ? "h-1/2" : "flex-1",
                        )}
                    >
                        <div className="flex h-10 shrink-0 items-center justify-between border-b">
                            <span className="px-4 h-full text-xs border-r flex items-center truncate max-w-[60%]">
                                {selectedFile?.name || "No file selected"}
                            </span>
                            <Button
                                className="h-full rounded-none"
                                variant="ghost"
                                onClick={handleRun}
                                disabled={
                                    !selectedFile ||
                                    languageFromFileName(selectedFile.name) !==
                                        "ballerina"
                                }
                            >
                                <HugeiconsIcon
                                    icon={PlayIcon}
                                    strokeWidth={1.5}
                                />
                                <span>Run</span>
                            </Button>
                        </div>
                        <MinimalEditor
                            className="flex-1 min-h-0 w-full"
                            value={selectedFile?.content}
                            onChange={(c) => {
                                if (!selectedFilePath) return;
                                updateFileContent(selectedFilePath, c);
                            }}
                            language={
                                selectedFile
                                    ? languageFromFileName(selectedFile.name)
                                    : undefined
                            }
                        />
                    </div>
                    <div
                        className={cn(
                            "flex flex-col min-h-0 min-w-0",
                            "lg:w-1/2 lg:flex-none",
                            outputOpen ? "flex-1 lg:flex" : "shrink-0 lg:flex",
                        )}
                    >
                        <div className="flex h-10 shrink-0 items-center justify-between border-b border-t lg:border-t-0">
                            <div className="flex items-center h-full">
                                <span className="px-4 h-full text-xs text-muted-foreground flex items-center">
                                    Output
                                </span>
                            </div>
                            <div className="flex items-center h-full">
                                <Button
                                    className="h-full border-l lg:hidden"
                                    variant="ghost"
                                    onClick={() =>
                                        setOutputOpen((prev) => !prev)
                                    }
                                >
                                    <HugeiconsIcon
                                        icon={
                                            outputOpen ? ChevronDown : ChevronUp
                                        }
                                        strokeWidth={1.5}
                                    />
                                    <span className="text-xs">
                                        {outputOpen
                                            ? "Minimize"
                                            : "Show Output"}
                                    </span>
                                </Button>
                                <Button
                                    className="h-full border-l"
                                    variant="ghost"
                                    onClick={() => setOutput("")}
                                >
                                    <HugeiconsIcon
                                        icon={CleanIcon}
                                        strokeWidth={1.5}
                                    />
                                    <span className="hidden sm:inline">
                                        Clear
                                    </span>
                                </Button>
                            </div>
                        </div>
                        <div
                            className={cn(
                                "min-h-0 overflow-y-auto p-4",
                                outputOpen
                                    ? "flex-1"
                                    : "hidden lg:block lg:flex-1",
                            )}
                        >
                            <pre className="text-[13px] font-sans whitespace-pre-wrap wrap-break-word">
                                {renderAnsi(output)}
                            </pre>
                        </div>
                    </div>
                </main>
            </SidebarInset>
        </>
    );
}

export function Editor() {
    return (
        <SidebarProvider>
            <EditorContent />
        </SidebarProvider>
    );
}
