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
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/use-mobile";

import { useFileStore } from "@/stores/file-store";

import type { FileNode, FilePath } from "@/types/files";
import { cn } from "@/lib/utils";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const tree = useFileStore((s) => s.tree);
    const selectedFilePath = useFileStore((s) => s.selectedFilePath);

    return (
        <Sidebar {...props}>
            <SidebarContent>
                <SidebarGroup>
                    <div className="flex items-center justify-between">
                        <SidebarGroupLabel>Files</SidebarGroupLabel>
                        <Button
                            className="h-full rounded-none"
                            variant="ghost"
                            onClick={() => {}}
                            title="New project"
                        >
                            <HugeiconsIcon
                                icon={PlusSignIcon}
                                strokeWidth={1.5}
                            />
                        </Button>
                    </div>
                    <SidebarGroupContent className="mt-2">
                        <SidebarMenu>
                            {tree.map((node, index) => (
                                <TreeNode
                                    key={node.name}
                                    node={node}
                                    path={node.name}
                                    defaultOpen={
                                        index === 0 ||
                                        (!!selectedFilePath &&
                                            selectedFilePath.startsWith(
                                                node.name + "/",
                                            ))
                                    }
                                />
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
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
    path: FilePath;
    defaultOpen?: boolean;
}) {
    const selectFile = useFileStore((s) => s.selectFile);
    const selectedFilePath = useFileStore((s) => s.selectedFilePath);

    const isMobile = useIsMobile();
    const { toggleSidebar } = useSidebar();

    if (node.kind === "file") {
        return (
            <SidebarMenuButton
                isActive={selectedFilePath === path}
                onClick={() => {
                    selectFile(path);
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
