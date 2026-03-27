import { createFileRoute } from "@tanstack/react-router";

import { FSProvider } from "@/providers/fs-provider";

import { FileRouteSync } from "@/components/file-route-sync";
import { Editor } from "@/components/editor";

export const Route = createFileRoute("/$")({
	validateSearch: (search: Record<string, unknown>) => {
		const share = search.share;
		if (typeof share !== "string" || !share.trim()) return {};
		return { share: share.trim() };
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
