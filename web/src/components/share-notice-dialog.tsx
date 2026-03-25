import * as React from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import { GitForkIcon, MoreVerticalIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import type { IconSvgElement } from "@hugeicons/react";

function InlineIcon({ icon }: { icon: IconSvgElement }) {
	return (
		<span className="inline-flex items-center gap-0.5 align-middle -translate-y-px text-foreground">
			<HugeiconsIcon
				icon={icon}
				className="size-3.5 shrink-0"
				strokeWidth={1.5}
			/>
		</span>
	);
}

interface ShareNoticeDialogProps {
	open: boolean;
	onDismiss: () => void;
	onDismissPermanently: () => void;
}

export function ShareNoticeDialog({
	open,
	onDismiss,
	onDismissPermanently,
}: ShareNoticeDialogProps) {
	const [permanent, setPermanent] = React.useState(false);

	const handleDismiss = () =>
		permanent ? onDismissPermanently() : onDismiss();

	return (
		<Dialog
			key={String(open)}
			open={open}
			onOpenChange={(next) => !next && handleDismiss()}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Shared files are temporary</DialogTitle>
					<DialogDescription>
						Files opened from a share link are stored in a temporary workspace
						and will be lost when the session ends.
					</DialogDescription>
				</DialogHeader>

				<p className="text-xs/relaxed text-muted-foreground">
					To save a copy to your Localspace, open the row menu (
					<InlineIcon icon={MoreVerticalIcon} />) next to any file or folder in
					the sidebar and choose <InlineIcon icon={GitForkIcon} /> Fork.
				</p>

				<div className="flex items-center gap-2">
					<Checkbox
						id="share-notice-permanent"
						checked={permanent}
						onCheckedChange={(v) => setPermanent(v === true)}
					/>
					<label
						htmlFor="share-notice-permanent"
						className="cursor-pointer text-xs text-muted-foreground"
					>
						Don&apos;t show this again
					</label>
				</div>

				<DialogFooter className="sm:justify-end">
					<Button type="button" variant="outline" onClick={handleDismiss}>
						Got it
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
