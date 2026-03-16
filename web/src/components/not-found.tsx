import { Link } from "@tanstack/react-router";

export function NotFound({ path }: { path: string }) {
	return (
		<div className="flex flex-col items-center justify-center min-h-dvh gap-4 p-6">
			<h1 className="text-2xl font-semibold text-foreground">
				File not found
			</h1>
			<p className="text-muted-foreground text-center max-w-md">
				The file <code className="px-1.5 py-0.5 rounded bg-muted">{path}</code>{" "}
				does not exist in the workspace.
			</p>
			<Link
				to="/tmp/01-orders.bal"
				className="text-primary hover:underline font-medium"
			>
				Go to home
			</Link>
		</div>
	);
}
