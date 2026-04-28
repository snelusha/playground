import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { useEditorStore } from "@/stores/editor-store";
import { useFileTreeStore } from "@/stores/file-tree-store";
import { useFS } from "@/providers/fs-provider";

export function EditorSettingsDialog() {
	const fs = useFS();
	const editorMode = useEditorStore((s) => s.editorMode);
	const setEditorMode = useEditorStore((s) => s.setEditorMode);

	const [isSettingsOpen, setSettingsOpen] = React.useState(false);
	const [isConfirmOpen, setConfirmOpen] = React.useState(false);

	const handleModeChange = (value: string[]) => {
		const mode = value[0];
		if (!mode || (mode !== "standard" && mode !== "vim")) return;
		setEditorMode(mode);
	};

	const handleConfirmClear = () => {
		fs.clearLocal();
		useFileTreeStore.setState((state) => ({
			localTree: fs.localTree(),
			activeFile: state.activeFile?.path.startsWith("/local/")
				? null
				: state.activeFile,
		}));
		setConfirmOpen(false);
		setSettingsOpen(false);
	};

	return (
		<>
			<Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Open settings"
					onClick={() => setSettingsOpen(true)}
				>
					<HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={1.5} />
				</Button>
				<DialogContent showCloseButton>
					<DialogHeader>
						<DialogTitle>Settings</DialogTitle>
						<DialogDescription>
							Choose editor behavior and manage Local FS data.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">Editor mode</span>
						<ToggleGroup
							value={[editorMode]}
							onValueChange={handleModeChange}
							aria-label="Editor mode"
						>
							<ToggleGroupItem value="standard">Normal</ToggleGroupItem>
							<ToggleGroupItem value="vim">VIM</ToggleGroupItem>
						</ToggleGroup>
					</div>

					<div className="border-t pt-4">
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onClick={() => setConfirmOpen(true)}
						>
							<HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />
							Clear Local FS
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Clear Local FS?</DialogTitle>
						<DialogDescription>
							This will remove all locally persisted files from this browser.
							This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleConfirmClear}
						>
							Clear
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
