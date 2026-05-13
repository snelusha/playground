// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escapes for JSON probing
const ANSI_STRIP = /\x1b\[[0-9;]*m/g;

function stripAnsi(value: string): string {
	return value.replace(ANSI_STRIP, "");
}

/**
 * If the output is a single JSON value (object, array, string, number, etc.),
 * returns a pretty-printed form. Otherwise returns the original string.
 * ANSI sequences are ignored when deciding whether the payload is JSON.
 */
export function prettifyOutputIfJson(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return value;

	const withoutAnsi = stripAnsi(trimmed);
	try {
		const parsed = JSON.parse(withoutAnsi);
		const pretty = JSON.stringify(parsed, null, 2);
		const endsWithNewline = /\r?\n$/.test(value);
		return pretty + (endsWithNewline ? "\n" : "");
	} catch {
		return value;
	}
}
