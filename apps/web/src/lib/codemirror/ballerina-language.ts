import { StreamLanguage } from "@codemirror/language";
import { clike } from "@codemirror/legacy-modes/mode/clike";

function words(str: string): Record<string, boolean> {
	const obj: Record<string, boolean> = {};
	for (const w of str.trim().split(/\s+/)) {
		if (w) obj[w] = true;
	}
	return obj;
}

/**
 * Triple double-quoted string (`"""`), multiline; `${ ... }` regions are skipped.
 * Mirrors the Kotlin legacy mode behavior used by `clike`.
 */
function tokenTripleDoubleString(
	stream: {
		eol: () => boolean;
		match: (pattern: RegExp | string) => string[] | null | boolean;
		next: () => string | null;
		skipTo: (ch: string) => boolean;
	},
	state: { tokenize: unknown },
) {
	let escaped = false;
	let end = false;
	while (!stream.eol()) {
		if (stream.match('"""')) {
			end = true;
			break;
		}
		const next = stream.next();
		if (next != null && !escaped && next === "$" && stream.match("{")) {
			stream.skipTo("}");
		}
		escaped = !escaped && next === "\\";
	}
	if (end) state.tokenize = null;
	return "string";
}

/** Ballerina string template `` `...` `` with `${ ... }` interpolation. */
function tokenBacktickString(
	stream: {
		eol: () => boolean;
		next: () => string | null;
		peek: () => string | null;
	},
	state: { tokenize: unknown },
) {
	let escaped = false;
	while (!stream.eol()) {
		const ch = stream.next();
		if (ch === "`" && !escaped) {
			state.tokenize = null;
			break;
		}
		if (ch === "$" && stream.peek() === "{") {
			stream.next();
			let depth = 1;
			while (depth > 0 && !stream.eol()) {
				const c = stream.next();
				if (c === "{") depth++;
				else if (c === "}") depth--;
			}
		}
		escaped = ch === "\\";
	}
	return "string";
}

const ballerinaMode = clike({
	name: "ballerina",
	keywords: words(
		"public private remote abstract client import function const listener service xmlns annotation " +
			"type record object as on resource final source worker parameter field isolated " +
			"returns return external if else while check checkpanic panic continue break typeof is " +
			"lock fork trap in foreach table key let new from where select start flush configurable wait " +
			"do transaction transactional commit rollback retry enum base16 base64 match conflict limit " +
			"join outer equals class order by ascending descending natural re group collect",
	),
	types: words(
		"int byte float decimal string boolean xml json handle any anydata never var map future " +
			"typedesc error stream readonly distinct fail",
	),
	blockKeywords: words(
		"function service if else while foreach match transaction lock class record enum object listener type " +
			"try",
	),
	defKeywords: words(
		"function type class record listener const service object var let enum",
	),
	atoms: words("true false null"),
	multiLineStrings: true,
	isOperatorChar: /[+\-*&%=<>!?|^~/]/,
	hooks: {
		"@"(stream: { eatWhile: (r: RegExp) => void }) {
			stream.eatWhile(/[\w$]/);
			return "meta";
		},
		'"'(
			stream: Parameters<typeof tokenTripleDoubleString>[0],
			state: { tokenize: unknown },
		) {
			if (stream.match('""')) {
				state.tokenize = tokenTripleDoubleString;
				return tokenTripleDoubleString(stream, state);
			}
			return false;
		},
		"`"(
			stream: Parameters<typeof tokenBacktickString>[0],
			state: { tokenize: unknown },
		) {
			state.tokenize = tokenBacktickString;
			return tokenBacktickString(stream, state);
		},
	},
	languageData: {
		closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
		commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
	},
} as Parameters<typeof clike>[0] & {
	defKeywords: Record<string, boolean>;
	languageData: Record<string, unknown>;
});

export const ballerinaLanguage = StreamLanguage.define(ballerinaMode);
