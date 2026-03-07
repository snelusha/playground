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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar";

import {
    useActiveFilePath,
    useFileTreeActions,
    useLocalTree,
    useTempTree,
} from "@/stores/file-tree-store";

import { useIsMobile } from "@/hooks/use-mobile";

import type { FileNode } from "@/lib/fs/core/file-node.types";

function SidebarCreateMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="self-end"
                render={<Button variant="ghost" />}
            >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuItem>New File</DropdownMenuItem>
                    <DropdownMenuItem>New Project</DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type FileTreeNodeProps = {
    node: FileNode;
    path: string;
    defaultOpen?: boolean;
};

function FileTreeFileNode({ node, path }: FileTreeNodeProps) {
    const isMobile = useIsMobile();
    const { toggleSidebar } = useSidebar();
    const activeFilePath = useActiveFilePath();
    const { openFile } = useFileTreeActions();

    function handleClick() {
        openFile(path);
        if (isMobile) toggleSidebar();
    }

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                isActive={activeFilePath === path}
                onClick={handleClick}
            >
                <HugeiconsIcon icon={File01Icon} strokeWidth={1.5} />
                {node.name}
            </SidebarMenuButton>
            <SidebarMenuAction onClick={() => console.log(path)}>
                S
            </SidebarMenuAction>
        </SidebarMenuItem>
    );
}

type FileTreeDirNodeProps = {
    node: Extract<FileNode, { kind: "dir" }>;
    path: string;
    defaultOpen?: boolean;
};

function FileTreeDirNode({
    node,
    path,
    defaultOpen = false,
}: FileTreeDirNodeProps) {
    const activeFilePath = useActiveFilePath();

    return (
        <SidebarMenuItem>
            <Collapsible
                defaultOpen={defaultOpen}
                className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
            >
                <CollapsibleTrigger render={<SidebarMenuButton />}>
                    <HugeiconsIcon icon={ChevronDown} strokeWidth={1.5} />
                    <HugeiconsIcon icon={FolderIcon} strokeWidth={1.5} />
                    <span className="truncate">{node.name}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub className="mx-0 px-0 pl-3.5">
                        {node.children.map((child) => {
                            const childPath = `${path}/${child.name}`;
                            return (
                                <FileTreeNode
                                    key={child.name}
                                    node={child}
                                    path={childPath}
                                    defaultOpen={
                                        !!activeFilePath &&
                                        activeFilePath.startsWith(
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

function FileTreeNode({ node, path, defaultOpen }: FileTreeNodeProps) {
    if (node.kind === "file")
        return <FileTreeFileNode node={node} path={path} />;
    return (
        <FileTreeDirNode node={node} path={path} defaultOpen={defaultOpen} />
    );
}

type FileTreeGroupProps = {
    label: string;
    nodes: FileNode[];
    basePath: string;
};

function FileTreeGroup({ label, nodes, basePath }: FileTreeGroupProps) {
    const activeFilePath = useActiveFilePath();
    return (
        <SidebarGroup>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarGroupContent className="mt-2">
                <SidebarMenu>
                    {nodes.map((node, index) => {
                        const path = `${basePath}/${node.name}`;
                        return (
                            <FileTreeNode
                                key={node.name}
                                node={node}
                                path={path}
                                defaultOpen={
                                    index === 0 ||
                                    !!activeFilePath?.startsWith(path + "/")
                                }
                            />
                        );
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const tempTree = useTempTree();
    const localTree = useLocalTree();

    return (
        <Sidebar {...props}>
            <SidebarHeader>
                <SidebarCreateMenu />
            </SidebarHeader>
            <SidebarContent>
                <FileTreeGroup
                    label="Examples"
                    nodes={tempTree}
                    basePath="/tmp"
                />
                {!!localTree.length && (
                    <>
                        <SidebarSeparator />
                        <FileTreeGroup
                            label="Local"
                            nodes={localTree}
                            basePath="/local"
                        />
                    </>
                )}
            </SidebarContent>
        </Sidebar>
    );
}
