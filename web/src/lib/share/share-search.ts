export type ShareSearch = {
	share?: string;
};

export function parseShareSearch(search: Record<string, unknown>): ShareSearch {
	const raw = search.share;
	if (typeof raw !== "string" || !raw.trim()) return {};
	return { share: raw };
}
