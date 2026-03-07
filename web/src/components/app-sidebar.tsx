import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import {
    FolderIcon,
    File01Icon,
    ChevronDown,
    PlusSignIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    useSidebar,
    sidebarMenuButtonVariants,
    SidebarSeparator,
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/use-mobile";

import {
    useTempTree,
    useLocalTree,
    useActiveFile,
    useFileTreeStore,
} from "@/stores/file-tree-store";

import { cn } from "@/lib/utils";

import type { FileNode } from "@/lib/fs/core/file-node.types";

const TEMP_PREFIX = "/tmp";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const tempTree = useTempTree();
    const localTree = useLocalTree();
    const activeFile = useActiveFile();
    const createEmptyFile = useFileTreeStore((s) => s.createEmptyFile);

    const selectedFilePath = activeFile?.path ?? null;
    const examples = tempTree;
    const others = localTree;

    return (
        <Sidebar {...props}>
            <SidebarContent>
                <SidebarGroup>
                    <div className="flex items-center justify-between">
                        <SidebarGroupLabel>Examples</SidebarGroupLabel>
                        <Button
                            className="h-full rounded-none"
                            variant="ghost"
                            onClick={() => createEmptyFile()}
                            title="New File"
                        >
                            <HugeiconsIcon
                                icon={PlusSignIcon}
                                strokeWidth={1.5}
                            />
                        </Button>
                    </div>
                    <SidebarGroupContent className="mt-2">
                        <SidebarMenu>
                            {examples.map((node, index) => (
                                <TreeNode
                                    key={node.name}
                                    node={node}
                                    path={`${TEMP_PREFIX}/${node.name}`}
                                    defaultOpen={
                                        index === 0 ||
                                        (!!selectedFilePath &&
                                            selectedFilePath.startsWith(
                                                `${TEMP_PREFIX}/${node.name}/`,
                                            ))
                                    }
                                />
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                {!!others.length && (
                    <>
                        <SidebarSeparator />
                        <SidebarGroup>
                            <SidebarGroupLabel>User Space</SidebarGroupLabel>
                            <SidebarGroupContent className="mt-2">
                                <SidebarMenu>
                                    {others.map((node, index) => (
                                        <TreeNode
                                            key={node.name}
                                            node={node}
                                            path={`/local/${node.name}`}
                                            defaultOpen={
                                                index === 0 ||
                                                (!!selectedFilePath &&
                                                    selectedFilePath.startsWith(
                                                        `/local/${node.name}/`,
                                                    ))
                                            }
                                        />
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </>
                )}
            </SidebarContent>
        </Sidebar>
    );
}

function TreeNode({
    node,
    path,
    defaultOpen = false,
}: {
    node: FileNode;
    path: string;
    defaultOpen?: boolean;
}) {
    const openFile = useFileTreeStore((s) => s.openFile);
    const selectedFilePath = useActiveFile()?.path ?? null;

    const isMobile = useIsMobile();
    const { toggleSidebar } = useSidebar();

    if (node.kind === "file") {
        return (
            <SidebarMenuButton
                isActive={selectedFilePath === path}
                onClick={() => {
                    openFile(path);
                    if (isMobile) toggleSidebar();
                }}
            >
                <HugeiconsIcon icon={File01Icon} strokeWidth={1.5} />
                <span className="break-keep">{node.name}</span>
            </SidebarMenuButton>
        );
    }

    return (
        <SidebarMenuItem>
            <Collapsible
                defaultOpen={defaultOpen}
                className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
            >
                <CollapsibleTrigger
                    className={cn(sidebarMenuButtonVariants(), "w-full")}
                >
                    <HugeiconsIcon icon={ChevronDown} strokeWidth={1.5} />
                    <HugeiconsIcon icon={FolderIcon} strokeWidth={1.5} />
                    <span className="break-keep">{node.name}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {node.children.map((child) => {
                            const childPath = `${path}/${child.name}`;
                            return (
                                <TreeNode
                                    key={child.name}
                                    node={child}
                                    path={childPath}
                                    defaultOpen={
                                        !!selectedFilePath &&
                                        selectedFilePath.startsWith(
                                            childPath + "/",
                                        )
                                    }
                                />
                            );
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}
