import { createFileRoute } from "@tanstack/react-router";

import { FSProvider } from "@/providers/fs-provider";

import { FileRouteSync } from "@/components/file-route-sync";
import { Editor } from "@/components/editor";

export const Route = createFileRoute("/$")({
	validateSearch: (search: Record<string, unknown>) => {
		const share = search.share;
		const gist = search.gist;

		const out: Record<string, string> = {};
		if (typeof share === "string" && share.trim()) out.share = share.trim();
		if (typeof gist === "string" && gist.trim()) out.gist = gist.trim();
		return out;
	},
	component: SplatComponent,
});

function SplatComponent() {
	return (
		<FSProvider>
			<FileRouteSync>
				<Editor />
			</FileRouteSync>
		</FSProvider>
	);
}
