import type { ReactNode } from "react";

import { useShareImport } from "@/hooks/share";

export function ShareLinkHandler({ children }: { children: ReactNode }) {
	const error = useShareImport();

	return (
		<>
			{error ? (
				<div
					role="alert"
					className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
				>
					{error}
				</div>
			) : null}
			{children}
		</>
	);
}
