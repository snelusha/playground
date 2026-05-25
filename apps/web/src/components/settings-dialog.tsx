import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Field,
	FieldContent,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { toast } from "sonner";

import { useEditorStore } from "@/stores/editor-store";
import { useFileTreeActions, useLocalTree } from "@/stores/file-tree-store";

import type { EditorMode } from "@/stores/editor-store";

export function SettingsDialog() {
	const [open, setOpen] = React.useState(false);
	const [confirmingClear, setConfirmingClear] = React.useState(false);

	const localTree = useLocalTree();
	const editorMode = useEditorStore((s) => s.editorMode);
	const setEditorMode = useEditorStore((s) => s.setEditorMode);
	const { clearLocalspace } = useFileTreeActions();

	const hasLocalFiles = localTree.length > 0;

	async function handleClearLocalspace() {
		await clearLocalspace();
		setConfirmingClear(false);
		setOpen(false);
		toast.success("Local space cleared");
	}

	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) setConfirmingClear(false);
				}}
			>
				<DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
					<HugeiconsIcon
						data-icon="inline-start"
						icon={MoreVerticalIcon}
						strokeWidth={1.5}
					/>
					<span className="sr-only">Open settings</span>
				</DialogTrigger>
				<DialogContent>
					<SettingsContent
						editorMode={editorMode}
						hasLocalFiles={hasLocalFiles}
						onEditorModeChange={setEditorMode}
						onRequestClear={() => setConfirmingClear(true)}
					/>
				</DialogContent>
			</Dialog>

			<AlertDialog open={confirmingClear} onOpenChange={setConfirmingClear}>
				<AlertDialogContent>
					<ClearLocalspaceConfirmation
						onCancel={() => setConfirmingClear(false)}
						onConfirm={() => void handleClearLocalspace()}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function SettingsContent({
	editorMode,
	hasLocalFiles,
	onEditorModeChange,
	onRequestClear,
}: {
	editorMode: EditorMode;
	hasLocalFiles: boolean;
	onEditorModeChange: (mode: EditorMode) => void;
	onRequestClear: () => void;
}) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Settings</DialogTitle>
				<DialogDescription>Manage your preferences.</DialogDescription>
			</DialogHeader>

			<FieldGroup>
				<Field orientation="responsive">
					<FieldContent>
						<FieldLabel>Editor mode</FieldLabel>
					</FieldContent>
					<ToggleGroup
						variant="outline"
						value={[editorMode]}
						onValueChange={(value) => {
							const next = value[0] as EditorMode | undefined;
							if (next) onEditorModeChange(next);
						}}
					>
						<ToggleGroupItem
							value="standard"
							aria-label="Use normal editor mode"
						>
							Normal
						</ToggleGroupItem>
						<ToggleGroupItem value="vim" aria-label="Use Vim editor mode">
							Vim
						</ToggleGroupItem>
					</ToggleGroup>
				</Field>

				<Field orientation="responsive">
					<FieldContent>
						<FieldLabel>Local Storage</FieldLabel>
					</FieldContent>
					<Button
						variant="destructive"
						disabled={!hasLocalFiles}
						onClick={onRequestClear}
					>
						Clear all data
					</Button>
				</Field>
			</FieldGroup>
		</>
	);
}

function ClearLocalspaceConfirmation({
	onCancel,
	onConfirm,
}: {
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>Clear local space?</AlertDialogTitle>
				<AlertDialogDescription>
					This deletes all local files saved in this browser.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
				<AlertDialogAction variant="destructive" onClick={onConfirm}>
					Clear local space
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
