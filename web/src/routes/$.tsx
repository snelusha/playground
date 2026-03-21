import { createFileRoute } from "@tanstack/react-router";

import { FileRouteSync } from "@/components/file-route-sync";
import { Editor } from "@/components/editor";
import { ShareLinkHandler } from "@/components/share-link-handler";
import { TooltipProvider } from "@/components/ui/tooltip";

import { parseShareSearch } from "@/lib/share/share-search";

import { FSProvider } from "@/providers/fs-provider";

export const Route = createFileRoute("/$")({
	validateSearch: parseShareSearch,
	component: SplatComponent,
});

function SplatComponent() {
	return (
		<TooltipProvider>
			<FSProvider>
				<FileRouteSync>
					<ShareLinkHandler>
						<Editor />
					</ShareLinkHandler>
				</FileRouteSync>
			</FSProvider>
		</TooltipProvider>
	);
}
